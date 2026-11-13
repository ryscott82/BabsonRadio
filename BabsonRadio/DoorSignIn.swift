import Foundation

// MARK: - DoorSignIn
// The QR code on the studio door opens babsonradio.com/booth/door. If the app is installed, iOS hands that link to the app (universal link),
// and this asks the studio PC to sign the person in, using their existing app sign-in. Nothing to tap.

nonisolated private struct DoorResult: Decodable { let firstName: String? }

enum DoorSignIn {
    /// Returns the message to show.
    static func run() async -> String {
        do {
            let r: DoorResult = try await BackendAPI.post("/api/booth/door", [:])
            return "Hi \(r.firstName ?? "there")! Look at the studio screen. You'll be signed in in a few seconds."
        } catch {
            if let e = error as? BackendError { return e.message }
            return "Sign in to Babson Radio first, then scan the code again."
        }
    }
}
