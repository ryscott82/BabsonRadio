import SwiftUI
import Combine
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

// MARK: - AuthManager
// Real Firebase sign-in once the Firebase package + GoogleService-Info.plist are added
// (see SETUP_IOS.md). Until then the project still compiles and sign-in explains what's missing.
//
// Account rules (enforced again on the server and in Firestore rules):
//  • Students: verified @babson.edu email, phone number, password, first name.
//  • Developers: real Firebase accounts created with scripts/create-developer.mjs. They sign in
//    through the hidden panel (5 taps under the sign-in form), use any email, and need no phone.

class AuthManager: ObservableObject {

    static let shared = AuthManager()

    // ── Published state ───────────────────────────────────────────
    @Published var isSignedIn = false
    @Published var currentUser: BRUser? = nil
    @Published var isLoading = false
    @Published var errorMessage: String? = nil
    @Published var infoMessage: String? = nil
    /// Signed in with a babson.edu address that hasn't been verified yet.
    @Published var needsEmailVerification = false
    @Published var pendingEmail = ""

    static let setupMessage = "Sign-in isn't set up in this build yet. Add the Firebase package and GoogleService-Info.plist (see SETUP_IOS.md)."

    // MARK: - Validation

    /// Returns true only for @babson.edu addresses.
    static func isBabsonEmail(_ email: String) -> Bool {
        email.trimmingCharacters(in: .whitespaces).lowercased().hasSuffix("@babson.edu")
    }

