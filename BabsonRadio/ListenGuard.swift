import Combine
import SwiftUI
import UIKit

// Keeps the station within its monthly listener hours (see /api/listen on the server). Asks before playing, checks in
// every minute while playing, asks "Still listening?" after a stretch with no activity, runs the sleep timer, and
// stops the stream when the server says to. If the server can't be reached, listening carries on.

@MainActor
final class ListenGuard: ObservableObject {
    static let shared = ListenGuard()

    @Published var asking = false
    @Published var notice: String?
    @Published var sleepEnd: Date?

    private nonisolated struct Reply: Decodable { let ok: Bool; let message: String?; let idleMin: Int? }

    private var sessionId = ""
    private var lastActive = Date()
    private var lastBeat = Date()
    private var idleMin = 60
    private var askedAt: Date?
    private var loop: Task<Void, Never>?
    private let promptSeconds: TimeInterval = 120
    private let sleepOffKey = "br_sleep_off"

    /// Any touch or the app coming forward counts as being there.
    func markActive() { lastActive = Date(); askedAt = nil; asking = false }

    /// Call before starting the stream. False (with a notice) when listening isn't allowed right now.
    func begin() async -> Bool {
        notice = nil
        guard AuthManager.shared.isSignedIn else { return true }
        sessionId = UUID().uuidString
        lastActive = Date(); lastBeat = Date(); askedAt = nil
        do {
            let r: Reply = try await BackendAPI.post("/api/listen", ["action": "start", "sessionId": sessionId, "device": "ios"])
            if !r.ok { notice = r.message ?? "Listening is paused right now."; sessionId = ""; return false }
            if let m = r.idleMin { idleMin = m }
        } catch { /* offline or a server hiccup: let them listen */ }
        // After 10pm (and before 5am) a sleep timer starts on its own, so a stream isn't left running all night.
        let h = Calendar.current.component(.hour, from: Date())
        if (h >= 22 || h < 5), !UserDefaults.standard.bool(forKey: sleepOffKey) { sleepEnd = Date().addingTimeInterval(3600) }
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
        sessionId = ""; asking = false; askedAt = nil; sleepEnd = nil
    }

    func setSleep(_ minutes: Int?) {
        sleepEnd = minutes.map { Date().addingTimeInterval(Double($0) * 60) }
        UserDefaults.standard.set(minutes == nil, forKey: sleepOffKey)
    }

    private func halt(_ message: String) {
        AudioPlayerManager.shared.stop()   // also ends the session
        notice = message
    }

    private func tick() async {
        guard AudioPlayerManager.shared.isPlaying else { end(); return }
        let now = Date()
        if let s = sleepEnd, now >= s { halt("Sleep timer ended. Good night."); return }
        let idleFor = now.timeIntervalSince(lastActive)
        if askedAt == nil, idleFor >= Double(idleMin) * 60 { askedAt = now; asking = true }
        if let a = askedAt, now.timeIntervalSince(a) >= promptSeconds {
            halt("Stopped because no one seemed to be listening. Tap play to start again."); return
        }
        guard now.timeIntervalSince(lastBeat) >= 60, !sessionId.isEmpty else { return }
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

/// "Sleep timer" under the play button while playing.
struct SleepTimerRow: View {
    @ObservedObject private var guardian = ListenGuard.shared
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if audio.isPlaying && auth.isSignedIn {
            Menu {
                ForEach([15, 30, 60], id: \.self) { m in Button("\(m) minutes") { guardian.setSleep(m) } }
                if guardian.sleepEnd != nil { Button("Turn off", role: .destructive) { guardian.setSleep(nil) } }
            } label: {
                Label(guardian.sleepEnd.map { "Sleep timer: stops at \($0.formatted(date: .omitted, time: .shortened))" } ?? "Sleep timer", systemImage: "moon.zzz")
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
        }
    }
}
