import Foundation
import SwiftUI

// MARK: - Air-time slots (server: /api/slots/*)

/// An approved, booked time on the station schedule.
nonisolated struct AirSlot: Identifiable, Decodable {
    let id: String
    let title: String
    let hostName: String
    let type: String        // "live" | "prerecorded"
    let category: String
    let startAt: Date
    let endAt: Date
}

/// One of the signed-in user's own requests.
nonisolated struct SlotRequest: Identifiable, Decodable {
    let id: String
    let title: String
    let description: String
    let type: String
    let category: String
    let audioURL: String
    let startAt: Date
    let endAt: Date
    let durationMin: Int
    let status: String          // "pending" | "approved" | "declined" | "cancelled"
    let staffNote: String
    let connectionInfo: String  // live-stream instructions, only present once approved
    let createdAt: Date
}

/// Filler programming the auto-scheduler put in the gaps (lofi, jazz, ...). Public.
nonisolated struct AutoBlock: Identifiable, Decodable {
    let id: String
    let label: String
    let startAt: Date
    let endAt: Date
}
nonisolated struct AutoBlocksResponse: Decodable { let blocks: [AutoBlock] }

/// One thing on the schedule (weekly show, approved student slot or genre block). Server: /api/schedule.
nonisolated struct ScheduleEntry: Identifiable, Decodable {
    let id: String
    let source: String      // "weekly" | "slot" | "auto"
    let title: String
    let description: String
    let hosts: [String]
    let imageUrl: String
    let category: String
    let format: String      // "show" | "live" | "prerecorded" | "playlist"
    let startAt: Date
    let endAt: Date
    let showSlug: String
    /// Color the scheduler picked (#RRGGBB); nil or empty = default.
    let color: String?
    /// What a bell attaches to: weekly:<show>, slot:<id> or genre:<name> (every block of that genre).
    let reminderKey: String

    /// The scheduler's color, if one was picked.
    @MainActor var tint: Color? {
        guard let hex = color, !hex.isEmpty else { return nil }
        return Color(hex: hex)
    }

    var formatLabel: String {
        switch format {
        case "live": return "LIVE"
        case "prerecorded": return "PRE-RECORDED"
        case "playlist": return "PLAYLIST"
        default: return "SHOW"
        }
    }
}
nonisolated struct ScheduleFeedResponse: Decodable { let items: [ScheduleEntry]; let timezone: String? }

/// A picture already uploaded to Firebase Storage (server: /api/images).
nonisolated struct UploadedImage: Decodable { let url: String; let path: String }

nonisolated struct SlotScheduleResponse: Decodable { let slots: [AirSlot] }
nonisolated struct MySlotRequestsResponse: Decodable { let requests: [SlotRequest] }

/// Profile returned by /api/me
nonisolated struct MeResponse: Decodable {
    let firstName: String
    let phoneNumber: String
    let role: String
    let invisible: Bool?
    let lastName: String?
    let gradYear: String?
    let concentrations: [String]?
}
