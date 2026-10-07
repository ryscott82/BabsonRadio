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
        if let r: ScheduleFeedResponse = try? await BackendAPI.get("/api/schedule?days=7") { feed = r.items }
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
