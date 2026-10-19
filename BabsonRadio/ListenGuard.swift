import Combine
import SwiftUI
import UIKit

// Keeps the station within its monthly listener hours (see /api/listen on the server). Asks before playing, checks in
// every minute while playing, asks "Still listening?" after a stretch with no activity, and
// stops the stream when the server says to. If the server can't be reached, listening carries on.

@MainActor
final class ListenGuard: ObservableObject {
    static let shared = ListenGuard()

    @Published var asking = false
    @Published var notice: String?
    /// Set when the account is already playing on another device (the person can switch to this one).
    @Published var elsewhere: String?

    private nonisolated struct Reply: Decodable { let ok: Bool; let reason: String?; let message: String?; let idleMin: Int? }

    private var sessionId = ""
    private var lastActive = Date()
    private var lastBeat = Date()
    private var idleMin = 60
    private var askedAt: Date?
    private var loop: Task<Void, Never>?
    private let promptSeconds: TimeInterval = 120
    /// Stable for this install, so reopening the app isn't mistaken for a second device.
    private static let deviceId: String = {
        if let id = UserDefaults.standard.string(forKey: "br_device_id") { return id }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: "br_device_id")
        return id
    }()

    /// Any touch or the app coming forward counts as being there.
    func markActive() { lastActive = Date(); askedAt = nil; asking = false }

    /// Call before starting the stream. False (with a notice) when listening isn't allowed right now.
    func begin(takeOver: Bool = false) async -> Bool {
        notice = nil; elsewhere = nil
        guard AuthManager.shared.isSignedIn else { return true }
        sessionId = UUID().uuidString
        lastActive = Date(); lastBeat = Date(); askedAt = nil
        do {
            let r: Reply = try await BackendAPI.post("/api/listen", ["action": "start", "sessionId": sessionId, "device": "ios", "deviceId": Self.deviceId, "takeOver": takeOver])
            if !r.ok {
                if r.reason == "elsewhere" { elsewhere = r.message ?? "You are already listening on another device. Switch to this one?" }
                else { notice = r.message ?? "Listening is paused right now." }
                sessionId = ""; return false
            }
            if let m = r.idleMin { idleMin = m }
        } catch { /* offline or a server hiccup: let them listen */ }
        loop?.cancel()
        loop = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                await self?.tick()
            }
        }
        return true
    }

    /// Call when playback stops for any reason.
    func end() {
        loop?.cancel(); loop = nil
        if !sessionId.isEmpty, AuthManager.shared.isSignedIn {
            let id = sessionId
            Task { let _: EmptyResponse? = try? await BackendAPI.post("/api/listen", ["action": "stop", "sessionId": id]) }
        }
        sessionId = ""; asking = false; askedAt = nil
    }

    private func halt(_ message: String) {
        AudioPlayerManager.shared.stop()   // also ends the session
        notice = message
    }

    private func tick() async {
        guard AudioPlayerManager.shared.isPlaying else { end(); return }
        let now = Date()
        let idleFor = now.timeIntervalSince(lastActive)
        if askedAt == nil, idleFor >= Double(idleMin) * 60 { askedAt = now; asking = true }
        if let a = askedAt, now.timeIntervalSince(a) >= promptSeconds {
            halt("Stopped because no one seemed to be listening. Tap play to start again."); return
        }
        guard now.timeIntervalSince(lastBeat) >= 30, !sessionId.isEmpty else { return }
        lastBeat = now
        let id = sessionId
        if let r: Reply = try? await BackendAPI.post("/api/listen", ["action": "beat", "sessionId": id, "activeAgoSec": Int(idleFor)]) {
            if !r.ok { halt(r.message ?? "Listening stopped.") } else if let m = r.idleMin { idleMin = m }
        }
    }
}

/// Lets the guard know about every touch anywhere in the app, without getting in the way of the touch.
enum ActivityMonitor {
    private static var installed = false
    private final class Handler: NSObject, UIGestureRecognizerDelegate {
        static let shared = Handler()
        @objc func fire(_ g: UILongPressGestureRecognizer) {
            if g.state == .began { Task { @MainActor in ListenGuard.shared.markActive() } }
        }
        func gestureRecognizer(_ a: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith b: UIGestureRecognizer) -> Bool { true }
    }
    @MainActor static func install() {
        guard !installed else { return }
        guard let w = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { install() }
            return
        }
        installed = true
        let g = UILongPressGestureRecognizer(target: Handler.shared, action: #selector(Handler.fire(_:)))
        g.minimumPressDuration = 0
        g.cancelsTouchesInView = false
        g.delaysTouchesBegan = false
        g.delaysTouchesEnded = false
        g.delegate = Handler.shared
        w.addGestureRecognizer(g)
    }
}
