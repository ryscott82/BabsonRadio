import Foundation
import Security

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

    /// What the app sends as X-Preview-Key (the launch pass). Developer sign-in on the login screen stores the unlock
    /// token here automatically, so you normally don't need to paste the password into the code.
    /// It lives in the Keychain, not UserDefaults (UserDefaults is a plain file that shows up in device backups).
    static var previewKey: String {
        if let v = Keychain.get(keychainKey) { return v }
        // One-time move from the old place (builds before this change kept it in UserDefaults).
        if let old = UserDefaults.standard.string(forKey: "br.previewKey") {
            UserDefaults.standard.removeObject(forKey: "br.previewKey")
            if !old.isEmpty { Keychain.set(old, for: keychainKey); return old }
        }
        return embeddedPreviewKey
    }
    static func setPreviewKey(_ value: String?) {
        UserDefaults.standard.removeObject(forKey: "br.previewKey")
        Keychain.set(value, for: keychainKey)
    }
    private static let keychainKey = "previewKey"

    static var isConfigured: Bool { !baseURLString.contains("YOUR-SITE") }
}

// MARK: - Keychain
/// A tiny wrapper for one string per key. Items are only readable after the first unlock and never leave this device.
enum Keychain {
    private static let service = Bundle.main.bundleIdentifier ?? "com.babsonradio.app"

    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
    }

    static func get(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// nil or "" removes the item.
    static func set(_ value: String?, for key: String) {
        SecItemDelete(query(key) as CFDictionary)
        guard let value, !value.isEmpty, let data = value.data(using: .utf8) else { return }
        var q = query(key)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }
}
