import Foundation

// MARK: - BackendAPI
// Small JSON client for the website's /api routes. Sends the signed-in user's Firebase
// ID token as a Bearer token, so the server knows who is asking.

struct BackendError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
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
            throw BackendError(message: "The app isn't connected to the server yet.")
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

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            throw BackendError(message: message ?? "Something went wrong (\(status)).")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970   // server sends times as ms since epoch
        return try decoder.decode(T.self, from: data)
    }

    private nonisolated struct ErrorBody: Decodable { let error: String }
}
