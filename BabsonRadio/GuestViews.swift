import SwiftUI

// MARK: - Guest sign-up / sign-in (free: Firebase email + password, no SMS, no email links)
// Guests can listen live. The Library needs a student's sponsor pass or a student connection.

struct GuestAuthView: View {
    @StateObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) var scheme
    @Environment(\.dismiss) private var dismiss

    enum Mode { case create, signIn, reset }
    @State private var mode: Mode = .create
    @State private var name = ""
    @State private var agreed = false
    @State private var email = ""
    @State private var password = ""

    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 16) {
                Text("GUEST ACCESS")
                    .font(BRFont.display(26))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    .kerning(4)
                    .padding(.top, 56)
                Text("Live radio is free. A Babson student can unlock the Library for you.")
                    .font(.system(size: 13))
                    .foregroundColor(sub)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 8)

                VStack(spacing: 14) {
                    if mode == .create {
                        BRTextField(placeholder: "Your name", text: $name, icon: "person")
                    }
                    BRTextField(placeholder: "Email", text: $email, icon: "envelope",
                                keyboardType: .emailAddress, textContentType: .emailAddress,
                                autocapitalization: .never)
                    if mode != .reset {
                        BRTextField(placeholder: "Password", text: $password, icon: "lock",
                                    textContentType: mode == .signIn ? .password : .newPassword, isSecure: true)
                    }
                }
                .padding(.horizontal, 24)

                if mode == .create {
                    AgreeToggle(agreed: $agreed).padding(.horizontal, 24)
                }
                if let err = auth.errorMessage {
                    Text(err).font(.system(size: 13)).foregroundColor(.brRed).padding(.horizontal, 24)
                }
                if let info = auth.infoMessage {
                    Text(info).font(.system(size: 13)).foregroundColor(sub).padding(.horizontal, 24)
                }

                Button(action: submit) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12).fill(accent).frame(height: 52)
                        if auth.isLoading {
                            ProgressView().progressViewStyle(CircularProgressViewStyle(tint: scheme == .dark ? .brDkBg : .white))
                        } else {
                            Text(mode == .create ? "CREATE ACCOUNT" : mode == .signIn ? "SIGN IN" : "SEND RESET LINK")
                                .font(BRFont.display(16)).kerning(3)
                                .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                        }
                    }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 24)
                .disabled(auth.isLoading)

                HStack(spacing: 20) {
                    if mode != .create { link("Create account") { switchTo(.create) } }
                    if mode != .signIn { link("Sign in") { switchTo(.signIn) } }
                    if mode != .reset { link("Forgot password?") { switchTo(.reset) } }
                }
                .padding(.top, 4)

                Button("I have a Babson email") { dismiss() }
                    .font(.system(size: 13)).foregroundColor(sub).padding(.top, 12)
                    .padding(.bottom, 40)
            }
        }
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
        .ignoresSafeArea()
        .onAppear { auth.errorMessage = nil; auth.infoMessage = nil }
    }

    private func link(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(title, action: action).font(.system(size: 13, weight: .medium)).foregroundColor(accent)
    }

    private func switchTo(_ m: Mode) { auth.errorMessage = nil; auth.infoMessage = nil; mode = m }

    private func submit() {
        switch mode {
        case .create: auth.guestSignUp(email: email, password: password, name: name, agreed: agreed)
        case .signIn: auth.guestSignIn(email: email, password: password)
        case .reset:  auth.sendPasswordReset(email: email)
        }
    }
}

// MARK: - Guest home (status, sponsor request, sign out, delete)

