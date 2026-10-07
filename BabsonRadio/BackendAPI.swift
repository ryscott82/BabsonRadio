import Foundation

// MARK: - BackendAPI
// Small JSON client for the website's /api routes. Sends the signed-in user's Firebase
// ID token as a Bearer token, so the server knows who is asking.

/// Error shown to people. `message` always ends with a support code, e.g. "… (BR-ACC-003)".
/// The key for every code is on the website at /support/errors.
struct BackendError: LocalizedError {
    let message: String
    var errorDescription: String? { message }

    init(message: String) { self.message = message }

    /// Builds "Message (BR-XXX-000)" or "Message (BR-XXX-000, ref abc123)".
    init(_ text: String, code: String, ref: String? = nil) {
        self.message = "\(text) (\(code)\(ref.map { ", ref \($0)" } ?? ""))"
    }
}

nonisolated struct EmptyResponse: Decodable {}

enum BackendAPI {

    static func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(path, method: "GET", body: nil)
    }

    static func post<T: Decodable>(_ path: String, _ body: [String: Any]) async throws -> T {
        try await send(path, method: "POST", body: body)
    }

    private static func send<T: Decodable>(_ path: String, method: String, body: [String: Any]?) async throws -> T {
        guard BackendConfig.isConfigured, let url = URL(string: BackendConfig.baseURLString + path) else {
            throw BackendError("The app isn't connected to the server yet.", code: "BR-CLI-002")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        if let token = await AuthManager.shared.idToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw BackendError("Can't reach Babson Radio. Check your connection.", code: "BR-CLI-001")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let body = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw BackendError(body?.error ?? "Something went wrong.",
                               code: body?.code ?? (status >= 500 ? "BR-SRV-000" : "BR-REQ-001"),
                               ref: body?.ref)
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970   // server sends times as ms since epoch
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw BackendError("Unexpected reply from the server.", code: "BR-CLI-004")
        }
    }

    private nonisolated struct ErrorBody: Decodable { let error: String; let code: String?; let ref: String? }
}