    private static func cleaned(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

#if canImport(FirebaseAuth)

    private var listener: AuthStateDidChangeListenerHandle?

    static var firebaseReady: Bool { FirebaseApp.app() != nil }

    private init() {
        // FirebaseApp is configured in MyApp.init (only if GoogleService-Info.plist is present).
        guard Self.firebaseReady else { return }
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in await self?.apply(user) }
        }
    }

    /// Turns a Firebase user into app state (profile, verification gate, developer flag).
    private func apply(_ user: User?) async {
        guard let user else {
            currentUser = nil
            isSignedIn = false
            needsEmailVerification = false
            return
        }

        let email = user.email ?? ""
        let claims = try? await user.getIDTokenResult()
        let isDev = (claims?.claims["developer"] as? Bool) == true

        // Students only (guests use the website for now); developers are exempt.
        if !isDev && !Self.isBabsonEmail(email) {
            try? Auth.auth().signOut()
            errorMessage = "Use your @babson.edu email to sign in."
            return
        }
        if !isDev && !user.isEmailVerified {
            pendingEmail = email
            needsEmailVerification = true
            isSignedIn = false
            currentUser = nil
            return
        }
        needsEmailVerification = false

        let me: MeResponse? = try? await BackendAPI.get("/api/me")
        let apiName = me?.firstName ?? ""
        let fallbackName = user.displayName ?? String(email.prefix(while: { $0 != "@" })).capitalized
        currentUser = BRUser(
            id: user.uid,
            displayName: apiName.isEmpty ? fallbackName : apiName,
            email: email,
            phoneNumber: me?.phoneNumber ?? "",
            joinedDate: user.metadata.creationDate ?? Date(),
            isDeveloper: isDev,
            role: me?.role ?? (isDev ? "developer" : "listener")
        )
        isSignedIn = true
    }

    // MARK: - Sign In

    func signIn(email: String, password: String) {
        guard Self.isBabsonEmail(email) else {
            errorMessage = "Babson Radio is only available to Babson students. Use your @babson.edu email."
            return
        }
        guard Self.firebaseReady else { errorMessage = Self.setupMessage; return }
        errorMessage = nil
        infoMessage = nil
        isLoading = true
        Task {
            do {
                _ = try await Auth.auth().signIn(withEmail: Self.cleaned(email), password: password)
            } catch {
                errorMessage = "Incorrect email or password."
            }
            isLoading = false
        }
    }

    // MARK: - Create Account

    func createAccount(email: String, password: String, displayName: String, phoneNumber: String) {
        guard Self.isBabsonEmail(email) else {
            errorMessage = "Babson Radio is only available to Babson students. Use your @babson.edu email."
            return
        }
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            errorMessage = "Enter your first name."
            return
        }
        guard password.count >= 8 else {
            errorMessage = "Password must be at least 8 characters."
            return
        }
        let digits = phoneNumber.filter(\.isNumber)
        guard digits.count == 10 else {
            errorMessage = "Please enter a valid 10-digit US phone number."
            return
        }
        guard Self.firebaseReady else { errorMessage = Self.setupMessage; return }

        errorMessage = nil
        infoMessage = nil
        isLoading = true
        Task {
            do {
                // The server creates the account (it enforces babson.edu), then we sign in and verify.
                let _: EmptyResponse = try await BackendAPI.post("/api/auth/signup", [
                    "email": Self.cleaned(email),
                    "password": password,
                    "firstName": name,
                    "phone": digits,
                ])
                let result = try await Auth.auth().signIn(withEmail: Self.cleaned(email), password: password)
                try await result.user.sendEmailVerification()
            } catch {
                errorMessage = (error as? BackendError)?.message ?? error.localizedDescription
            }
            isLoading = false
        }
    }

    // MARK: - Developer sign-in (hidden panel)

    /// Real credentials, no babson.edu email or phone needed. Only accounts carrying the
    /// `developer` claim (created with scripts/create-developer.mjs) are accepted.
    func devSignIn(email: String, password: String) {
        guard Self.firebaseReady else { errorMessage = Self.setupMessage; return }
        errorMessage = nil
        infoMessage = nil
        isLoading = true
        Task {
            do {
                let result = try await Auth.auth().signIn(withEmail: Self.cleaned(email), password: password)
                let token = try await result.user.getIDTokenResult(forcingRefresh: true)
                if (token.claims["developer"] as? Bool) != true {
                    try? Auth.auth().signOut()
                    errorMessage = "That isn't a developer account."
                }
            } catch {
                errorMessage = "Incorrect email or password."
            }
            isLoading = false
        }
    }

    // MARK: - Email verification

    func resendVerification() {
        infoMessage = nil
        errorMessage = nil
        Task {
            do {
                try await Auth.auth().currentUser?.sendEmailVerification()
                infoMessage = "Sent again. Check your inbox and spam folder."
            } catch {
                errorMessage = "Please wait a minute and try again."
            }
        }
    }

    /// Re-checks verification (also runs automatically when the app returns to the foreground).
    func checkVerification() {
        guard let user = Auth.auth().currentUser else { return }
        Task {
            try? await user.reload()
            _ = try? await user.getIDToken(forcingRefresh: true)
            await apply(Auth.auth().currentUser)
            if needsEmailVerification {
                infoMessage = "Still waiting. Open the link in the email first."
            }
        }
    }

    // MARK: - Token for the backend

    func idToken() async -> String? {
        guard Self.firebaseReady else { return nil }
        return try? await Auth.auth().currentUser?.getIDToken()
    }

    // MARK: - Sign Out

    func signOut() {
        try? Auth.auth().signOut()
        currentUser = nil
        isSignedIn = false
        needsEmailVerification = false
    }

#else

    // Firebase package not added yet: the app compiles and the UI is reachable, but nothing is real.
    static var firebaseReady: Bool { false }

    private init() {}

    func signIn(email: String, password: String) { errorMessage = Self.setupMessage }

    func createAccount(email: String, password: String, displayName: String, phoneNumber: String) {
        errorMessage = Self.setupMessage
    }

    func devSignIn(email: String, password: String) {
#if DEBUG
        // Local UI preview only (debug builds without Firebase): look around as a developer.
        currentUser = BRUser(id: "preview-dev", displayName: "Developer", email: email,
                             phoneNumber: "", joinedDate: Date(), isDeveloper: true, role: "developer")
        isSignedIn = true
#else
        errorMessage = Self.setupMessage
#endif
    }

    func resendVerification() {}
    func checkVerification() {}
    func idToken() async -> String? { nil }

    func signOut() {
        currentUser = nil
        isSignedIn = false
    }

#endif
}

