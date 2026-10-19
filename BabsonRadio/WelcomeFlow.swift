import SwiftUI
import AuthenticationServices
import CryptoKit

// MARK: - Sign-in splash, school email step and "about you" step
//
// Flow: launch splash -> WelcomeView (Sign in with Apple or email) -> for Apple accounts, AppleSchoolEmailView
// (a Babson, Olin or Wellesley email, verified within 7 days) -> OnboardingView (name, phone, grad year,
// birthday or age range). ContentView decides which one to show from AuthManager's flags.

// MARK: Apple sign-in pieces

enum AppleNonce {
    /// Random string sent to Apple (hashed) and to Firebase (raw), so the sign-in can't be replayed.
    static func random(length: Int = 32) -> String {
        let chars = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String((0..<length).map { _ in chars.randomElement()! })
    }
    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

struct AppleSignInButton: View {
    enum Purpose { case signIn, confirmDelete }
    var purpose: Purpose = .signIn
    @Environment(\.colorScheme) private var scheme
    @State private var nonce = ""

    var body: some View {
        SignInWithAppleButton(.continue) { request in
            nonce = AppleNonce.random()
            request.requestedScopes = purpose == .signIn ? [.fullName, .email] : []
            request.nonce = AppleNonce.sha256(nonce)
        } onCompletion: { result in
            switch purpose {
            case .signIn: AuthManager.shared.signInWithApple(result, rawNonce: nonce)
            case .confirmDelete: AuthManager.shared.deleteAccountWithApple(result, rawNonce: nonce)
            }
        }
        .signInWithAppleButtonStyle(scheme == .dark ? .white : .black)
        .frame(height: 50)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: Shared look (green accent, no yellow)

private struct FlowStyle {
    let scheme: ColorScheme
    var accent: Color { scheme == .dark ? Color(red: 0.18, green: 0.77, blue: 0.55) : .brGreen }
    var text: Color { scheme == .dark ? .brDkText : .brLtText }
    var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    var field: Color { scheme == .dark ? .brDkSurface : .brLtSurface }
    var border: Color { scheme == .dark ? .brDkBorder2 : .brLtBorder }
    /// Same backgrounds as the launch splash, so the hand-off from it is smooth.
    var background: Color { scheme == .dark ? .black : Color(red: 0.953, green: 0.914, blue: 0.824) }
}

private struct PrimaryButton: View {
    let title: String
    let style: FlowStyle
    var enabled = true
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(BRFont.display(18)).kerning(3)
                .frame(maxWidth: .infinity).padding(.vertical, 15)
                .background(style.accent.opacity(enabled ? 1 : 0.35))
                .foregroundColor(style.scheme == .dark ? Color(hex: "0B1A12") : .white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

private func fieldBox(_ style: FlowStyle) -> some ViewModifier { FieldBox(style: style) }
private struct FieldBox: ViewModifier {
    let style: FlowStyle
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(style.field)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(style.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Sign-in splash

struct WelcomeView: View {
    var onSkip: () -> Void
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) private var scheme
    @State private var showEmail = false
    private var style: FlowStyle { FlowStyle(scheme: scheme) }

    var body: some View {
        ZStack {
            style.background.ignoresSafeArea()
            VStack(spacing: 0) {
                Spacer()
                Image("LaunchLogo").resizable().scaledToFit().frame(width: 130)
                VStack(spacing: 0) {
                    Text("Babson").font(BRFont.display(14)).foregroundColor(style.accent).kerning(5)
                    Text("Radio").font(BRFont.display(40)).foregroundColor(style.text).kerning(5)
                }
                .padding(.top, 8)
                Text("Student radio for Babson College.")
                    .font(BRFont.body(14, .regular)).foregroundColor(style.sub).padding(.top, 6)
                Spacer()

                VStack(spacing: 12) {
                    AppleSignInButton()
                    Button { showEmail = true } label: {
                        Text("Continue with email").font(BRFont.display(16)).kerning(3)
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .foregroundColor(style.text)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(style.border, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)

                    if let error = auth.errorMessage {
                        Text(error).font(BRFont.body(13, .regular)).foregroundColor(.brRed).multilineTextAlignment(.center)
                    }
                    Text("Students: add your school email and verify it within 7 days.")
                        .font(BRFont.body(12, .regular)).foregroundColor(style.sub).multilineTextAlignment(.center)
                        .padding(.top, 4)
                    Button("Just listen for now", action: onSkip)
                        .font(BRFont.body(12, .regular)).foregroundColor(style.sub).underline()
                        .padding(.top, 6)
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 28)
            }
            if auth.isLoading { ProgressView().controlSize(.large) }
        }
        .sheet(isPresented: $showEmail) { AuthView() }
    }
}

// MARK: - School email for Sign in with Apple accounts

struct AppleSchoolEmailView: View {
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) private var scheme
    @State private var username = ""
    @State private var domain = AuthManager.schoolDomains[0]
    @State private var agreed = false
    private var style: FlowStyle { FlowStyle(scheme: scheme) }
    private var fullEmail: String { username.trimmingCharacters(in: .whitespaces).lowercased() + domain }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "graduationcap").font(.system(size: 38)).foregroundColor(style.accent).padding(.top, 70)
                Text("Add your school email").font(BRFont.display(30)).kerning(3).foregroundColor(style.text)
                Text("Add your school email and verify it within 7 days.")
                    .font(BRFont.body(14, .regular)).foregroundColor(style.sub).multilineTextAlignment(.center)

                HStack(spacing: 6) {
                    TextField("username", text: $username)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.emailAddress)
                    Menu {
                        ForEach(AuthManager.schoolDomains, id: \.self) { d in Button(d) { domain = d } }
                    } label: {
                        HStack(spacing: 4) {
                            Text(domain).foregroundColor(style.accent)
                            Image(systemName: "chevron.up.chevron.down").font(.system(size: 11)).foregroundColor(style.accent)
                        }
                    }
                }
                .font(.system(size: 16)).foregroundColor(style.text)
                .modifier(fieldBox(style))

                Toggle(isOn: $agreed) {
                    (Text("I agree to the ") + Text("[Terms of Use](https://babsonradio.com/terms)") + Text(" and ")
                     + Text("[Privacy Policy](https://babsonradio.com/privacy)") + Text("."))
                        .font(BRFont.body(12, .regular)).foregroundColor(style.sub)
                }
                .tint(style.accent)

                PrimaryButton(title: auth.isLoading ? "SENDING…" : "SEND VERIFICATION LINK", style: style,
                              enabled: !username.trimmingCharacters(in: .whitespaces).isEmpty && agreed && !auth.isLoading) {
                    auth.submitAppleSchoolEmail(email: fullEmail, agreed: agreed)
                }

                if let info = auth.infoMessage {
                    Text(info).font(BRFont.body(13, .regular)).foregroundColor(style.sub).multilineTextAlignment(.center)
                }
                if let error = auth.errorMessage {
                    Text(error).font(BRFont.body(13, .regular)).foregroundColor(.brRed).multilineTextAlignment(.center)
                }
                Button("Sign out") { auth.signOut() }
                    .font(BRFont.body(13, .regular)).foregroundColor(style.sub)
            }
            .padding(.horizontal, 28)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(style.background.ignoresSafeArea())
    }
}

// MARK: - About you: contact details and birthday (or age range)

struct OnboardingView: View {
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) private var scheme
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var phone = ""
    @State private var gradYear = ""
    @State private var birthday = Calendar.current.date(byAdding: .year, value: -20, to: Date()) ?? Date()
    @State private var birthdayPicked = false
    @State private var useRange = false
    @State private var range = ""          // under13, 13-17, 18-24, 25plus
    @State private var parentOK = false
    @State private var saving = false
    private var style: FlowStyle { FlowStyle(scheme: scheme) }

