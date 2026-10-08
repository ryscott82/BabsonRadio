import SwiftUI
import Combine
import UserNotifications
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

// MARK: - Push notifications for admins
// An admin turns notifications on from the Admin screen. The phone gets a Firebase Cloud Messaging token,
// sends it to the server together with the kinds of news it wants, and the server pushes to it.
//
// Needs (see PUSH_SETUP.md): the FirebaseMessaging package product, the Push Notifications capability, and an
// APNs key uploaded to Firebase. Without them this compiles and the toggles say push is not set up yet.

enum PushKind: String, CaseIterable, Identifiable {
    case reports, requests, cancellations, testers, ops
    var id: String { rawValue }
    var title: String {
        switch self {
        case .reports: return "Bug reports and ideas"
        case .requests: return "Show requests and change requests"
        case .cancellations: return "Cancelled shows"
        case .testers: return "Beta testers waiting for approval"
        case .ops: return "Station stopped or resumed by another admin"
        }
    }
}

nonisolated private struct KindsReply: Decodable { let kinds: [String] }

@MainActor
final class PushManager: ObservableObject {
    static let shared = PushManager()

    @Published var kinds: Set<PushKind> = []
    @Published var status = ""
    @Published var busy = false

    /// Whether this build includes Firebase Messaging at all.
    static var available: Bool {
#if canImport(FirebaseMessaging)
        return true
#else
        return false
#endif
    }

    private var token = ""

    /// Look up this phone's current choices (does not ask for permission).
    func load() async {
#if canImport(FirebaseMessaging)
        guard let t = await fetchToken() else { return }
        token = t
        let q = t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t
        if let r: KindsReply = try? await BackendAPI.get("/api/admin/push?token=\(q)") {
            kinds = Set(r.kinds.compactMap(PushKind.init(rawValue:)))
        }
#endif
    }

    /// Turn a kind on or off. The first "on" asks iOS for permission.
    func set(_ kind: PushKind, on: Bool) async {
        var next = kinds
        if on { next.insert(kind) } else { next.remove(kind) }
        await save(next)
    }

    private func save(_ next: Set<PushKind>) async {
#if canImport(FirebaseMessaging)
        busy = true; status = ""
        defer { busy = false }
        if !next.isEmpty {
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            guard granted else { status = "Notifications are off for Babson Radio. Turn them on in Settings."; return }
            UIApplication.shared.registerForRemoteNotifications()
        }
        if token.isEmpty { token = await fetchToken() ?? "" }
        guard !token.isEmpty else {
            status = "Could not reach the notification service. Check push setup and try again."
            return
        }
        do {
            let r: KindsReply = try await BackendAPI.post("/api/admin/push", ["token": token, "kinds": next.map(\.rawValue)])
            kinds = Set(r.kinds.compactMap(PushKind.init(rawValue:)))
        } catch { status = (error as? BackendError)?.message ?? error.localizedDescription }
#else
        status = "Push is not set up in this build yet."
#endif
    }

#if canImport(FirebaseMessaging)
    /// The messaging token needs the APNs token first, which can take a moment after registering.
    private func fetchToken() async -> String? {
        for _ in 0..<6 {
            if let t = try? await Messaging.messaging().token(), !t.isEmpty { return t }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
        return nil
    }
#endif
}
