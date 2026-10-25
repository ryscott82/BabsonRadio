import SwiftUI
import Combine
import AuthenticationServices
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
    /// Seconds before another password reset email can be requested (0 = ready).
    @Published var resetCooldown = 0
    private var resetTimer: Timer?
    private static let resetWindow: TimeInterval = 180
    /// Signed in with a babson.edu address that hasn't been verified yet.
    @Published var needsEmailVerification = false
    /// While the 7-day window is running and the email link hasn't been clicked: the day the link is needed by.
    @Published var verifyDeadline: Date? = nil
    @Published var pendingEmail = ""
    /// Guest-only: sponsor pass and Library access from /api/guest/status.
    @Published var guestStatus: GuestStatus? = nil
    private var expiryTimer: Timer?
    /// Set after the confirmation link was sent to a guest's school email.
    @Published var schoolEmailSentTo: String? = nil
    /// Invisible mode: hides you from "tuned in" lists and from friends' "liked this" hints.
    @Published var isInvisible = false
    /// Bumped when something asks for the sign-in screen (the skip key, or a guest reaching for a student-only tab).
    @Published var signInRequest = 0
    /// False until the first sign-in check has finished, so the splash screen knows when the app is ready.
    @Published var hasResolvedAuth = false
    /// On the beta tester list.
    @Published var isTester = false
    /// Signed in with Apple but no school email yet: the app asks for one (verified within 7 days).
    @Published var needsSchoolEmail = false
    /// A student account that hasn't done the one-time "about you" step (name, phone, birthday or age range).
    @Published var needsOnboarding = false
    /// Signed in with Apple (they have no password, so deleting the account re-confirms with Apple).
    @Published var isAppleUser = false
    private var appleFirstName = ""
    private var appleLastName = ""

    func setInvisible(_ value: Bool) {
        let previous = isInvisible
        isInvisible = value
        Task {
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/me", ["invisible": value])
            } catch {
                isInvisible = previous
                errorMessage = (error as? BackendError)?.message ?? "Couldn't save that setting."
            }
        }
    }

    /// Takes the person to the sign-in screen. A guest is signed out first, so the screen opens instead of staying hidden.
    func goToSignIn() {
        if isSignedIn { signOut() }
        signInRequest += 1
    }

    /// LIVE radio: everyone who is signed in (students, developers and guests).
    var canListenLive: Bool { isSignedIn && currentUser != nil }

    /// The Library (stored episodes): students and developers, plus guests the server says qualify
    /// (a sponsor's pass, or a student who has them in their contacts).
    var canAccessLibrary: Bool {
        guard isSignedIn, let u = currentUser else { return false }
        return !u.isGuest || guestStatus?.canAccessBacklog == true
    }

    /// Re-checks a guest's Library access at the moment a sponsor's pass runs out.
    func scheduleExpiryCheck() {
        expiryTimer?.invalidate()
        guard let end = guestStatus?.pass?.expiresAt, end > Date() else { return }
        expiryTimer = Timer.scheduledTimer(withTimeInterval: end.timeIntervalSinceNow + 0.5, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.objectWillChange.send(); self?.refreshGuestStatus() }
        }
    }

    func enforceAccess() {
        if !canListenLive { AudioPlayerManager.shared.stop() }
    }

    static let setupMessage = "Sign-in isn't set up in this build yet. (BR-CLI-003)"

    // MARK: - Validation

    /// Schools whose students can use Babson Radio. The first one is the default in the email picker.
    static let schoolDomains = ["@babson.edu", "@olin.edu", "@wellesley.edu"]

    /// True for a Babson, Olin or Wellesley address.
    static func isBabsonEmail(_ email: String) -> Bool {
        let e = email.trimmingCharacters(in: .whitespaces).lowercased()
        return schoolDomains.contains { e.hasSuffix($0) }
    }

    private static func cleaned(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

#if canImport(FirebaseAuth)

    private var listener: AuthStateDidChangeListenerHandle?

    /// Maps a Firebase sign-in/sign-up error to a friendly message with a support code.
    /// Codes are listed at https://babsonradio.com/support/errors
    static func authMessage(_ error: Error, signingUp: Bool = false) -> String {
        if let e = error as? BackendError { return e.message }
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain { return "Can't reach Babson Radio. Check your connection. (BR-CLI-001)" }
        // Firebase Auth error numbers (stable across SDK versions): 17007 email in use, 17008 invalid email, 17026 weak
        // password, 17009 wrong password, 17004 bad credential, 17011 no such user, 17010 too many tries, 17020 network,
        // 17006 not allowed, 17005 disabled.
        switch ns.code {
        case 17007:
            return "An account with that email already exists. Try signing in. (BR-ACC-002)"
        case 17008:
            return "Enter a valid email address. (BR-ACC-009)"
        case 17026:
            return "That password is too weak. (BR-ACC-005)"
        case 17009, 17004, 17011:
            return "Incorrect email or password. (BR-AUTH-001)"
        case 17010:
            return "Too many attempts. Wait a few minutes and try again. (BR-AUTH-006)"
        case 17020:
            return "Can't reach Babson Radio. Check your connection. (BR-CLI-001)"
        case 17006:
            return "Sign-in is not available right now. (BR-AUTH-008)"
        case 17005:
            return "This account has been disabled. (BR-AUTH-010)"
        default:
            return (signingUp ? "Could not create the account. " : "Sign-in failed. ") + "(BR-AUTH-007)"
        }
    }

    static var firebaseReady: Bool { FirebaseApp.app() != nil }

    private init() {
        // FirebaseApp is configured in MyApp.init (only if GoogleService-Info.plist is present).
        guard Self.firebaseReady else { hasResolvedAuth = true; return }
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                await self?.apply(user)
                self?.hasResolvedAuth = true
            }
        }
    }

    /// Turns a Firebase user into app state (profile, verification gate, developer flag).
    private func apply(_ user: User?) async {
        guard let user else {
            currentUser = nil
            isSignedIn = false
            needsEmailVerification = false
            needsSchoolEmail = false
            needsOnboarding = false
            isAppleUser = false
            guestStatus = nil
            isTester = false
            enforceAccess()
            return
        }

        let email = user.email ?? ""
        let claims = try? await user.getIDTokenResult()
        let isDev = (claims?.claims["developer"] as? Bool) == true
        let isApple = user.providerData.contains { $0.providerID == "apple.com" }
        isAppleUser = isApple
        // Sign in with Apple still needs a school email. Until they add one they are not a guest and not signed in.
        if !isDev && isApple && !Self.isBabsonEmail(email) {
            needsSchoolEmail = true
            needsEmailVerification = false
            needsOnboarding = false
            isSignedIn = false
            currentUser = nil
            guestStatus = nil
            isTester = false
            return
        }
        needsSchoolEmail = false

        // Non-Babson, non-developer accounts are guests: live radio for everyone signed in; the Library needs a sponsor's pass or a student connection.
        if !isDev && !Self.isBabsonEmail(email) {
            needsEmailVerification = false
            guestStatus = try? await BackendAPI.get("/api/guest/status")
            isTester = false
            currentUser = BRUser(
                id: user.uid,
                displayName: user.displayName ?? "Guest",
                email: email,
                phoneNumber: "",
                joinedDate: user.metadata.creationDate ?? Date(),
                isDeveloper: false,
                role: "guest",
                emailVerifiedHint: user.isEmailVerified
            )
            isSignedIn = true
            scheduleExpiryCheck()
            enforceAccess()
            return
        }
        // New accounts can use the app for 7 days before the email link is required (the server and rules agree).
        let graceMs = (claims?.claims["graceUntil"] as? NSNumber)?.doubleValue ?? 0
        let inGrace = graceMs > Date().timeIntervalSince1970 * 1000
        if !isDev && !user.isEmailVerified && !inGrace {
            pendingEmail = email
            needsEmailVerification = true
            verifyDeadline = nil
            isSignedIn = false
            currentUser = nil
            return
        }
        needsEmailVerification = false
        verifyDeadline = (!isDev && !user.isEmailVerified && inGrace) ? Date(timeIntervalSince1970: graceMs / 1000) : nil

        // Pre-launch: admins, directors and radio-trained students trade their sign-in for a launch pass (good for 12 hours),
        // so no shared password is needed in the app. After launch the server says "open" and the pass is dropped.
        if let pass: GatePass = try? await BackendAPI.post("/api/launch/pass", [:]) {
            if let gate = pass.gate, !gate.isEmpty { BackendConfig.setPreviewKey(gate) }
            else if pass.open == true { BackendConfig.setPreviewKey(nil) }
        }

        let me: MeResponse? = try? await BackendAPI.get("/api/me")
        isInvisible = me?.invisible ?? false
        isTester = me?.isTester ?? false
        needsOnboarding = !isDev && me?.onboarded == false
        let apiName = me?.firstName ?? ""
        let fallbackName = user.displayName ?? String(email.prefix(while: { $0 != "@" })).capitalized
        currentUser = BRUser(
            id: user.uid,
            displayName: apiName.isEmpty ? fallbackName : apiName,
            email: email,
            phoneNumber: me?.phoneNumber ?? "",
            joinedDate: user.metadata.creationDate ?? Date(),
            isDeveloper: isDev,
            role: me?.effectiveRole ?? (isDev ? "developer" : "listener")
        )
        currentUser?.lastName = me?.lastName ?? ""
        guestStatus = nil
        isSignedIn = true
    }

    // MARK: - Sign In

    func signIn(email: String, password: String) {
        guard Self.isBabsonEmail(email) else {
            errorMessage = "Student accounts need your @babson.edu, @olin.edu or @wellesley.edu email. Not a student? Continue as a guest. (BR-ACC-001)"
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
                errorMessage = Self.authMessage(error)
            }
            isLoading = false
        }
    }

    // MARK: - Create Account

    func createAccount(email: String, password: String, displayName: String, lastName: String, phoneNumber: String,
                       gradYear: String, agreed: Bool) {
        guard Self.isBabsonEmail(email) else {
            errorMessage = "Student accounts need your @babson.edu, @olin.edu or @wellesley.edu email. Not a student? Continue as a guest. (BR-ACC-001)"
            return
        }
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            errorMessage = "Enter your first name. (BR-ACC-006)"
            return
        }
        let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !last.isEmpty else {
            errorMessage = "Enter your last name. (BR-ACC-017)"
            return
        }
        guard password.count >= 8 else {
            errorMessage = "Password must be at least 8 characters. (BR-ACC-005)"
            return
        }
        let digits = PhoneField.digits(phoneNumber)
        guard digits.count == 10 else {
            errorMessage = "Please enter a valid 10-digit US phone number. (BR-ACC-004)"
            return
        }
        guard !gradYear.isEmpty else {
            errorMessage = "Pick your graduation year. (BR-ACC-018)"
            return
        }
        guard agreed else {
            errorMessage = "Agree to the Terms of Use and Privacy Policy to create an account. (BR-ACC-019)"
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
                    "lastName": last,
                    "phone": digits,
                    "gradYear": gradYear,
                    "agreed": agreed,
                ])
                let result = try await Auth.auth().signIn(withEmail: Self.cleaned(email), password: password)
                try await result.user.sendEmailVerification()
            } catch {
                errorMessage = Self.authMessage(error, signingUp: true)
            }
            isLoading = false
        }
    }

    // MARK: - Guests (free email + password; live radio only)

    func guestSignUp(email: String, password: String, name: String, agreed: Bool) {
        guard agreed else { errorMessage = "Agree to the Terms of Use and Privacy Policy to continue. (BR-ACC-019)"; return }
        guard !Self.isBabsonEmail(email) else {
            errorMessage = "You have a Babson email. Create a student account instead. (BR-ACC-001)"
            return
        }
        guard password.count >= 8 else { errorMessage = "Password must be at least 8 characters. (BR-ACC-005)"; return }
        guard Self.firebaseReady else { errorMessage = Self.setupMessage; return }
        errorMessage = nil; infoMessage = nil; isLoading = true
        Task {
            do {
                let result = try await Auth.auth().createUser(withEmail: Self.cleaned(email), password: password)
                let change = result.user.createProfileChangeRequest()
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                change.displayName = trimmed.isEmpty ? "Guest" : trimmed
                try? await change.commitChanges()
                try? await result.user.sendEmailVerification()
                await apply(Auth.auth().currentUser)
                let _: EmptyResponse? = try? await BackendAPI.post("/api/me", ["acceptTerms": Terms.version])
            } catch {
                errorMessage = Self.authMessage(error, signingUp: true)
            }
            isLoading = false
        }
    }

    func guestSignIn(email: String, password: String) {
        guard !Self.isBabsonEmail(email) else {
            errorMessage = "Use the student sign-in with your school email. (BR-ACC-001)"
            return
        }
        guard Self.firebaseReady else { errorMessage = Self.setupMessage; return }
        errorMessage = nil; infoMessage = nil; isLoading = true
        Task {
            do { _ = try await Auth.auth().signIn(withEmail: Self.cleaned(email), password: password) }
            catch { errorMessage = Self.authMessage(error) }
            isLoading = false
        }
    }

    func sendPasswordReset(email: String) {
        guard Self.firebaseReady else { errorMessage = Self.setupMessage; return }
        let e = Self.cleaned(email)
        guard !e.isEmpty else { errorMessage = "Enter your email first. (BR-ACC-009)"; return }
        let left = Self.resetSecondsLeft()
        if left > 0 {
            errorMessage = "A reset link was just sent. You can ask for another in \(left / 60):\(String(format: "%02d", left % 60)). (BR-ACC-010)"
            startResetTick()
            return
        }
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "br_reset_at")
        startResetTick()
        errorMessage = nil; infoMessage = nil
        Task {
            try? await Auth.auth().sendPasswordReset(withEmail: e)
            infoMessage = "If that account exists, a reset link is on its way."   // never reveal which accounts exist
        }
    }

    /// Seconds left on the reset cooldown. One reset email every few minutes per device.
    static func resetSecondsLeft() -> Int {
        let at = UserDefaults.standard.double(forKey: "br_reset_at")
        guard at > 0 else { return 0 }
        return max(0, Int((at + resetWindow - Date().timeIntervalSince1970).rounded(.up)))
    }

    func startResetTick() {
        resetTimer?.invalidate()
        resetCooldown = Self.resetSecondsLeft()
        guard resetCooldown > 0 else { return }
        resetTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] t in
            Task { @MainActor in
                guard let self else { t.invalidate(); return }
                self.resetCooldown = Self.resetSecondsLeft()
                if self.resetCooldown == 0 { t.invalidate() }
            }
        }
    }

    /// Re-reads the account and the guest's pass / Library / request state.
    func refreshGuestStatus() {
        guard let user = Auth.auth().currentUser else { return }
        Task {
            try? await user.reload()
            _ = try? await user.getIDToken(forcingRefresh: true)
            await apply(Auth.auth().currentUser)
        }
    }

    func requestSponsor(email: String) {
        errorMessage = nil; infoMessage = nil
        Task {
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/guest/request", [
                    "sponsorEmail": Self.cleaned(email),
                    "name": currentUser?.displayName ?? "Guest",
                ])
                infoMessage = "Request sent."
                await apply(Auth.auth().currentUser)
            } catch {
                errorMessage = Self.authMessage(error, signingUp: true)
            }
        }
    }

    /// A guest who is a student adds their school email: we save their details, then Firebase emails a confirmation
    /// link to the school address. After they open it they sign in again with that address (same password).
    func addSchoolEmail(email: String, firstName: String, lastName: String, gradYear: String, password: String) {
        errorMessage = nil; infoMessage = nil
        guard let user = Auth.auth().currentUser, let current = user.email else { return }
        let school = Self.cleaned(email)
        guard Self.isBabsonEmail(school) else { errorMessage = "Use your Babson, Olin or Wellesley email."; return }
        isLoading = true
        Task {
            defer { isLoading = false }
            do {
                try await user.reauthenticate(with: EmailAuthProvider.credential(withEmail: current, password: password))
                let _: EmptyResponse = try await BackendAPI.post("/api/me/school-email", [
                    "email": school, "firstName": firstName, "lastName": lastName, "gradYear": gradYear,
                ])
                try await user.sendEmailVerification(beforeUpdatingEmail: school)
                schoolEmailSentTo = school
            } catch {
                errorMessage = Self.authMessage(error)
            }
        }
    }

    /// Permanently deletes the account and its data (re-checks the password first).
    func deleteAccount(password: String) {
        guard let user = Auth.auth().currentUser, let email = user.email else { return }
        errorMessage = nil; infoMessage = nil; isLoading = true
        Task {
            do {
                try await user.reauthenticate(with: EmailAuthProvider.credential(withEmail: email, password: password))
            } catch {
                errorMessage = "Incorrect password. (BR-AUTH-001)"
                isLoading = false
                return
            }
            do {
                _ = try await user.getIDToken(forcingRefresh: true)
                let _: EmptyResponse = try await BackendAPI.post("/api/me/delete", ["confirm": "DELETE"])
                try? Auth.auth().signOut()
                currentUser = nil
                isSignedIn = false
                guestStatus = nil
                enforceAccess()
            } catch {
                errorMessage = (error as? BackendError)?.message ?? Self.authMessage(error)
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
                    errorMessage = "That isn't a developer account. (BR-PERM-002)"
                }
            } catch {
                errorMessage = Self.authMessage(error)
            }
            isLoading = false
        }
    }

    /// Developer password sign-in (same password as the website's "Developer access"): signs in as the shared
    /// Preview developer account. No separate Firebase account needed.
    private struct GatePass: Decodable { let gate: String?; let open: Bool? }
    private struct UnlockResponse: Decodable { let gate: String; let customToken: String?; let warning: String? }

    func devPasswordSignIn(password: String) {
        guard Self.firebaseReady else { errorMessage = Self.setupMessage; return }
        errorMessage = nil
        infoMessage = nil
        isLoading = true
        Task {
            defer { isLoading = false }
            // Step 1: the server checks the developer password.
            let r: UnlockResponse
            do {
                r = try await BackendAPI.post("/api/prelaunch/unlock", ["password": password, "email": ""])
            } catch {
                errorMessage = Self.authMessage(error)
                print("[dev sign-in] unlock failed: \(error)")
                return
            }
            BackendConfig.setPreviewKey(r.gate)
            guard let token = r.customToken else {
                errorMessage = "Password accepted, but the server could not sign you in. (\(r.warning ?? "BR-SRV-000"))"
                print("[dev sign-in] no custom token, warning \(r.warning ?? "none")")
                return
            }
            // Step 2: Firebase signs the app in with the token.
            do {
                let result = try await Auth.auth().signIn(withCustomToken: token)
                print("[dev sign-in] signed in as \(result.user.uid)")
                await apply(result.user)   // don't wait for the listener
                if !isSignedIn { errorMessage = "Signed in, but the profile could not load. (BR-AUTH-011)" }
            } catch {
                let ns = error as NSError
                errorMessage = "Sign-in failed at Firebase (code \(ns.code)). (BR-AUTH-012)"
                print("[dev sign-in] firebase failed: \(error)")
            }
        }
    }

    // MARK: - Email verification

    func resendVerification() {
        infoMessage = nil
        errorMessage = nil
        Task {
            do {
                try await Auth.auth().currentUser?.sendEmailVerification()
                infoMessage = "Sent again."
            } catch {
                errorMessage = "Please wait a minute and try again. (BR-AUTH-006)"
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
                infoMessage = "Open the link in the email first."
            }
        }
    }

    // MARK: - Sign in with Apple

    /// Finishes the Apple button: signs in to Firebase with Apple's token. The name only arrives the first time.
    func signInWithApple(_ result: Result<ASAuthorization, Error>, rawNonce: String) {
        errorMessage = nil; infoMessage = nil
        guard Self.firebaseReady else { errorMessage = Self.setupMessage; return }
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            errorMessage = "Apple sign-in didn't finish. Try again, or continue with email. (BR-AUTH-007)"
        case .success(let authorization):
            guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = cred.identityToken, let idToken = String(data: tokenData, encoding: .utf8) else {
                errorMessage = "Apple didn't send what we need. Try again. (BR-AUTH-007)"
                return
            }
            appleFirstName = cred.fullName?.givenName ?? ""
            appleLastName = cred.fullName?.familyName ?? ""
            let credential = OAuthProvider.appleCredential(withIDToken: idToken, rawNonce: rawNonce, fullName: cred.fullName)
            isLoading = true
            Task {
                defer { isLoading = false }
                do { _ = try await Auth.auth().signIn(with: credential) }
                catch { errorMessage = Self.authMessage(error) }
            }
        }
    }

    /// Apple accounts give their school email here. The server makes it the account's email and starts the 7 days;
    /// then Firebase emails the verification link to it.
    func submitAppleSchoolEmail(email: String, agreed: Bool) {
        errorMessage = nil; infoMessage = nil
        guard Self.isBabsonEmail(email) else { errorMessage = "Use your Babson, Olin or Wellesley email. (BR-ACC-001)"; return }
        guard agreed else { errorMessage = "Agree to the Terms of Use and Privacy Policy to continue. (BR-ACC-019)"; return }
        guard let user = Auth.auth().currentUser else { return }
        isLoading = true
        Task {
            defer { isLoading = false }
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/auth/apple/school-email", [
                    "email": Self.cleaned(email), "agreed": agreed,
                    "firstName": appleFirstName, "lastName": appleLastName,
                ])
                try await user.reload()
                _ = try await user.getIDToken(forcingRefresh: true)
                try? await user.sendEmailVerification()
                await apply(Auth.auth().currentUser)
                infoMessage = "We sent a link to \(Self.cleaned(email)). Open it within 7 days."
            } catch {
                errorMessage = (error as? BackendError)?.message ?? Self.authMessage(error)
            }
        }
    }

    /// The one-time "about you" step. Under 13: the server deletes the account and we sign out.
    @discardableResult
    func submitOnboarding(firstName: String, lastName: String, phone: String, gradYear: String,
                          birthdate: DateComponents?, ageRange: String?, parentalConsent: Bool) async -> Bool {
        errorMessage = nil
        var body: [String: Any] = ["firstName": firstName, "lastName": lastName, "phone": phone,
                                   "gradYear": gradYear, "parentalConsent": parentalConsent]
        if let b = birthdate, let y = b.year, let m = b.month, let d = b.day {
            body["birthdate"] = ["year": y, "month": m, "day": d]
        } else if let r = ageRange {
            body["ageRange"] = r
        }
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/me/onboarding", body)
            needsOnboarding = false
            if var u = currentUser {
                u.displayName = firstName; u.lastName = lastName
                if !phone.isEmpty { u.phoneNumber = phone }
                currentUser = u
            }
            return true
        } catch {
            let message = (error as? BackendError)?.message ?? "Couldn't save that. Try again."
            if message.contains("BR-AGE-001") { signOut() }   // the server already deleted everything
            errorMessage = message
            return false
        }
    }

    /// Delete-my-account for Apple accounts: confirm with Apple, revoke the Apple link, then delete.
    func deleteAccountWithApple(_ result: Result<ASAuthorization, Error>, rawNonce: String) {
        errorMessage = nil; infoMessage = nil
        guard let user = Auth.auth().currentUser else { return }
        guard case .success(let authorization) = result,
              let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = cred.identityToken, let idToken = String(data: tokenData, encoding: .utf8),
              let codeData = cred.authorizationCode, let code = String(data: codeData, encoding: .utf8) else {
            if case .failure(let e) = result, (e as? ASAuthorizationError)?.code == .canceled { return }
            errorMessage = "Apple didn't confirm. Nothing was deleted. (BR-AUTH-007)"
            return
        }
        isLoading = true
        Task {
            defer { isLoading = false }
            do {
                let credential = OAuthProvider.appleCredential(withIDToken: idToken, rawNonce: rawNonce, fullName: nil)
                try await user.reauthenticate(with: credential)
                try await Auth.auth().revokeToken(withAuthorizationCode: code)   // Apple requires this when deleting
                _ = try await user.getIDToken(forcingRefresh: true)
                let _: EmptyResponse = try await BackendAPI.post("/api/me/delete", ["confirm": "DELETE"])
                signOut()
            } catch {
                errorMessage = (error as? BackendError)?.message ?? Self.authMessage(error)
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
        BackendConfig.setPreviewKey(nil)
        try? Auth.auth().signOut()
        currentUser = nil
        isSignedIn = false
        needsEmailVerification = false
        needsSchoolEmail = false
        needsOnboarding = false
        isAppleUser = false
        verifyDeadline = nil
        guestStatus = nil
        enforceAccess()
    }

#else

    // Firebase package not added yet: the app compiles and the UI is reachable, but nothing is real.
    static var firebaseReady: Bool { false }

    private init() { hasResolvedAuth = true }

    func signIn(email: String, password: String) { errorMessage = Self.setupMessage }

    func createAccount(email: String, password: String, displayName: String, lastName: String, phoneNumber: String,
                       gradYear: String, agreed: Bool) {
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

    func devPasswordSignIn(password: String) { errorMessage = Self.setupMessage }
    func guestSignUp(email: String, password: String, name: String, agreed: Bool) { errorMessage = Self.setupMessage }
    func guestSignIn(email: String, password: String) { errorMessage = Self.setupMessage }
    func sendPasswordReset(email: String) { errorMessage = Self.setupMessage }
    func refreshGuestStatus() {}
    func requestSponsor(email: String) { errorMessage = Self.setupMessage }
    func addSchoolEmail(email: String, firstName: String, lastName: String, gradYear: String, password: String) { errorMessage = Self.setupMessage }
    func deleteAccount(password: String) { errorMessage = Self.setupMessage }

    func signInWithApple(_ result: Result<ASAuthorization, Error>, rawNonce: String) { errorMessage = Self.setupMessage }
    func submitAppleSchoolEmail(email: String, agreed: Bool) { errorMessage = Self.setupMessage }
    @discardableResult
    func submitOnboarding(firstName: String, lastName: String, phone: String, gradYear: String,
                          birthdate: DateComponents?, ageRange: String?, parentalConsent: Bool) async -> Bool { errorMessage = Self.setupMessage; return false }
    func deleteAccountWithApple(_ result: Result<ASAuthorization, Error>, rawNonce: String) { errorMessage = Self.setupMessage }

    func resendVerification() {}
    func checkVerification() {}
    func idToken() async -> String? { nil }

    func signOut() {
        currentUser = nil
        isSignedIn = false
    }

#endif
}

// MARK: - Guest invite model

enum InviteDuration: String, CaseIterable, Identifiable {
    case oneDay      = "1 Day"
    case sevenDays   = "7 Days"
    case thirtyDays  = "30 Days"
    case endOfSemester = "End of Semester"

    var id: String { rawValue }

    var expiresAt: Date {
        let cal = Calendar.current
        switch self {
        case .oneDay:
            return cal.date(byAdding: .day, value: 1, to: Date())!
        case .sevenDays:
            return cal.date(byAdding: .day, value: 7, to: Date())!
        case .thirtyDays:
            return cal.date(byAdding: .day, value: 30, to: Date())!
        case .endOfSemester:
            return InviteDuration.nextSemesterEnd()
        }
    }

    /// Returns the next semester end: mid-May (Spring) or mid-December (Fall).
    static func nextSemesterEnd() -> Date {
        var cal = Calendar.current
        cal.timeZone = TimeZone(identifier: "America/New_York")!
        let now = Date()
        let month = cal.component(.month, from: now)
        let year  = cal.component(.year,  from: now)

        // Fall semester ends ~Dec 15; Spring ends ~May 15
        if month <= 5 {
            // We're in spring — end is May 15 this year
            return cal.date(from: DateComponents(year: year, month: 5, day: 15))!
        } else if month <= 12 {
            // We're in fall — end is Dec 15 this year
            return cal.date(from: DateComponents(year: year, month: 12, day: 15))!
        } else {
            return cal.date(from: DateComponents(year: year + 1, month: 5, day: 15))!
        }
    }

    var shortLabel: String {
        switch self {
        case .oneDay:        return "1 day"
        case .sevenDays:     return "7 days"
        case .thirtyDays:    return "30 days"
        case .endOfSemester:
            let fmt = DateFormatter()
            fmt.dateFormat = "MMM d"
            return "until \(fmt.string(from: expiresAt))"
        }
    }
}

struct GuestInvite: Identifiable {
    let id: String
    let email: String
    let duration: InviteDuration
    let expiresAt: Date
    let invitedBy: String  // inviter's displayName

    var isExpired: Bool { expiresAt < Date() }

    var expiresLabel: String {
        if isExpired { return "Expired" }
        let fmt = DateFormatter()
        fmt.dateFormat = "MMM d"
        return "Expires \(fmt.string(from: expiresAt))"
    }
}

// MARK: - BRUser model

struct BRUser: Identifiable {
    let id: String
    var displayName: String
    var email: String
    var phoneNumber: String     // stored as raw digits, e.g. "6175551234"
    var joinedDate: Date
    var isDeveloper: Bool = false
    var role: String = "listener"
    var emailVerifiedHint: Bool = false   // guests: Firebase's emailVerified flag at sign-in
    var lastName: String = ""

    var isGuest: Bool { role == "guest" }
    /// Admins and developers. Only decides what is shown; the server checks the role on every request.
    var isAdmin: Bool { role == "superAdmin" || isDeveloper }

    var initials: String {
        if !lastName.isEmpty, let f = displayName.first, let l = lastName.first {
            return "\(f)\(l)".uppercased()
        }
        let parts = displayName.split(separator: " ")
        if parts.count >= 2 {
            return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
        }
        // One name and no last name yet: just the first letter (never the second letter of the first name, which gave "RY" for Ryan).
        return String(displayName.prefix(1)).uppercased()
    }
}

// MARK: - Live listener (anonymous, from Firestore presence)

struct LiveListener: Identifiable {
    let id: String
    let colorSeed: Int   // deterministic avatar color from user ID hash
}

extension LiveListener {
    // Sample data — replaced by Firestore real-time listener in production
    static let sampleListeners: [LiveListener] = (0..<14).map {
        LiveListener(id: UUID().uuidString, colorSeed: $0)
    }

    var avatarColor: Color {
        let palette: [Color] = [
            Color(hex: "006644"), Color(hex: "DDD055"), Color(hex: "C8302A"),
            Color(hex: "2E5C8A"), Color(hex: "7A3E8C"), Color(hex: "D4762C"),
            Color(hex: "1A6B5A"), Color(hex: "8B4513")
        ]
        return palette[colorSeed % palette.count]
    }
}

// MARK: - Guest invite API keys (match the server's duration keys)

extension InviteDuration {
    var apiKey: String {
        switch self {
        case .oneDay:        return "24h"
        case .sevenDays:     return "7d"
        case .thirtyDays:    return "30d"
        case .endOfSemester: return "semester"
        }
    }
}

// MARK: - Guest access status (server: /api/guest/status)

nonisolated struct GuestStatus: Decodable {
    struct Pass: Decodable {
        let sponsorName: String
        let expiresAt: Date
    }
    let emailVerified: Bool?
    let pass: Pass?
    let requestStatus: String?
    /// True when the server says this guest may open the Library.
    let canAccessBacklog: Bool?
}

// MARK: - Reminder to add a school email (guests only)

enum SchoolEmailPrompt {
    private static let key = "br_school_email_prompt_at"
    /// Ask at most once a week, and never in the first minute of a brand-new account's first launch.
    static func due(now: Date = Date()) -> Bool {
        guard let last = UserDefaults.standard.object(forKey: key) as? Date else { return true }
        return now.timeIntervalSince(last) > 7 * 24 * 3600
    }
    static func markShown() { UserDefaults.standard.set(Date(), forKey: key) }
}
