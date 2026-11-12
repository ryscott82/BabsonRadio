import Foundation
import SwiftUI
import Combine

// MARK: - Members tab data (server: /api/me, /api/me/standing, /api/studio/*, /api/events/club, /api/recordings/mine)
// Everything loads when the screen appears and on pull to refresh. Nothing polls.

nonisolated struct TimeSpan: Decodable, Hashable { let startAt: Date; let endAt: Date }

nonisolated struct StudioRules: Decodable {
    let openHour: Int; let closeHour: Int; let stepMinutes: Int; let minMinutes: Int; let maxMinutes: Int
    let maxHolds: Int; let lookAheadDays: Int; let cancelHours: Int; let capacity: Int
}

/// Booked stretches (times only, no names), the quiet-hours stretches and the studio rules. /api/studio/open
nonisolated struct StudioGrid: Decodable {
    let ranges: [TimeSpan]
    let quietRanges: [TimeSpan]
    let warning: String?
    let rules: StudioRules
}

nonisolated struct GuestOut: Decodable, Hashable { let name: String }

nonisolated struct StudioBooking: Decodable, Identifiable, Hashable {
    let id: String
    let startAt: Date
    let endAt: Date
    let durationMin: Int
    let status: String          // booked | checked-in | cancelled | released ...
    let guests: [GuestOut]
    let justMe: Bool
    let quiet: Bool
}
nonisolated struct MyBookings: Decodable { let upcoming: [StudioBooking]; let past: [StudioBooking]; let held: Int; let maxHolds: Int }
nonisolated struct BookReply: Decodable { let id: String; let quiet: Bool?; let warning: String? }

nonisolated struct StandingLine: Decodable, Identifiable { let date: String; let reason: String; var id: String { date + reason } }
nonisolated struct Standing: Decodable {
    let level: Int              // 0 good, 1 mistake, 2 warning, 3 banned
    let label: String
    let bannedUntil: Date?
    let strikes: [StandingLine]
}

nonisolated struct ClubEvent: Decodable, Identifiable, Hashable {
    let id: String; let title: String; let startAt: Date; let endAt: Date; let place: String; let details: String
}
nonisolated struct ClubEventsReply: Decodable { let events: [ClubEvent] }

nonisolated struct TrainingSessionRow: Decodable, Identifiable {
    struct Mine: Decodable { let rsvp: Bool; let checkedIn: Bool }
    let id: String; let title: String; let covers: [String]; let startsAt: Date; let endsAt: Date
    let location: String; let capacity: Int; let rsvpCount: Int; let status: String; let me: Mine
}
nonisolated struct TrainingSessionsReply: Decodable { let sessions: [TrainingSessionRow] }

nonisolated struct RecordingRow: Decodable, Identifiable {
    let id: String; let title: String; let status: String; let durationSec: Int; let requestId: String; let createdAt: Date; let scheduled: Bool
}
nonisolated struct RecordingsReply: Decodable { let recordings: [RecordingRow] }

/// The few fields of /api/me that the Members tab needs (training badges and the E-board level).
nonisolated struct MyAccess: Decodable {
    struct Training: Decodable { let studioExpiresAt: Date?; let radioExpiresAt: Date?; let studioExpired: Bool; let radioExpired: Bool }
    let level: String
    let studioTrained: Bool
    let radioTrained: Bool
    let training: Training?
    var isEBoard: Bool { level == "director" || level == "admin" }
}

// MARK: - Plain wording (kept in one place so every screen says the same thing)

enum MembersText {
    static let walkIn = "You do not need a booking to use the studio when it is free. A booking just reserves it."
    static let quiet = "Quiet hours: no loud DJ sets, keep the volume as low as possible"
    static let policy = "I understand that a missed show or booking gets a mistake, then a warning, then a ban from hosting and booking for the rest of the semester. The E-board can excuse a mistake."
    static let infoRules = "Be kind. Keep it clean on air. Leave the studio tidy. Sign in on the studio PC when you arrive."
    static let infoClean = "Clean hours: shows on air must be free of explicit language, all day."
    static let infoQuiet = "Quiet hours: Mon to Fri 9 AM to 4 PM and 10 PM to 7 AM. Keep the volume low and skip loud DJ sets."
    static let infoContacts = "Questions? Ask the E-board, or use Report a bug in your profile."
}

// MARK: - Time helpers (the station runs on New York time)

enum StationTime {
    static let zone = TimeZone(identifier: "America/New_York") ?? .current
    static var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = zone; return c }
    private static func fmt(_ pattern: String) -> DateFormatter {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.timeZone = zone; f.dateFormat = pattern; return f
    }
    static func day(_ d: Date) -> String { fmt("EEE, MMM d").string(from: d) }
    static func clock(_ d: Date) -> String { fmt("h:mm a").string(from: d) }
    static func when(_ d: Date) -> String { "\(day(d)), \(clock(d))" }
    static func range(_ a: Date, _ b: Date) -> String { "\(day(a)), \(clock(a)) to \(clock(b))" }
    static func startOfDay(_ d: Date) -> Date { calendar.startOfDay(for: d) }
}

// MARK: - Block logic (the same rules as the website's lib/studioGrid.ts)

