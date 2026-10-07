import Foundation

// MARK: - Backend connection
// The app talks to the same Next.js server that powers the website (its /api routes).
// Set this to your deployed site's address (no trailing slash) once the website is live.
// A phone can't reach "localhost", so this must be a real URL.

enum BackendConfig {
    static let baseURLString = "https://babsonradio.com"

    /// Pre-launch only: the site is locked to developers until release. Put the same value as
    /// PRELAUNCH_PASSWORD (from Vercel) here for your TestFlight/dev builds, and clear it before
    /// you ship publicly. Leave "" once the site is open.
    static let embeddedPreviewKey = ""

    /// What the app sends as X-Preview-Key. Developer sign-in on the login screen stores the unlock
    /// token here automatically, so you normally don't need to paste the password into the code.
    static var previewKey: String {
        UserDefaults.standard.string(forKey: "br.previewKey") ?? embeddedPreviewKey
    }
    static func setPreviewKey(_ value: String?) {
        UserDefaults.standard.set(value, forKey: "br.previewKey")
    }

    static var isConfigured: Bool { !baseURLString.contains("YOUR-SITE") }
}
