import Foundation

// MARK: - Backend connection
// The app talks to the same Next.js server that powers the website (its /api routes).
// Set this to your deployed site's address (no trailing slash) once the website is live.
// A phone can't reach "localhost", so this must be a real URL.

enum BackendConfig {
    static let baseURLString = "https://YOUR-SITE-URL-HERE"

    static var isConfigured: Bool { !baseURLString.contains("YOUR-SITE") }
}
