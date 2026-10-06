import Foundation

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

nonisolated struct SlotScheduleResponse: Decodable { let slots: [AirSlot] }
nonisolated struct MySlotRequestsResponse: Decodable { let requests: [SlotRequest] }

/// Profile returned by /api/me
nonisolated struct MeResponse: Decodable {
    let firstName: String
    let phoneNumber: String
    let role: String
}
