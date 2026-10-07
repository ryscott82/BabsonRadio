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
    /// While the 3-day window is running and the email link hasn't been clicked: the day the link is needed by.
    @Published var verifyDeadline: Date? = nil
    @Published var pendingEmail = ""
    /// Guest-only: trial / sponsor pass details from /api/guest/status.
    @Published var guestStatus: GuestStatus? = nil
    private var expiryTimer: Timer?
    /// Invisible mode: hides you from "tuned in" lists and from friends' "liked this" hints.
    @Published var isInvisible = false

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

    /// LIVE radio: students and developers, plus guests with an active trial or sponsored pass.
    /// (Stored episodes are separate and are NEVER available to guests.)
    var canListenLive: Bool {
        guard isSignedIn, let u = currentUser else { return false }
        if !u.isGuest { return true }
        return guestStatus?.hasLiveAccess(at: Date()) ?? false
    }

    /// Stops playback at the moment a guest's access runs out.
    func scheduleExpiryCheck() {
        expiryTimer?.invalidate()
        guard let end = guestStatus?.liveAccessEnds, end > Date() else { return }
        expiryTimer = Timer.scheduledTimer(withTimeInterval: end.timeIntervalSinceNow + 0.5, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.objectWillChange.send(); self?.enforceAccess() }
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
            guestStatus = nil
            enforceAccess()
            return
        }

        let email = user.email ?? ""
        let claims = try? await user.getIDTokenResult()
        let isDev = (claims?.claims["developer"] as? Bool) == true

        // Non-Babson, non-developer accounts are guests: live radio only (trial or sponsor pass).
        if !isDev && !Self.isBabsonEmail(email) {
            needsEmailVerification = false
            guestStatus = try? await BackendAPI.get("/api/guest/status")
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
        // New accounts can use the app for 3 days before the email link is required (the server and rules agree).
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

        // Pre-launch: a beta tester (email on the station's list) gets the site pass from their own sign-in,
        // so no shared password is needed in the app.
        if !isDev && BackendConfig.previewKey.isEmpty,
           let pass: GatePass = try? await BackendAPI.post("/api/prelaunch/session", [:]) {
            BackendConfig.setPreviewKey(pass.gate)
        }

        let me: MeResponse? = try? await BackendAPI.get("/api/me")
        isInvisible = me?.invisible ?? false
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
        let digits = phoneNumber.filter(\.isNumber)
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
                await apply(Auth.auth().currentUser)   // first status call starts the free trial
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
        errorMessage = nil; infoMessage = nil
        Task {
            try? await Auth.auth().sendPasswordReset(withEmail: e)
            infoMessage = "If that account exists, a reset link is on its way."   // never reveal which accounts exist
        }
    }

    /// Re-reads the account and the guest's trial / pass / request state.
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
    private struct GatePass: Decodable { let gate: String }
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
                infoMessage = "Sent again. Check your inbox and spam folder."
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
        BackendConfig.setPreviewKey(nil)
        try? Auth.auth().signOut()
        currentUser = nil
        isSignedIn = false
        needsEmailVerification = false
        verifyDeadline = nil
        guestStatus = nil
        enforceAccess()
    }

#else

    // Firebase package not added yet: the app compiles and the UI is reachable, but nothing is real.
    static var firebaseReady: Bool { false }

    private init() {}

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
    func deleteAccount(password: String) { errorMessage = Self.setupMessage }

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

    var initials: String {
        if !lastName.isEmpty, let f = displayName.first, let l = lastName.first {
            return "\(f)\(l)".uppercased()
        }
        let parts = displayName.split(separator: " ")
        if parts.count >= 2 {
            return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
        }
        return String(displayName.prefix(2)).uppercased()
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
    let trialEndsAt: Date?
    let pass: Pass?
    let requestStatus: String?

    /// Latest moment live radio is allowed (the later of trial end and sponsor-pass end).
    var liveAccessEnds: Date? {
        [trialEndsAt, pass?.expiresAt].compactMap { $0 }.max()
    }

    func hasLiveAccess(at date: Date) -> Bool {
        guard let end = liveAccessEnds else { return false }
        return end > date
    }
}
