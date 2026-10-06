import Foundation
import Combine

// MARK: - Presence ("tuned in")
// The server decides what each person may see: everyone gets an anonymous count; verified students
// also get first names of connected contacts who are tuned in and NOT in invisible mode.
// While audio plays we send a heartbeat every 60s so the server knows we're listening.

nonisolated struct PresenceFriend: Identifiable, Decodable {
    let uid: String
    let firstName: String
    var id: String { uid }
}

nonisolated struct PresenceResponse: Decodable {
    let count: Int
    let friends: [PresenceFriend]
}

class PresenceManager: ObservableObject {
    static let shared = PresenceManager()

    @Published var count = 0
    @Published var friends: [PresenceFriend] = []

    private var pollTimer: Timer?
    private var heartbeatTimer: Timer?
    private var cancellables = Set<AnyCancellable>()
    private var started = false
    private var wasListening = false

    private init() {}

    func start() {
        guard !started else { return }
        started = true

        AudioPlayerManager.shared.$isPlaying
            .removeDuplicates()
            .sink { [weak self] playing in self?.playingChanged(playing) }
            .store(in: &cancellables)

        AuthManager.shared.$isSignedIn
            .removeDuplicates()
            .sink { [weak self] _ in self?.refresh() }
            .store(in: &cancellables)

        pollTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        refresh()
    }

    func refresh() {
        Task {
            if let r: PresenceResponse = try? await BackendAPI.get("/api/presence") {
                count = r.count
                friends = r.friends
            }
        }
    }

    private func playingChanged(_ playing: Bool) {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        if playing {
            wasListening = true
            beat(true)
            heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.beat(true) }
            }
        } else if wasListening {
            wasListening = false
            beat(false)
        }
    }

    private func beat(_ listening: Bool) {
        guard AuthManager.shared.isSignedIn else { return }
        Task {
            let _: EmptyResponse? = try? await BackendAPI.post("/api/presence", ["listening": listening])
            refresh()
        }
    }

    /// "Maya is tuned in" / "Maya and Jo are tuned in" / "Maya, Jo and 2 more you know are tuned in"
    var friendsLine: String? {
        switch friends.count {
        case 0:  return nil
        case 1:  return "\(friends[0].firstName) is tuned in"
        case 2:  return "\(friends[0].firstName) and \(friends[1].firstName) are tuned in"
        default: return "\(friends[0].firstName), \(friends[1].firstName) and \(friends.count - 2) more you know are tuned in"
        }
    }
}
