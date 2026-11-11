import SwiftUI

// MARK: - Sign-in splash and "about you" step
//
// Flow: launch splash -> WelcomeView (Continue with email, or Just listen for now as a guest) -> OnboardingView (name, phone,
// grad year, birthday or age range). Email and password is the only way to sign in. ContentView decides which step to show
// from AuthManager's flags.

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
            .background(HWFieldFill())
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

                // Two options, the same size: sign in or sign up with email, or listen without an account.
                VStack(spacing: 12) {
                    PrimaryButton(title: "CONTINUE WITH EMAIL", style: style) { showEmail = true }
                    Button(action: onSkip) {
                        Text("JUST LISTEN FOR NOW").font(BRFont.display(18)).kerning(3)
                            .frame(maxWidth: .infinity).padding(.vertical, 15)
                            .foregroundColor(style.text)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(style.border, lineWidth: 1.5))
                            .contentShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)

                    if let error = auth.errorMessage {
                        Text(error).font(BRFont.body(13, .regular)).foregroundColor(.brRed).multilineTextAlignment(.center)
                    }
                    Text("No account needed to listen. Students: add your school email and verify it within 7 days.")
                        .font(BRFont.body(12, .regular)).foregroundColor(style.sub).multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 28)
            }
            if auth.isLoading { ProgressView().controlSize(.large) }
        }
        .hwSplash()
        .sheet(isPresented: $showEmail) { AuthView() }
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
                    TextField("", text: $firstName, prompt: Text("First name").foregroundColor(.brPlaceholder)).textContentType(.givenName)
                    TextField("", text: $lastName, prompt: Text("Last name").foregroundColor(.brPlaceholder)).textContentType(.familyName)
                    TextField("", text: $phone, prompt: Text("Phone number (10 digits)").foregroundColor(.brPlaceholder))
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
                    .font(BRFont.body(12, .regular)).foregroundColor(style.sub).underline()
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
        .hwSplash()
        .interactiveDismissDisabled()
        .task {
            // Fill in whatever we already have (details from the email sign-up).
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
