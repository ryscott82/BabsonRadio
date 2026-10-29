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

    /// GET without the sign-in header, for public data. Requests with that header can't be cached by Vercel's edge.
    static func getPublic<T: Decodable>(_ path: String) async throws -> T {
        try await send(path, method: "GET", body: nil, anonymous: true)
    }

    static func post<T: Decodable>(_ path: String, _ body: [String: Any]) async throws -> T {
        try await send(path, method: "POST", body: body)
    }

    static func delete<T: Decodable>(_ path: String, _ body: [String: Any]) async throws -> T {
        try await send(path, method: "DELETE", body: body)
    }

    static func put<T: Decodable>(_ path: String, _ body: [String: Any]) async throws -> T {
        try await send(path, method: "PUT", body: body)
    }

    /// Uploads one picture (already shrunk by `ImageShrinker`) for a student's slot request.
    static func uploadImage(_ jpeg: Data) async throws -> UploadedImage {
        guard BackendConfig.isConfigured, let url = URL(string: BackendConfig.baseURLString + "/api/images") else {
            throw BackendError("The app isn't connected to the server yet.", code: "BR-CLI-002")
        }
        let boundary = "br-\(UUID().uuidString)"
        var body = Data()
        func add(_ s: String) { body.append(Data(s.utf8)) }
        add("--\(boundary)\r\nContent-Disposition: form-data; name=\"scope\"\r\n\r\nslot\r\n")
        add("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"image.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n")
        body.append(jpeg)
        add("\r\n--\(boundary)--\r\n")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 40
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if !BackendConfig.previewKey.isEmpty { request.setValue(BackendConfig.previewKey, forHTTPHeaderField: "X-Preview-Key") }
        if let token = await AuthManager.shared.idToken() { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = body

        let data: Data, response: URLResponse
        do { (data, response) = try await URLSession.shared.data(for: request) }
        catch { throw BackendError("Can't reach Babson Radio. Check your connection.", code: "BR-CLI-001") }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let err = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw BackendError(err?.error ?? "Upload failed.", code: err?.code ?? "BR-REQ-001", ref: err?.ref)
        }
        guard let ok = try? JSONDecoder().decode(UploadedImage.self, from: data) else {
            throw BackendError("Unexpected reply from the server.", code: "BR-CLI-004")
        }
        return ok
    }

    private static func send<T: Decodable>(_ path: String, method: String, body: [String: Any]?, anonymous: Bool = false) async throws -> T {
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
        if !BackendConfig.previewKey.isEmpty {
            request.setValue(BackendConfig.previewKey, forHTTPHeaderField: "X-Preview-Key")
        }
        if !anonymous, let token = await AuthManager.shared.idToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        // Sign-up and contacts calls also carry an App Check token (proves this is the real app; the server decides whether to require it).
        if path.hasPrefix("/api/contacts") || path.hasPrefix("/api/auth"), let check = await BRAppCheck.token() {
            request.setValue(check, forHTTPHeaderField: "X-Firebase-AppCheck")
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
