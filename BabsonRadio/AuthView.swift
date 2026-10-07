import SwiftUI

// MARK: - Auth Gate
// Shown when the user is not signed in. Wraps sign-in and create-account flows.

struct AuthView: View {
    @StateObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) var scheme

    @State private var mode: Mode = .signIn
    @State private var email = ""   // just the part before @babson.edu
    private var fullEmail: String { email.trimmingCharacters(in: .whitespaces).lowercased() + "@babson.edu" }
    @State private var password = ""
    @State private var displayName = ""
    @State private var lastName = ""
    @State private var phoneNumber = ""
    @State private var showGuest = false
    @FocusState private var focusedField: Field?

    // Dev mode
    @State private var devTapCount = 0
    @State private var showDevEntry = false
    @State private var devPassword = ""
    @State private var devEmail = ""
    @FocusState private var devFieldFocused: Bool

    enum Mode { case signIn, createAccount }
    enum Field { case name, phone, email, password }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {

                // ── Logo block ─────────────────────────────────
                VStack(spacing: 4) {
                    Text("BABSON")
                        .font(BRFont.display(16))
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                        .kerning(6)
                    Text("RADIO")
                        .font(BRFont.display(52))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        .kerning(8)
                    Text("Student Radio — Babson College")
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
                .padding(.top, 72)
                .padding(.bottom, 52)

                // ── Mode toggle ────────────────────────────────
                HStack(spacing: 0) {
                    modeTab(title: "Sign In", active: mode == .signIn) {
                        withAnimation { mode = .signIn }
                    }
                    modeTab(title: "Create Account", active: mode == .createAccount) {
                        withAnimation { mode = .createAccount }
                    }
                }
                .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1)
                )
                .padding(.horizontal, 24)
                .padding(.bottom, 28)

                // ── Fields ─────────────────────────────────────
                VStack(spacing: 14) {
                    if mode == .createAccount {
                        BRTextField(
                            placeholder: "First name",
                            text: $displayName,
                            icon: "person"
                        )
                        .focused($focusedField, equals: .name)
                        .transition(.move(edge: .top).combined(with: .opacity))

                        BRTextField(
                            placeholder: "Last name",
                            text: $lastName,
                            icon: "person"
                        )
                        .transition(.move(edge: .top).combined(with: .opacity))

                        PhoneField(phoneNumber: $phoneNumber)
                            .focused($focusedField, equals: .phone)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }

                    BRTextField(
                        placeholder: "Babson username",
                        text: $email,
                        icon: "envelope",
                        keyboardType: .emailAddress,
                        textContentType: .username,
                        autocapitalization: .never,
                        suffix: "@babson.edu"
                    )
                    .focused($focusedField, equals: .email)

                    BRTextField(
                        placeholder: "Password",
                        text: $password,
                        icon: "lock",
                        textContentType: mode == .signIn ? .password : .newPassword,
                        isSecure: true
                    )
                    .focused($focusedField, equals: .password)
                }
                .padding(.horizontal, 24)

                // ── Error message ──────────────────────────────
                if let err = auth.errorMessage {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.circle")
                            .font(.system(size: 13))
                        Text(err)
                            .font(.system(size: 13))
                    }
                    .foregroundColor(.brRed)
                    .padding(.horizontal, 24)
                    .padding(.top, 12)
                    .transition(.opacity)
                }

                // ── CTA button ─────────────────────────────────
                Button(action: submit) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(scheme == .dark ? Color.brGold : Color.brGreen)
                            .frame(height: 52)

                        if auth.isLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(
                                    tint: scheme == .dark ? .brDkBg : .white
                                ))
                        } else {
                            Text(mode == .signIn ? "SIGN IN" : "CREATE ACCOUNT")
                                .font(BRFont.display(16))
                                .kerning(3)
                                .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                        }
                    }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .disabled(auth.isLoading)

                if mode == .signIn {
                    Button("Forgot password?") { auth.sendPasswordReset(email: fullEmail) }
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .padding(.top, 14)
                }
                if let info = auth.infoMessage {
                    Text(info)
                        .font(.system(size: 12))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .padding(.horizontal, 24)
                        .padding(.top, 8)
                }

                // ── Guests ─────────────────────────────────────
                Button(action: { showGuest = true }) {
                    Text("No Babson email? Continue as a guest")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                }
                .padding(.horizontal, 32)
                .padding(.top, 20)
                Text("Guests get 3 days of live radio free, and a Babson student can extend it.")
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.top, 6)
                    .padding(.bottom, 32)

                // ── Developer mode (hidden tap target) ─────────
                devModeSection
                    .padding(.bottom, 40)
            }
        }
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
        .ignoresSafeArea()
        .onTapGesture { focusedField = nil }
        .animation(.easeInOut(duration: 0.2), value: auth.errorMessage)
        .sheet(isPresented: $showGuest) { GuestAuthView() }
    }

    // MARK: - Actions

    private func submit() {
        focusedField = nil
        if mode == .signIn {
            auth.signIn(email: fullEmail, password: password)
        } else {
            auth.createAccount(
                email: fullEmail,
                password: password,
                displayName: displayName,
                lastName: lastName,
                phoneNumber: phoneNumber
            )
        }
    }

    // MARK: - Developer mode section

    @ViewBuilder
    private var devModeSection: some View {
        VStack(spacing: 12) {
            // Hidden tap target — 5 taps reveals the dev panel
            // (.opacity(0.001) instead of Color.clear — clear views don't receive taps in SwiftUI)
            Rectangle()
                .fill(Color.gray)
                .opacity(0.001)
                .frame(height: 24)
                .onTapGesture {
                    devTapCount += 1
                    if devTapCount >= 5 {
                        withAnimation { showDevEntry = true }
                    }
                }

            if showDevEntry {
                VStack(spacing: 10) {
                    HStack {
                        Image(systemName: "chevron.left.forwardslash.chevron.right")
                            .font(.system(size: 11))
                            .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                        Text("Developer Mode")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                    }

                    // Optional display email
                    HStack(spacing: 10) {
                        Image(systemName: "envelope")
                            .font(.system(size: 13))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .frame(width: 18)
                        TextField("Email (leave empty for the developer password)", text: $devEmail)
                            .font(.system(size: 14))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10)
                        .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1))

                    // Password field
                    HStack(spacing: 10) {
                        Image(systemName: "lock")
                            .font(.system(size: 13))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .frame(width: 18)
                        SecureField("Password", text: $devPassword)
                            .font(.system(size: 14))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                            .focused($devFieldFocused)
                            .onSubmit { tryDevBypass() }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10)
                        .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1))

                    Button(action: tryDevBypass) {
                        Text("ENTER")
                            .font(BRFont.display(12))
                            .kerning(2)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 8)
                            .background(Color.brDkBorder)
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .disabled(auth.isLoading)

                    // Show progress and errors right here, so the button never seems to do nothing.
                    if auth.isLoading {
                        ProgressView().controlSize(.small)
                    } else if let err = auth.errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(.brRed)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 24)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
    }

    private func tryDevBypass() {
        guard !devPassword.isEmpty else { return }
        devFieldFocused = false
        let email = devEmail.trimmingCharacters(in: .whitespaces)
        if email.isEmpty {
            // Same developer password as the website: no separate account needed.
            auth.devPasswordSignIn(password: devPassword)
        } else {
            auth.devSignIn(email: email, password: devPassword)   // a real developer account
        }
        devPassword = ""
    }

    // MARK: - Mode tab

    @ViewBuilder
    private func modeTab(title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(BRFont.display(13))
                .kerning(1)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    active
                        ? (scheme == .dark ? Color.brGold : Color.brGreen)
                        : Color.clear
                )
                .foregroundColor(
                    active
                        ? (scheme == .dark ? Color.brDkBg : .white)
                        : (scheme == .dark ? Color.brDkSub : Color.brLtSub)
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .padding(3)
    }
}

