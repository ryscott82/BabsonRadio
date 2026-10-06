import SwiftUI
import Combine

// MARK: - AuthManager
// Manages sign-in state. Firebase Auth calls will replace the stubs
// marked with "// TODO: Firebase" when Firebase is wired up.

class AuthManager: ObservableObject {

    static let shared = AuthManager()

    // ── Published state ───────────────────────────────────────────
    @Published var isSignedIn = false
    @Published var currentUser: BRUser? = nil
    @Published var isLoading = false
    @Published var errorMessage: String? = nil

    private init() {
        // TODO: Firebase — listen to Auth.auth().addStateDidChangeListener
        // and populate currentUser from Firestore on sign-in
    }

    // MARK: - Validation

    /// Returns true only for @babson.edu addresses.
    /// Non-Babson users can be invited but must be granted access;
    /// for now the invite flow creates a provisional account stub.
    static func isBabsonEmail(_ email: String) -> Bool {
        email.lowercased().hasSuffix("@babson.edu")
    }

    // MARK: - Sign In

    func signIn(email: String, password: String) {
        guard Self.isBabsonEmail(email) else {
            errorMessage = "Babson Radio is only available to Babson students. Use your @babson.edu email."
            return
        }
        errorMessage = nil
        isLoading = true

        // TODO: Firebase — Auth.auth().signIn(withEmail:password:)
        // then fetch user doc from Firestore to get stored phone number
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.isLoading = false
            self?.currentUser = BRUser(
                id: UUID().uuidString,
                displayName: String(email.prefix(while: { $0 != "@" })).capitalized,
                email: email,
                phoneNumber: "",   // populated from Firestore on real sign-in
                joinedDate: Date()
            )
            self?.isSignedIn = true
        }
    }

    // MARK: - Create Account

    func createAccount(email: String, password: String, displayName: String, phoneNumber: String) {
        guard Self.isBabsonEmail(email) else {
            errorMessage = "Babson Radio is only available to Babson students. Use your @babson.edu email."
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
        errorMessage = nil
        isLoading = true

        // TODO: Firebase — Auth.auth().createUser(withEmail:password:)
        //                  then write user doc to Firestore users/{uid}
        //                  store: displayName, email, phoneNumber (digits only), joinedDate
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.isLoading = false
            self?.currentUser = BRUser(
                id: UUID().uuidString,
                displayName: displayName.isEmpty
                    ? String(email.prefix(while: { $0 != "@" })).capitalized
                    : displayName,
                email: email,
                phoneNumber: digits,
                joinedDate: Date()
            )
            self?.isSignedIn = true
        }
    }

    // MARK: - Developer Bypass

    /// Accepts any email + password "developer". Skips @babson.edu check.
    /// For local testing only — never ships behind a release flag.
    func devBypass(email: String) {
        errorMessage = nil
        isLoading = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.isLoading = false
            let name = email.isEmpty ? "Developer" :
                String(email.prefix(while: { $0 != "@" })).capitalized
            self?.currentUser = BRUser(
                id: "dev-\(UUID().uuidString)",
                displayName: name,
                email: email.isEmpty ? "dev@babsonradio.com" : email,
                phoneNumber: "0000000000",
                joinedDate: Date(),
                isDeveloper: true
            )
            self?.isSignedIn = true
        }
    }

    // MARK: - Sign Out

    func signOut() {
        // TODO: Firebase — try? Auth.auth().signOut()
        currentUser = nil
        isSignedIn = false
    }
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

    var initials: String {
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