enum StudioBlocks {
    /// 30-minute starts from open to (close minus one step) on the day of `day`.
    static func blocks(on day: Date, rules: StudioRules) -> [Date] {
        let cal = StationTime.calendar
        let start = cal.startOfDay(for: day)
        guard let open = cal.date(byAdding: .hour, value: rules.openHour, to: start) else { return [] }
        let count = max(0, (rules.closeHour - rules.openHour) * 60 / rules.stepMinutes)
        return (0..<count).compactMap { cal.date(byAdding: .minute, value: $0 * rules.stepMinutes, to: open) }
    }

    static func closeTime(on day: Date, rules: StudioRules) -> Date {
        StationTime.calendar.date(byAdding: .hour, value: rules.closeHour, to: StationTime.calendar.startOfDay(for: day)) ?? day
    }

    static func overlaps(_ spans: [TimeSpan], _ a: Date, _ b: Date) -> Bool { spans.contains { $0.startAt < b && a < $0.endAt } }

    /// free = open to book; taken = already booked; past = started; far = beyond the look-ahead.
    enum State { case free, taken, past, far }
    static func state(_ start: Date, grid: StudioGrid, now: Date) -> State {
        let step = TimeInterval(grid.rules.stepMinutes * 60)
        if start <= now { return .past }
        if start > now.addingTimeInterval(TimeInterval(grid.rules.lookAheadDays) * 86_400) { return .far }
        return overlaps(grid.ranges, start, start.addingTimeInterval(step)) ? .taken : .free
    }

    /// The longest booking that fits from `start` (stops at the next booking, closing time or the maximum).
    static func longest(from start: Date, grid: StudioGrid) -> Int {
        let rules = grid.rules
        let day = StationTime.startOfDay(start)
        var end = start
        let step = TimeInterval(rules.stepMinutes * 60)
        let limit = min(closeTime(on: day, rules: rules), start.addingTimeInterval(TimeInterval(rules.maxMinutes * 60)))
        while end.addingTimeInterval(step) <= limit, !overlaps(grid.ranges, end, end.addingTimeInterval(step)) { end = end.addingTimeInterval(step) }
        return Int(end.timeIntervalSince(start) / 60)
    }

    /// Length chips that fit: 30 / 60 / 90 within the studio's minimum and maximum.
    static func chips(longest: Int, rules: StudioRules) -> [Int] {
        [30, 60, 90].filter { $0 >= rules.minMinutes && $0 <= rules.maxMinutes && $0 <= longest }
    }

    static func touchesQuiet(_ grid: StudioGrid, _ a: Date, _ b: Date) -> Bool { overlaps(grid.quietRanges, a, b) }

    /// "You have 1 of 2 studio bookings" / "You have 2 of 2 ..., cancel one to book again."
    static func holdLine(held: Int, max: Int) -> String {
        held >= max ? "You hold \(held) of \(max) studio bookings. Cancel one to book another." : "You hold \(held) of \(max) studio bookings."
    }

    /// Cancelling is free until `cancelHours` before the start.
    static func canCancelFree(_ start: Date, now: Date, cancelHours: Int) -> Bool { start.timeIntervalSince(now) >= TimeInterval(cancelHours * 3600) }
}

// MARK: - The store

@MainActor
final class MembersStore: ObservableObject {
    static let shared = MembersStore()

    @Published var access: MyAccess?
    @Published var standing: Standing?
    @Published var events: [ClubEvent] = []
    @Published var sessions: [TrainingSessionRow] = []
    @Published var bookings: MyBookings?
    @Published var recordings: [RecordingRow] = []
    @Published var loaded = false
    @Published var error: String?

    var studioBadge: Bool { access?.studioTrained == true || access?.isEBoard == true }

    /// One pass when the Members tab opens or is pulled down. Signed-out people only get the public events.
    func load(signedIn: Bool, guest: Bool) async {
        error = nil
        if let r: ClubEventsReply = try? await BackendAPI.getPublic("/api/events/club") { events = r.events }
        if signedIn && !guest {
            do { access = try await BackendAPI.get("/api/me") } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
            standing = try? await BackendAPI.get("/api/me/standing")
            if let r: TrainingSessionsReply = try? await BackendAPI.get("/api/studio/sessions") {
                sessions = r.sessions.filter { $0.endsAt > Date() && ($0.status == "scheduled" || $0.status == "checkin_open") }.sorted { $0.startsAt < $1.startsAt }
            }
            if studioBadge { await loadBookings() }
            if let r: RecordingsReply = try? await BackendAPI.get("/api/recordings/mine") { recordings = r.recordings }
        } else {
            access = nil; standing = nil; sessions = []; bookings = nil; recordings = []
        }
        loaded = true
    }

    func loadBookings() async {
        if let b: MyBookings = try? await BackendAPI.get("/api/studio/mine") { bookings = b }
    }

    func rsvp(_ s: TrainingSessionRow, want: Bool) async {
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/studio/sessions/\(s.id)/rsvp", ["rsvp": want])
            if let r: TrainingSessionsReply = try? await BackendAPI.get("/api/studio/sessions") {
                sessions = r.sessions.filter { $0.endsAt > Date() && ($0.status == "scheduled" || $0.status == "checkin_open") }.sorted { $0.startsAt < $1.startsAt }
            }
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }

    func deleteRecording(_ r: RecordingRow) async {
        do {
            let _: EmptyResponse = try await BackendAPI.delete("/api/recordings/\(r.id)", [:])
            recordings.removeAll { $0.id == r.id }
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }
}