struct GuestProfileView: View {
    let user: BRUser
    @StateObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var sponsorEmail = ""
    @State private var showSchoolEmail = false

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }
    private var card: Color { scheme == .dark ? .brDkSurface : .brLtSurface }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Hi, \(user.displayName)")
                        .font(BRFont.display(28)).foregroundColor(text)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(statusTitle).font(.system(size: 16, weight: .semibold)).foregroundColor(text)
                        Text(statusDetail).font(.system(size: 13)).foregroundColor(sub)
                        Text("Live radio is open to everyone who is signed in.")
                            .font(.system(size: 12)).foregroundColor(sub).padding(.top, 4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(card)
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Are you a Babson, Olin or Wellesley student?").font(.system(size: 15, weight: .semibold)).foregroundColor(text)
                        Text("Add your school email to unlock the Library, ratings, reactions and friends.")
                            .font(.system(size: 13)).foregroundColor(sub)
                        Button("Add my school email") { showSchoolEmail = true }
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(accent)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(card)
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                    if auth.guestStatus?.emailVerified != true && !user.emailVerifiedHint {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Verify your email to ask a student for more time.")
                                .font(.system(size: 13)).foregroundColor(sub)
                            HStack(spacing: 12) {
                                Button("Resend link") { auth.resendVerification() }
                                Button("I've verified") { auth.refreshGuestStatus() }
                            }
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(accent)
                        }
                    } else if auth.guestStatus?.requestStatus == "pending" {
                        Text("Waiting for your Babson contact to approve.")
                            .font(.system(size: 13)).foregroundColor(sub)
                    } else {
                        VStack(alignment: .leading, spacing: 10) {
                            if auth.guestStatus?.requestStatus == "denied" {
                                Text("That request wasn't approved.").font(.system(size: 13)).foregroundColor(.brRed)
                            }
                            BRTextField(placeholder: "Student's Babson username", text: $sponsorEmail, icon: "person.badge.plus",
                                        keyboardType: .emailAddress, autocapitalization: .never,
                                        suffix: "@babson.edu")
                            Button("SEND REQUEST") { auth.requestSponsor(email: sponsorEmail.trimmingCharacters(in: .whitespaces) + "@babson.edu"); sponsorEmail = "" }
                                .font(BRFont.display(14)).kerning(2).foregroundColor(accent)
                                .disabled(sponsorEmail.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }

                    if let err = auth.errorMessage { Text(err).font(.system(size: 13)).foregroundColor(.brRed) }
                    if let info = auth.infoMessage { Text(info).font(.system(size: 13)).foregroundColor(sub) }

                    DeleteAccountButton().padding(.top, 16)

                    DesignedByCredit()
                }
                .padding(20)
            }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
            .navigationTitle("Guest")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Sign Out") { auth.signOut() }.font(.system(size: 13)).foregroundColor(sub)
                }
            }
        }
        .sheet(isPresented: $showSchoolEmail) { AddSchoolEmailView() }
        .onAppear { auth.refreshGuestStatus() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { auth.refreshGuestStatus() } }
    }

    private static let fmt: DateFormatter = {
        let f = DateFormatter(); f.dateStyle = .medium; f.timeStyle = .short; return f
    }()

    private var statusTitle: String {
        if let p = auth.guestStatus?.pass, p.expiresAt > Date() { return "Library unlocked by \(p.sponsorName)" }
        if auth.canAccessLibrary { return "The Library is open for you" }
        return "Live radio is open to you"
    }

    private var statusDetail: String {
        if let p = auth.guestStatus?.pass, p.expiresAt > Date() { return "Expires \(Self.fmt.string(from: p.expiresAt))." }
        if auth.canAccessLibrary { return "Your access is checked again at the end of the semester." }
        return "Ask a Babson student to sponsor you to unlock the Library."
    }
}

// MARK: - Delete my account (students, developers and guests)

struct DeleteAccountButton: View {
    @StateObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) var scheme
    @State private var confirming = false
    @State private var confirmingApple = false
    @State private var password = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button("Delete my account") { if auth.isAppleUser { confirmingApple = true } else { confirming = true } }
                .font(.system(size: 13)).foregroundColor(.brRed)
        }
        .sheet(isPresented: $confirmingApple) {
            VStack(spacing: 16) {
                Text("DELETE YOUR ACCOUNT?").font(BRFont.display(24)).kerning(2)
                Text("This permanently removes your account and data. Confirm with Apple to continue.")
                    .font(.system(size: 14)).multilineTextAlignment(.center)
                AppleSignInButton(purpose: .confirmDelete)
                Button("Cancel") { confirmingApple = false }.font(.system(size: 13))
            }
            .padding(28)
            .presentationDetents([.medium])
        }
        .alert("Delete your account?", isPresented: $confirming) {
            SecureField("Password", text: $password)
            Button("Delete forever", role: .destructive) {
                auth.deleteAccount(password: password); password = ""
            }
            Button("Cancel", role: .cancel) { password = "" }
        } message: {
            Text("This permanently removes your account and data. Enter your password to confirm.")
        }
    }
}

