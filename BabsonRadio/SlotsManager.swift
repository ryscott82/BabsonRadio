import SwiftUI
import UserNotifications
import Foundation
import Combine

// MARK: - SlotsManager
// Loads the station schedule + the user's requests and submits/cancels requests.

class SlotsManager: ObservableObject {

    @Published var schedule: [AirSlot] = []
    @Published var myRequests: [SlotRequest] = []
    @Published var autoBlocks: [AutoBlock] = []
    @Published var feed: [ScheduleEntry] = []
    @Published var isLoading = false
    @Published var errorMessage: String? = nil

    /// Public (no sign-in needed): what the auto-scheduler has planned.
    func loadAuto() async {
        if let r: AutoBlocksResponse = try? await BackendAPI.get("/api/schedule/auto") { autoBlocks = r.blocks }
    }

    /// The whole schedule for the next week (public; students also see host names on student shows).
    func loadFeed() async {
        if let r: ScheduleFeedResponse = try? await BackendAPI.get("/api/schedule?days=7") {
            feed = r.items
            await ReminderManager.shared.update(feed: r.items, timezone: r.timezone)
        }
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        do {
            let schedule: SlotScheduleResponse = try await BackendAPI.get("/api/slots/schedule")
            let mine: MySlotRequestsResponse = try await BackendAPI.get("/api/slots/mine")
            self.schedule = schedule.slots
            self.myRequests = mine.requests
        } catch {
            errorMessage = (error as? BackendError)?.message ?? error.localizedDescription
        }
        isLoading = false
    }

    /// Throws a BackendError with a user-readable message if the server rejects the request.
    func submit(title: String, details: String, type: String, category: String,
                start: Date, durationMin: Int, audioURL: String, image: UploadedImage? = nil) async throws {
        let body: [String: Any] = [
            "title": title,
            "description": details,
            "type": type,
            "category": category,
            "startAt": Int(start.timeIntervalSince1970 * 1000),
            "durationMin": durationMin,
            "audioURL": audioURL,
            "imageUrl": image?.url ?? "",
            "imagePath": image?.path ?? "",
        ]
        let _: EmptyResponse = try await BackendAPI.post("/api/slots/request", body)
        await refresh()
    }

    func cancel(_ requestId: String) async {
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/slots/cancel", ["requestId": requestId])
            await refresh()
        } catch {
            errorMessage = (error as? BackendError)?.message ?? error.localizedDescription
        }
    }
}


// MARK: - Reminders (bells)
// On-device notifications 5 minutes before a show. Bells are saved on the account (so the website and the
// app agree) but the notifications themselves are scheduled here, on the phone: no push server needed.
// iOS allows 64 pending local notifications per app, so weekly shows use one repeating alert each and
// one-off items (student shows, genre blocks) only fill what's left.

@MainActor
final class ReminderManager: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = ReminderManager()

    @Published private(set) var keys: Set<String>
    @Published var notice: String?

    private var feed: [ScheduleEntry] = []
    private var timezone = TimeZone(identifier: "America/New_York") ?? .current
    private let storeKey = "br.reminders"
    private let lead: TimeInterval = 300
    private let maxPending = 60

    override init() {
        keys = Set(UserDefaults.standard.stringArray(forKey: "br.reminders") ?? [])
        super.init()
    }

    /// Call once at launch so reminders also show while the app is open.
    func start() { UNUserNotificationCenter.current().delegate = self }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func isOn(_ entry: ScheduleEntry) -> Bool { keys.contains(entry.reminderKey) }

    func toggle(_ entry: ScheduleEntry) async {
        let key = entry.reminderKey
        let on = !keys.contains(key)
        if on {
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
            if !granted {
                notice = "Turn on notifications for Babson Radio in Settings to get reminders."
                return
            }
            keys.insert(key)
        } else {
            keys.remove(key)
        }
        UserDefaults.standard.set(Array(keys), forKey: storeKey)
        await reschedule()
        if AuthManager.shared.currentUser != nil {
            let _: EmptyResponse? = try? await BackendAPI.post("/api/reminders", ["key": key, "on": on])
        }
    }

    /// Called whenever the schedule loads: pulls the account's bells, then rebuilds the notifications.
    func update(feed: [ScheduleEntry], timezone tz: String?) async {
        self.feed = feed
        if let tz, let zone = TimeZone(identifier: tz) { timezone = zone }
        if AuthManager.shared.currentUser != nil,
           let r: ReminderKeysResponse = try? await BackendAPI.get("/api/reminders") {
            keys = Set(r.keys)
            UserDefaults.standard.set(r.keys, forKey: storeKey)
        }
        await reschedule()
    }

    private func reschedule() async {
        let center = UNUserNotificationCenter.current()
        let existing = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix("br.") }
        center.removePendingNotificationRequests(withIdentifiers: existing)
        guard !keys.isEmpty else { return }

        var requests: [UNNotificationRequest] = []
        func make(_ id: String, _ title: String, _ trigger: UNNotificationTrigger) -> UNNotificationRequest {
            let c = UNMutableNotificationContent()
            c.title = title
            c.body = "Starts in 5 minutes on Babson Radio."
            c.sound = .default
            return UNNotificationRequest(identifier: id, content: c, trigger: trigger)
        }

        let upcoming = feed.filter { keys.contains($0.reminderKey) }.sorted { $0.startAt < $1.startAt }

        // Weekly shows: one repeating alert each, at the same weekday and time in the station's time zone.
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timezone
        var seen = Set<String>()
        for e in upcoming where e.source == "weekly" && seen.insert(e.reminderKey).inserted {
            var c = cal.dateComponents([.weekday, .hour, .minute], from: e.startAt.addingTimeInterval(-lead))
            c.timeZone = timezone
            requests.append(make("br.w.\(e.reminderKey)", e.title, UNCalendarNotificationTrigger(dateMatching: c, repeats: true)))
        }

        // Everything else: a single alert per item, soonest first, as many as fit.
        for e in upcoming where e.source != "weekly" {
            guard requests.count < maxPending else { break }
            let wait = e.startAt.addingTimeInterval(-lead).timeIntervalSinceNow
            if wait < 1 { continue }
            requests.append(make("br.o.\(e.id)", e.title, UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)))
        }

        for r in requests { try? await center.add(r) }
    }
}

nonisolated struct ReminderKeysResponse: Decodable { let keys: [String] }

struct BellButton: View {
    let entry: ScheduleEntry
    @ObservedObject private var reminders = ReminderManager.shared
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let on = reminders.isOn(entry)
        Button { Task { await reminders.toggle(entry) } } label: {
            Image(systemName: on ? "bell.fill" : "bell")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(on ? .brGold : (scheme == .dark ? .brDkSub : .brLtSub))
                .frame(width: 40, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(on ? "Turn off reminder for \(entry.title)" : "Remind me 5 minutes before \(entry.title)")
    }
}