// MARK: - Reusable text field

struct BRTextField: View {
    var placeholder: String
    @Binding var text: String
    var icon: String
    var keyboardType: UIKeyboardType = .default
    var textContentType: UITextContentType? = nil
    var autocapitalization: TextInputAutocapitalization = .sentences
    var isSecure: Bool = false
    /// Fixed text shown after the field (e.g. "@babson.edu"). People type only the part before it.
    var suffix: String? = nil
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                .frame(width: 20)

            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(autocapitalization)
                        .autocorrectionDisabled()
                }
            }
            .font(.system(size: 15))
            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
            .if(textContentType != nil) { v in
                v.textContentType(textContentType!)
            }
            .onChange(of: text) { _, new in
                // If someone pastes a whole address, keep only the part before the @.
                if suffix != nil, let at = new.firstIndex(of: "@") { text = String(new[..<at]) }
            }

            if let suffix {
                Text(suffix)
                    .font(.system(size: 15))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    .fixedSize()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1)
        )
    }
}

// MARK: - Phone number field with live formatting

struct PhoneField: View {
    @Binding var phoneNumber: String
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "phone")
                .font(.system(size: 15))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                .frame(width: 20)

            TextField("Phone number", text: $phoneNumber)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .font(.system(size: 15))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                .onChange(of: phoneNumber) { _, new in
                    phoneNumber = Self.format(new)
                }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1)
        )
    }

    /// Formats a raw digit string as (XXX) XXX-XXXX while typing
    static func format(_ raw: String) -> String {
        let digits = raw.filter(\.isNumber)
        // Cap at 10 digits (US numbers)
        let capped = String(digits.prefix(10))
        switch capped.count {
        case 0:        return ""
        case 1...3:    return "(\(capped)"
        case 4...6:
            let area = capped.prefix(3)
            let mid  = capped.dropFirst(3)
            return "(\(area)) \(mid)"
        default:
            let area = capped.prefix(3)
            let mid  = capped.dropFirst(3).prefix(3)
            let last = capped.dropFirst(6)
            return "(\(area)) \(mid)-\(last)"
        }
    }

    /// Strips formatting back to raw digits for storage/Firebase
    static func digits(_ formatted: String) -> String {
        formatted.filter(\.isNumber)
    }
}

// Conditional modifier helper
extension View {
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition { transform(self) } else { self }
    }
}

#Preview {
    AuthView()
}