// MARK: - Shown where guests can't go (Go On Air, episodes)

struct GuestLockedNote: View {
    let text: String
    @Environment(\.colorScheme) var scheme
    var body: some View {
        VStack(spacing: 8) {
            Text("BABSON STUDENTS ONLY").font(BRFont.display(18)).kerning(2)
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
            Text(text).font(.system(size: 13)).multilineTextAlignment(.center)
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Add a school email (guests who are students)

struct AddSchoolEmailView: View {
    @StateObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var domain = "@babson.edu"
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var gradYear = ""
    @State private var password = ""

    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }
    private var ready: Bool {
        !username.trimmingCharacters(in: .whitespaces).isEmpty && !firstName.isEmpty && !lastName.isEmpty && !gradYear.isEmpty && !password.isEmpty
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let sent = auth.schoolEmailSentTo {
                        Text("Check \(sent)").font(BRFont.display(22)).foregroundColor(scheme == .dark ? .brDkText : .brLtText).padding(.top, 24)
                        Text("Open the link we sent. Then sign out and sign back in with your school email and the same password you use now.")
                            .font(.system(size: 14)).foregroundColor(sub).multilineTextAlignment(.center)
                        Button("Sign out now") { auth.schoolEmailSentTo = nil; auth.signOut(); dismiss() }
                            .font(.system(size: 14, weight: .semibold)).foregroundColor(accent).padding(.top, 8)
                    } else {
                        Text("Add your school email").font(BRFont.display(22)).foregroundColor(scheme == .dark ? .brDkText : .brLtText).padding(.top, 24)
                        Text("We will send a confirmation link to it. Your account keeps working until then.")
                            .font(.system(size: 13)).foregroundColor(sub).multilineTextAlignment(.center)
                        BRTextField(placeholder: "School username", text: $username, icon: "envelope",
                                    keyboardType: .emailAddress, autocapitalization: .never,
                                    suffix: domain, domainChoice: $domain, domainOptions: AuthManager.schoolDomains)
                        BRTextField(placeholder: "First name", text: $firstName, icon: "person", textContentType: .givenName)
                        BRTextField(placeholder: "Last name", text: $lastName, icon: "person", textContentType: .familyName)
                        Picker("Graduation year", selection: $gradYear) {
                            Text("Graduation year").tag("")
                            ForEach(Terms.gradYearOptions(), id: \.value) { Text($0.label).tag($0.value) }
                        }.pickerStyle(.menu).tint(accent).frame(maxWidth: .infinity, alignment: .leading)
                        BRTextField(placeholder: "Your current password", text: $password, icon: "lock",
                                    textContentType: .password, isSecure: true)
                        if let err = auth.errorMessage { Text(err).font(.system(size: 13)).foregroundColor(.brRed) }
                        Button(action: {
                            auth.addSchoolEmail(email: username.trimmingCharacters(in: .whitespaces).lowercased() + domain,
                                                firstName: firstName.trimmingCharacters(in: .whitespaces),
                                                lastName: lastName.trimmingCharacters(in: .whitespaces),
                                                gradYear: gradYear, password: password)
                        }) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 12).fill(accent).frame(height: 52)
                                if auth.isLoading { ProgressView() } else {
                                    Text("SEND CONFIRMATION LINK").font(BRFont.display(15)).kerning(2)
                                        .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                                }
                            }
                        }
                        .buttonStyle(.plain).disabled(!ready || auth.isLoading).opacity(ready ? 1 : 0.5)
                    }
                }
                .padding(.horizontal, 24).padding(.bottom, 40)
            }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        .onAppear { auth.errorMessage = nil; auth.infoMessage = nil }
    }
}