    private static let ranges: [(value: String, label: String)] =
        [("under13", "Under 13"), ("13-17", "13–17"), ("18-24", "18–24"), ("25plus", "25+")]

    /// Age from the birthday, or the middle of the chosen range. nil until something is picked.
    private var age: Int? {
        if useRange {
            switch range { case "under13": return 12; case "13-17": return 15; case "18-24": return 20; case "25plus": return 30; default: return nil }
        }
        guard birthdayPicked else { return nil }
        return Calendar.current.dateComponents([.year], from: birthday, to: Date()).year
    }
    private var isMinor: Bool { (age ?? 99) >= 13 && (age ?? 99) < 18 }
    private var isUnder13: Bool { (age ?? 99) < 13 }
    private var phoneDigits: String { PhoneField.digits(phone) }
    private var canContinue: Bool {
        !firstName.trimmingCharacters(in: .whitespaces).isEmpty && !lastName.trimmingCharacters(in: .whitespaces).isEmpty
            && phoneDigits.count == 10 && !gradYear.isEmpty && age != nil && (!isMinor || parentOK) && !saving
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("About you").font(BRFont.display(32)).kerning(3).foregroundColor(style.text).padding(.top, 56)
                Text("Almost done.").font(BRFont.body(14, .regular)).foregroundColor(style.sub)
                if let info = auth.infoMessage {
                    Text(info).font(BRFont.body(13, .regular)).foregroundColor(style.accent)
                }

                Group {
                    TextField("First name", text: $firstName).textContentType(.givenName)
                    TextField("Last name", text: $lastName).textContentType(.familyName)
                    TextField("Phone number (10 digits)", text: $phone)
                        .keyboardType(.phonePad).textContentType(.telephoneNumber)
                        .onChange(of: phone) { _, v in phone = PhoneField.digits(v) }
                    Picker("Graduation year", selection: $gradYear) {
                        Text("Graduation year").tag("")
                        ForEach(Terms.gradYearOptions(), id: \.value) { Text($0.label).tag($0.value) }
                    }
                    .pickerStyle(.menu).tint(style.accent)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .font(BRFont.body(16, .regular)).foregroundColor(style.text)
                .modifier(fieldBox(style))

                // Birthday, or an age range for people who would rather not share it.
                VStack(alignment: .leading, spacing: 8) {
                    Text(useRange ? "Your age range" : "Your birthday")
                        .font(BRFont.body(15, .semibold)).foregroundColor(style.text)
                    if useRange {
                        Picker("Age range", selection: $range) {
                            ForEach(Self.ranges, id: \.value) { Text($0.label).tag($0.value) }
                        }
                        .pickerStyle(.segmented)
                        if isUnder13 {
                            Text("Babson Radio is for people 13 and older. If you continue, your account will be deleted.")
                                .font(BRFont.body(12, .regular)).foregroundColor(.brRed)
                        }
                    } else {
                        DatePicker("Birthday", selection: $birthday, in: ...Date(), displayedComponents: .date)
                            .datePickerStyle(.wheel).labelsHidden()
                            .onChange(of: birthday) { _, _ in birthdayPicked = true }
                            .frame(maxWidth: .infinity)
                        if isUnder13 {
                            Text("Babson Radio is for people 13 and older. If you continue, your account will be deleted.")
                                .font(BRFont.body(12, .regular)).foregroundColor(.brRed)
                        }
                    }
                    Button(useRange ? "Use birthday instead" : "use age range instead") {
                        withAnimation { useRange.toggle() }
                    }
                    .font(.system(size: 12)).foregroundColor(style.sub).underline()
                    Text("Never shown to others.")
                        .font(BRFont.body(11, .regular)).foregroundColor(style.sub)
                }

                if isMinor {
                    Toggle(isOn: $parentOK) {
                        Text("A parent or guardian knows I'm using Babson Radio and is okay with it.")
                            .font(BRFont.body(13, .regular)).foregroundColor(style.text)
                    }
                    .tint(style.accent)
                }

                PrimaryButton(title: saving ? "SAVING…" : "CONTINUE", style: style, enabled: canContinue) { save() }

                if let error = auth.errorMessage {
                    Text(error).font(BRFont.body(13, .regular)).foregroundColor(.brRed)
                }
            }
            .padding(.horizontal, 28).padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(style.background.ignoresSafeArea())
        .interactiveDismissDisabled()
        .task {
            // Fill in whatever we already have (a name from Apple, or details from an email sign-up).
            if let u = auth.currentUser {
                if firstName.isEmpty { firstName = u.displayName }
                if lastName.isEmpty { lastName = u.lastName }
                if phone.isEmpty { phone = PhoneField.digits(u.phoneNumber) }
            }
            if let me: MeResponse = try? await BackendAPI.get("/api/me") {
                if gradYear.isEmpty { gradYear = me.gradYear ?? "" }
                if me.firstName.isEmpty == false, firstName.isEmpty { firstName = me.firstName }
            }
        }
    }

    private func save() {
        saving = true
        let comps = Calendar.current.dateComponents([.year, .month, .day], from: birthday)
        Task {
            _ = await auth.submitOnboarding(
                firstName: firstName.trimmingCharacters(in: .whitespaces),
                lastName: lastName.trimmingCharacters(in: .whitespaces),
                phone: phoneDigits, gradYear: gradYear,
                birthdate: useRange ? nil : comps, ageRange: useRange ? range : nil,
                parentalConsent: isMinor && parentOK)
            saving = false
        }
    }
}
