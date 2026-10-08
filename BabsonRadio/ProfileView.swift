import SwiftUI
import Combine
import Contacts
import CryptoKit

// MARK: - Profile Tab
// Shows AuthView if signed out, signed-in profile otherwise.

struct ProfileView: View {
    @StateObject private var auth = AuthManager.shared

    var body: some View {
        if auth.isSignedIn, let user = auth.currentUser {
            if user.isGuest { GuestProfileView(user: user) } else { SignedInProfileView(user: user) }
        } else if auth.needsEmailVerification {
            VerifyEmailView()
        } else {
            AuthView()
        }
    }
}

// MARK: - Signed-In Profile

private struct SignedInProfileView: View {
    let user: BRUser
    @Environment(\.dismiss) private var dismiss
    @State private var showReport = false
    @State private var hostAvailable = false
    @StateObject private var auth = AuthManager.shared
    @ObservedObject private var contacts = ContactsManager.shared
    @StateObject private var presence = PresenceManager.shared
    @Environment(\.colorScheme) var scheme

    // Listeners (will come from Firestore presence in production)
    private var listeners: [LiveListener] {
        (0..<min(presence.count, 24)).map { LiveListener(id: "anon-\($0)", colorSeed: $0) }
    }

    // Single sheet driven by enum — never stack two .sheet modifiers
    enum ActiveSheet: Identifiable {
        case contactPicker
        case messageComposer(String)   // phone number
        var id: String {
            switch self {
            case .contactPicker:        return "picker"
            case .messageComposer(let n): return "composer-\(n)"
            }
        }
    }
    @State private var activeSheet: ActiveSheet? = nil

    // Guest invite
    @State private var guestEmail = ""
    @State private var selectedDuration: InviteDuration = .sevenDays
    @State private var activeInvites: [GuestInvite] = []
    @State private var inviteSent = false
    @State private var inviteError: String? = nil

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {

                    // ── Account card ───────────────────────────────
                    accountCard
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                        .padding(.bottom, 28)

                    // ── Tuned in right now ─────────────────────────
                    listenersSection
                        .padding(.bottom, 20)

                    invisibleSection
                        .padding(.bottom, 20)

                    if !user.isGuest {
                        AboutYouSection()
                            .padding(.horizontal, 20)
                            .padding(.bottom, 20)
                        NotificationChoicesSection()
                            .padding(.horizontal, 20)
                            .padding(.bottom, 20)
                    }

                    // Hosts (listed on a show) and staff get the radio controls and set list.
                    Color.clear.frame(height: 0)
                        .task {
                            if let s: HostStatus = try? await BackendAPI.get("/api/host/status") { hostAvailable = s.staff || !s.shows.isEmpty }
                        }
                    if user.isAdmin {
                        adminRow
                            .padding(.horizontal, 20)
                            .padding(.bottom, 20)
                    }
                    if hostAvailable {
                        hostRow
                            .padding(.horizontal, 20)
                            .padding(.bottom, 20)
                    }

                    // Students request a spot on the radio from here.
                    if !user.isGuest {
                        goOnAirRow
                            .padding(.horizontal, 20)
                            .padding(.bottom, 20)
                    }

                    reportRow
                        .padding(.horizontal, 20)
                        .padding(.bottom, user.isDeveloper ? 16 : 32)

                    if user.isDeveloper {
                        BeatDelayRow()
                            .padding(.horizontal, 20)
                            .padding(.bottom, 32)
                    }

                    // Students only: developers have no babson.edu identity to sponsor guests with.
                    if !user.isDeveloper {
                        // ── Guest access section ───────────────────────
                        guestInviteSection
                            .padding(.bottom, 20)

                        // ── Invite contacts section ─────────────────────
                        inviteSection
                            .padding(.bottom, 40)
                    } else {
                        Color.clear.frame(height: 40)
                    }

                    if let ig = BabsonLinks.instagram {
                        Link(destination: ig) {
                            Label("Follow Babson Sound on Instagram", systemImage: "camera")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 24)
                    }

                    DeleteAccountButton()
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)

                    DesignedByCredit()
                        .padding(.bottom, 24)
                }
            }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 0) {
                        Text("BABSON ")
                            .font(BRFont.display(18))
                            .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            .kerning(3)
                        Text("RADIO")
                            .font(BRFont.display(18))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                            .kerning(3)
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .font(.system(size: 14, weight: .medium))
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Sign Out") {
                        auth.signOut()
                        dismiss()
                    }
                    .font(.system(size: 13))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
            }
        }
        // Single sheet — avoids SwiftUI crash from stacking two .sheet modifiers
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .contactPicker:
                ContactPickerView(contacts: contacts) { phoneNumber in
                    activeSheet = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        activeSheet = .messageComposer(phoneNumber)
                    }
                }
            case .messageComposer(let number):
                MessageComposer(
                    recipients: [number],
                    body: InviteMessage.body(from: user.displayName),
                    isPresented: Binding(
                        get: { activeSheet != nil },
                        set: { if !$0 { activeSheet = nil } }
                    )
                )
                .ignoresSafeArea()
            }
        }
        .onChange(of: auth.isInvisible) { _, nowInvisible in
            if nowInvisible { contacts.clearSaved() } else { Task { await contacts.refreshSuggestions(force: true) } }
        }
        .task {
            // Only silently loads if access was previously granted — never auto-prompts
            await contacts.requestAccessIfNeeded()
        }
    }

    // MARK: - Account card

    private var accountCard: some View {
        HStack(spacing: 16) {
            // Avatar circle with initials
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Color.brGreen, Color(hex: "004430")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 58, height: 58)
                Text(user.initials)
                    .font(BRFont.display(22))
                    .foregroundColor(.white)
                    .kerning(1)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(user.displayName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                if !user.isDeveloper, AuthManager.isBabsonEmail(user.email) {
                    Text("@" + String(user.email.prefix(while: { $0 != "@" })))
                        .font(BRFont.display(13)).kerning(1.5)
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                }
                if user.isDeveloper {
                    BRTagChip(text: "DEVELOPER", style: .gold)
                }
                if let by = auth.verifyDeadline {
                    Text("Verify your email by \(by.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())). Check your inbox and spam.")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.brRed)
                }
                Text(user.email)
                    .font(.system(size: 13))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                if !user.phoneNumber.isEmpty && user.phoneNumber != "0000000000" {
                    Text(PhoneField.format(user.phoneNumber))
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
                Text("Member since \(user.joinedDate.formatted(.dateTime.month().year()))")
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
            }

            Spacer()
        }
        .padding(18)
        .brCard()
    }

    // MARK: - Listeners section

    private var reportRow: some View {
        Button { showReport = true } label: {
            HStack(spacing: 14) {
                Image(systemName: "ladybug")
                    .font(.system(size: 18))
                    .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Report a bug or suggest a feature")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        .multilineTextAlignment(.leading)
                    Text("Something wrong, or an idea? Tell us.")
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .brCard()
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showReport) { FeedbackView() }
    }

    /// Only admins (and developers) see this. The server checks the role again on every request.
    private var adminRow: some View {
        NavigationLink {
            AdminView()
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "gauge.with.dots.needle.67percent")
                    .font(.system(size: 18))
                    .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Admin")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    Text("Reports, station controls and notifications.")
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .brCard()
        }
        .buttonStyle(.plain)
    }

    private var hostRow: some View {
        NavigationLink {
            HostPanelView()
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(.system(size: 18))
                    .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Host panel")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    Text("Your live feed and set list, open around your show.")
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .brCard()
        }
        .buttonStyle(.plain)
    }

    private var goOnAirRow: some View {
        NavigationLink {
            SlotsView(embedded: true)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 18))
                    .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Go on air")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    Text("Request a spot on the radio and track your requests.")
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .brCard()
        }
        .buttonStyle(.plain)
    }

    private var listenersSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            BRSectionHeader(title: "TUNED IN NOW")
                .padding(.horizontal, 20)

            VStack(alignment: .leading, spacing: 16) {
                // Listener count
                HStack(spacing: 10) {
                    // Stacked avatar circles
                    ZStack(alignment: .leading) {
                        ForEach(Array(listeners.prefix(5).enumerated()), id: \.element.id) { i, listener in
                            Circle()
                                .fill(listener.avatarColor)
                                .frame(width: 28, height: 28)
                                .overlay(Circle().stroke(scheme == .dark ? Color.brDkBg : Color.brLtBg, lineWidth: 2))
                                .offset(x: CGFloat(i) * 18)
                        }
                    }
                    .frame(width: CGFloat(min(listeners.prefix(5).count, 5)) * 18 + 28, height: 28)

                    VStack(alignment: .leading, spacing: 1) {
                        Text("\(presence.count) \(presence.count == 1 ? "person" : "people") tuned in")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        Text(presence.friendsLine ?? "Live right now")
                            .font(.system(size: 12))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    }
                }

                // Anonymous listener bubbles grid
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 8), spacing: 10) {
                    ForEach(listeners) { listener in
                        Circle()
                            .fill(listener.avatarColor.opacity(0.8))
                            .frame(height: 36)
                            .overlay(
                                Circle()
                                    .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1)
                            )
                    }
                }
            }
            .padding(18)
            .brCard()
            .padding(.horizontal, 20)

            Text("You only see the names of people you know who are connected with you. Everyone else is anonymous.")
                .font(.system(size: 11))
                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                .padding(.horizontal, 24)
        }
    }

    // MARK: - Invisible mode

    private var invisibleSection: some View {
        Toggle(isOn: Binding(get: { auth.isInvisible }, set: { auth.setInvisible($0) })) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Invisible mode")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text("Friends won't see you tuned in, your likes won't show as \"your friend liked this\", live reactions are off, and your contacts aren't used for suggestions.")
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
        }
        .tint(scheme == .dark ? .brGold : .brGreen)
        .padding(18)
        .brCard()
        .padding(.horizontal, 20)
    }

    // MARK: - Guest Access section

    private var guestInviteSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            BRSectionHeader(title: "GUEST ACCESS")
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                // ── Form ───────────────────────────────────────────
                VStack(alignment: .leading, spacing: 14) {
                    Text("Grant temporary access to anyone — even without a Babson email.")
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)

                    // Email input
                    HStack(spacing: 10) {
                        Image(systemName: "envelope")
                            .font(.system(size: 14))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .frame(width: 20)
                        TextField("Guest email address", text: $guestEmail)
                            .font(.system(size: 15))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10)
                        .stroke(scheme == .dark ? Color.brDkBorder2 : Color.brLtBorder, lineWidth: 1))

                    // Duration picker
                    VStack(alignment: .leading, spacing: 8) {
                        Text("ACCESS DURATION")
                            .font(BRFont.display(10))
                            .kerning(2)
                            .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)

                        HStack(spacing: 8) {
                            ForEach(InviteDuration.allCases) { duration in
                                DurationPill(
                                    duration: duration,
                                    isSelected: selectedDuration == duration
                                ) {
                                    withAnimation(.easeInOut(duration: 0.15)) {
                                        selectedDuration = duration
                                    }
                                }
                            }
                        }
                    }

                    // Send button
                    Button(action: sendGuestInvite) {
                        HStack {
                            Spacer()
                            Image(systemName: "paperplane")
                                .font(.system(size: 14, weight: .medium))
                            Text(inviteSent ? "INVITE SENT" : "SEND INVITE")
                                .font(BRFont.display(14))
                                .kerning(2)
                            Spacer()
                        }
                        .padding(.vertical, 13)
                        .foregroundColor(scheme == .dark && !inviteSent ? Color.brDkBg : .white)
                        .brGlass(
                            in: RoundedRectangle(cornerRadius: 12),
                            tint: inviteSent
                                ? Color.brGreen.opacity(0.7)
                                : (scheme == .dark ? Color.brGold : Color.brGreen),
                            interactive: true,
                            fallback: inviteSent
                                ? Color.brGreen.opacity(0.7)
                                : (scheme == .dark ? Color.brGold : Color.brGreen))
                    }
                    .buttonStyle(.plain)
                    .disabled(guestEmail.trimmingCharacters(in: .whitespaces).isEmpty || inviteSent)
                    .animation(.easeInOut(duration: 0.2), value: inviteSent)

                    if let inviteError {
                        Text(inviteError)
                            .font(.system(size: 12))
                            .foregroundColor(.brRed)
                    }
                }
                .padding(18)

                // ── Active invites list ────────────────────────────
                if !activeInvites.isEmpty {
                    Divider()
                        .background(scheme == .dark ? Color.brDkBorder : Color.brLtBorder)

                    VStack(spacing: 0) {
                        HStack {
                            Text("ACTIVE INVITES")
                                .font(BRFont.display(10))
                                .kerning(2)
                                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                            Spacer()
                        }
                        .padding(.horizontal, 18)
                        .padding(.top, 14)
                        .padding(.bottom, 10)

                        ForEach(activeInvites) { invite in
                            ActiveInviteRow(invite: invite) {
                                withAnimation {
                                    activeInvites.removeAll { $0.id == invite.id }
                                }
                                // TODO: Firebase — delete invite doc from Firestore
                            }
                            if invite.id != activeInvites.last?.id {
                                Divider()
                                    .background(scheme == .dark ? Color.brDkBorder : Color.brLtBorder)
                                    .padding(.leading, 18)
                            }
                        }
                        .padding(.bottom, 6)
                    }
                }
            }
            .brCard()
            .padding(.horizontal, 20)

            Text("Invites expire automatically. You can revoke access at any time.")
                .font(.system(size: 11))
                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                .padding(.horizontal, 24)
        }
    }

    private func sendGuestInvite() {
        let trimmed = guestEmail.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }

        let invite = GuestInvite(
            id: UUID().uuidString,
            email: trimmed,
            duration: selectedDuration,
            expiresAt: selectedDuration.expiresAt,
            invitedBy: user.displayName
        )

        inviteError = nil
        Task {
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/guest/invite", [
                    "guestEmail": trimmed.lowercased(),
                    "duration": selectedDuration.apiKey,
                ])
                withAnimation {
                    activeInvites.insert(invite, at: 0)
                    inviteSent = true
                }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                withAnimation {
                    guestEmail = ""
                    inviteSent = false
                }
            } catch {
                inviteError = (error as? BackendError)?.message ?? error.localizedDescription
            }
        }
    }

    // MARK: - Invite section

    private var inviteSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            BRSectionHeader(title: "INVITE FRIENDS")
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                // Explanation row
                HStack(spacing: 14) {
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 22))
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                        .frame(width: 32)

                    VStack(alignment: .leading, spacing: 3) {
                        Text("Know someone who should listen?")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        Text("Pick a contact and we'll draft the message for you.")
                            .font(.system(size: 13))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 16)

                Divider()
                    .background(scheme == .dark ? Color.brDkBorder : Color.brLtBorder)

                // Contact list (if access granted) or permission prompt
                if contacts.accessGranted {
                    if contacts.list.isEmpty {
                        Text("No contacts found.")
                            .font(.system(size: 14))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .padding()
                    } else {
                        // Show up to 5 contacts inline; "Choose from contacts" for all
                        VStack(spacing: 0) {
                            // Contacts who look like Babson people go first, with the reason.
                            if !contacts.babson.isEmpty {
                                Spacer().frame(height: 6)
                                ForEach(contacts.babson.prefix(5)) { contact in
                                    ContactInviteRow(contact: contact, caption: contact.caption) {
                                        if let phone = contact.primaryPhone {
                                            activeSheet = .messageComposer(phone)
                                        }
                                    }
                                    Divider()
                                        .background(scheme == .dark ? Color.brDkBorder : Color.brLtBorder)
                                        .padding(.leading, 60)
                                }
                            }
                            if contacts.babson.isEmpty {
                                Text("No suggestions yet. You can still pick anyone below.")
                                    .font(.system(size: 13))
                                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 18)
                                    .padding(.vertical, 16)
                            }
                        }

                        Divider()
                            .background(scheme == .dark ? Color.brDkBorder : Color.brLtBorder)

                        // Shared-contact suggestions are on for everyone; Invisible mode is the way out.
                        Text(auth.isInvisible
                             ? "Invisible mode is on, so suggestions from shared contacts are off."
                             : (contacts.suggestionsNote.isEmpty
                                ? "Suggestions also use how many members saved the same contacts. Invisible mode turns this off."
                                : contacts.suggestionsNote))
                            .font(.system(size: 12))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 12)

                        Divider()
                            .background(scheme == .dark ? Color.brDkBorder : Color.brLtBorder)

                        Button(action: { activeSheet = .contactPicker }) {
                            HStack {
                                Image(systemName: "person.2")
                                    .font(.system(size: 14))
                                Text("Choose from all contacts")
                                    .font(.system(size: 14))
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12))
                            }
                            .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    // Permission not granted
                    Button(action: { contacts.requestAccess() }) {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.badge.plus")
                                .font(.system(size: 18))
                                .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            Text("Allow access to contacts")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12))
                                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                    }
                    .buttonStyle(.plain)
                }
            }
            .brCard()
            .padding(.horizontal, 20)

            Text("Spotting a school email or Babson in a contact happens on your phone. Shared-contact suggestions send scrambled phone numbers, never names. Invisible mode turns that off.")
                .font(.system(size: 11))
                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                .padding(.horizontal, 24)
        }
    }
}

// MARK: - Contact invite row

private struct ContactInviteRow: View {
    let contact: BRContact
    var caption: String? = nil
    let onInvite: () -> Void
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(spacing: 14) {
            // Avatar
            ZStack {
                Circle()
                    .fill(contact.avatarColor.opacity(0.8))
                    .frame(width: 38, height: 38)
                Text(contact.initials)
                    .font(BRFont.display(14))
                    .foregroundColor(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(contact.name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                if let caption {
                    Text(caption)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                } else if let phone = contact.primaryPhone {
                    Text(phone)
                        .font(.system(size: 12))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
            }

            Spacer()

            Button(action: onInvite) {
                Text("Invite")
                    .font(BRFont.display(12))
                    .kerning(1)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(scheme == .dark ? Color.brGold : Color.brGreen)
                    .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(.plain)
            .disabled(contact.primaryPhone == nil)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }
}

// MARK: - Contact picker sheet (full contacts list)

struct ContactPickerView: View {
    @ObservedObject var contacts: ContactsManager
    let onSelect: (String) -> Void
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var scheme
    @State private var search = ""

    var filtered: [BRContact] {
        let base = search.isEmpty ? contacts.list : contacts.list.filter { $0.name.localizedCaseInsensitiveContains(search) }
        // Likely Babson contacts first, then everyone else in the usual order.
        return base.filter { $0.score > 0 }.sorted { $0.score > $1.score } + base.filter { $0.score == 0 }
    }

    var body: some View {
        NavigationStack {
            List(filtered) { contact in
                Button(action: {
                    if let phone = contact.primaryPhone {
                        onSelect(phone)
                    }
                }) {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle().fill(contact.avatarColor.opacity(0.8)).frame(width: 36, height: 36)
                            Text(contact.initials).font(BRFont.display(13)).foregroundColor(.white)
                        }
                        VStack(alignment: .leading) {
                            Text(contact.name).font(.system(size: 15, weight: .medium))
                            if let why = contact.caption {
                                Text(why).font(.system(size: 12, weight: .semibold)).foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            } else if let p = contact.primaryPhone {
                                Text(p).font(.system(size: 12)).foregroundColor(.secondary)
                            }
                        }
                        Spacer()
                        if contact.primaryPhone != nil {
                            Text("Invite").font(BRFont.display(11)).foregroundColor(scheme == .dark ? .brGold : .brGreen)
                        }
                    }
                }
                .disabled(contact.primaryPhone == nil)
            }
            .searchable(text: $search, prompt: "Search contacts")
            .navigationTitle("Choose a Contact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Duration pill

private struct DurationPill: View {
    let duration: InviteDuration
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Button(action: action) {
            Text(duration.rawValue)
                .font(BRFont.display(10))
                .kerning(0.5)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    isSelected
                        ? (scheme == .dark ? Color.brGold : Color.brGreen)
                        : (scheme == .dark ? Color.brDkBg : Color.brLtBg)
                )
                .foregroundColor(
                    isSelected
                        ? (scheme == .dark ? Color.brDkBg : .white)
                        : (scheme == .dark ? Color.brDkSub : Color.brLtSub)
                )
                .clipShape(RoundedRectangle(cornerRadius: 7))
                .overlay(
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(
                            isSelected ? Color.clear : (scheme == .dark ? Color.brDkBorder : Color.brLtBorder),
                            lineWidth: 1
                        )
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Active invite row

private struct ActiveInviteRow: View {
    let invite: GuestInvite
    let onRevoke: () -> Void
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(invite.email)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                        .font(.system(size: 10))
                    Text(invite.expiresLabel)
                        .font(.system(size: 12))
                }
                .foregroundColor(
                    invite.isExpired
                        ? .brRed
                        : (scheme == .dark ? .brDkSub : .brLtSub)
                )
            }

            Spacer()

            BRTagChip(text: invite.duration.rawValue.uppercased(), style: .subtle)

            Button(action: onRevoke) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(scheme == .dark ? Color.brDkMuted : Color.brLtMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }
}

// MARK: - ContactsManager

nonisolated private struct SavedReply: Decodable {
    struct Item: Decodable { let hash: String; let others: Int }
    let saved: [Item]
}

class ContactsManager: ObservableObject {
    @Published var accessGranted = false
    @Published var list: [BRContact] = []
    /// Contacts that look like Babson people, best matches first. Worked out on this phone; nothing is uploaded.
    @Published var babson: [BRContact] = []
    @Published var suggestionsNote = ""

    static let shared = ContactsManager()

    /// On for everyone who allowed contacts, except people in Invisible mode (the opt-out).
    var suggestionsActive: Bool { !AuthManager.shared.isInvisible }

    // Store kept alive for the lifetime of the manager
    private let store = CNContactStore()

    func requestAccessIfNeeded() async {
        let status = CNContactStore.authorizationStatus(for: .contacts)
        switch status {
        case .authorized:
            await MainActor.run { self.accessGranted = true }
            loadContacts()
        case .notDetermined:
            // The first-open prompt (see promptOnFirstOpen) or the button in Profile asks; nothing happens here.
            break
        default:
            break
        }
    }

    func requestAccess() {
        store.requestAccess(for: .contacts) { [weak self] granted, error in
            DispatchQueue.main.async {
                self?.accessGranted = granted
                if granted { self?.loadContacts() }
            }
        }
    }

    /// Is this contact probably a Babson student? A school email is the strongest sign, then Babson in their
    /// company or school field, then Babson in the name (which can also just be a surname, so it ranks last).
    /// Same as the website: US numbers only, "+1XXXXXXXXXX", then SHA-256 as hex. The server scrambles it again.
    nonisolated private static func phoneHash(_ raw: String) -> String? {
        var d = raw.filter(\.isNumber)
        if d.count == 11, d.hasPrefix("1") { d.removeFirst() }
        guard d.count == 10, let first = d.first, first != "0", first != "1" else { return nil }
        return SHA256.hash(data: Data("+1\(d)".utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Scrambled code for an email address: SHA-256 of the lowercased address, as hex. The server scrambles it again.
    /// Lets a guest whose verified email a member has saved be recognized, without any email leaving the phone in the clear.
    nonisolated private static func emailHash(_ raw: String) -> String? {
        let e = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard e.contains("@"), e.count <= 254 else { return nil }
        return SHA256.hash(data: Data(e.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    nonisolated private static func cachedSaved() -> [String: Int] {
        guard let data = UserDefaults.standard.data(forKey: "br_saved_by"),
              let m = try? JSONDecoder().decode([String: Int].self, from: data) else { return [:] }
        return m
    }

    /// Put the "saved by N members" counts on the contacts and re-sort the likely-Babson list.
    private func applySaved(_ counts: [String: Int]) {
        list = list.map { var c = $0; c.savedBy = counts[c.id] ?? 0; return c }
        babson = list.filter { $0.score > 0 }.sorted { $0.score > $1.score }
    }

    /// Ask the server which of my contacts many members have saved. At most twice a day; the server allows once an hour.
    func refreshSuggestions(force: Bool = false) async {
        guard suggestionsActive, !list.isEmpty else { return }
        let last = UserDefaults.standard.double(forKey: "br_contact_sync_at")
        if !force, Date().timeIntervalSince1970 - last < 12 * 3600 { return }
        let hashes = Array(Set(list.flatMap { $0.phoneHashes + $0.emailHashes }).prefix(3000))
        guard !hashes.isEmpty else { return }
        do {
            let r: SavedReply = try await BackendAPI.post("/api/contacts/popular", ["hashes": hashes])
            var byHash: [String: Int] = [:]
            for i in r.saved { byHash[i.hash] = i.others }
            var byContact: [String: Int] = [:]
            for c in list { if let n = c.phoneHashes.compactMap({ byHash[$0] }).max() { byContact[c.id] = n } }
            if let data = try? JSONEncoder().encode(byContact) { UserDefaults.standard.set(data, forKey: "br_saved_by") }
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "br_contact_sync_at")
            applySaved(byContact)
            suggestionsNote = byContact.isEmpty ? "No one is saved by enough members yet. Check back as more people join." : ""
        } catch {
            let m = (error as? BackendError)?.message ?? error.localizedDescription
            if m.contains("BR-CON-003") { UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "br_contact_sync_at") }
            else { suggestionsNote = m }
        }
    }

    /// Asks for contacts once, the first time a signed-in student opens the app. If they say no, the button in Profile
    /// is still there. Guests never get this (the friends network is for students).
    func promptOnFirstOpen() {
        let auth = AuthManager.shared
        guard auth.isSignedIn, auth.currentUser?.isGuest != true else { return }
        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .notDetermined:
            guard !UserDefaults.standard.bool(forKey: "br_contacts_asked") else { return }
            UserDefaults.standard.set(true, forKey: "br_contacts_asked")
            requestAccess()
        case .authorized:
            Task { await requestAccessIfNeeded() }
        default:
            break
        }
    }

    /// Invisible mode was switched on: forget the counts here (the server removes this person's codes itself).
    func clearSaved() {
        suggestionsNote = ""
        UserDefaults.standard.removeObject(forKey: "br_saved_by")
        UserDefaults.standard.removeObject(forKey: "br_contact_sync_at")
        applySaved([:])
    }

    nonisolated private static func babsonMatch(_ c: CNContact, name: String) -> (reason: String, rank: Int)? {
        let schoolDomains = ["babson.edu", "olin.edu", "wellesley.edu"]
        for e in c.emailAddresses {
            let addr = (e.value as String).lowercased()
            if schoolDomains.contains(where: { addr.hasSuffix("@" + $0) }) { return ("School email", 4) }
        }
        let details = [c.organizationName, c.departmentName, c.jobTitle, c.nickname]
        if details.contains(where: { $0.localizedCaseInsensitiveContains("babson") }) { return ("Babson in their contact details", 2) }
        if name.localizedCaseInsensitiveContains("babson") { return ("Babson in their name", 1) }
        return nil
    }

    private func loadContacts() {
        let keys: [CNKeyDescriptor] = [
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor,
            CNContactEmailAddressesKey as CNKeyDescriptor,
            CNContactOrganizationNameKey as CNKeyDescriptor,
            CNContactDepartmentNameKey as CNKeyDescriptor,
            CNContactJobTitleKey as CNKeyDescriptor,
            CNContactNicknameKey as CNKeyDescriptor
        ]
        let request = CNContactFetchRequest(keysToFetch: keys)
        request.sortOrder = .givenName

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            var result: [BRContact] = []
            do {
                try self.store.enumerateContacts(with: request) { contact, _ in
                    let name = "\(contact.givenName) \(contact.familyName)"
                        .trimmingCharacters(in: .whitespaces)
                    let phone = contact.phoneNumbers.first?.value.stringValue
                    if !name.isEmpty, let phone {
                        let match = Self.babsonMatch(contact, name: name)
                        let hashes = contact.phoneNumbers.compactMap { Self.phoneHash($0.value.stringValue) }
                        let emailHashes = contact.emailAddresses.compactMap { Self.emailHash($0.value as String) }
                        result.append(BRContact(id: contact.identifier, name: name, primaryPhone: phone,
                                                babsonReason: match?.reason, babsonRank: match?.rank ?? 0, phoneHashes: hashes, emailHashes: emailHashes))
                    }
                }
            } catch {
                print("Contacts load error: \(error)")
            }
            DispatchQueue.main.async {
                self.list = result
                self.applySaved(self.suggestionsActive ? Self.cachedSaved() : [:])
                Task { await self.refreshSuggestions() }
            }
        }
    }
}

// MARK: - BRContact model

struct BRContact: Identifiable {
    let id: String
    let name: String
    let primaryPhone: String?
    /// Why this looks like a Babson contact (nil = no sign of it). Decided on the phone.
    var babsonReason: String? = nil
    var babsonRank: Int = 0
    /// Scrambled codes for this person's numbers (SHA-256 of "+1XXXXXXXXXX"). Only used if suggestions are turned on.
    var phoneHashes: [String] = []
    /// Scrambled codes for this person's email addresses (SHA-256 of the lowercased address). Only used if suggestions are turned on.
    var emailHashes: [String] = []
    /// How many Babson Radio members have this person saved (0 = unknown or too few to say).
    var savedBy: Int = 0

    /// Higher = more likely at Babson. Many members having them saved counts as a strong sign.
    var score: Int { max(babsonRank, savedBy >= 1 ? 3 : 0) }

    /// The reason shown under the name.
    /// Never says why (a school email, a saved number, ...); only that they might be interested.
    var caption: String? { score > 0 ? "Might be interested in Babson Radio" : nil }

    var initials: String {
        let parts = name.split(separator: " ")
        if parts.count >= 2 {
            return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
        }
        return String(name.prefix(2)).uppercased()
    }

    var avatarColor: Color {
        // Deterministic color from name hash
        let palette: [Color] = [
            Color(hex: "006644"), Color(hex: "2E5C8A"), Color(hex: "7A3E8C"),
            Color(hex: "C8302A"), Color(hex: "D4762C"), Color(hex: "1A6B5A")
        ]
        let hash = abs(name.hashValue)
        return palette[hash % palette.count]
    }
}


// MARK: - Report a bug / suggest a feature

struct FeedbackView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var type = "bug"
    @State private var message = ""
    @State private var isSending = false
    @State private var sent = false
    @State private var errorText: String?

    private var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Type", selection: $type) {
                        Text("Something is wrong").tag("bug")
                        Text("Idea").tag("feature")
                    }
                    .pickerStyle(.segmented)
                }
                Section(type == "bug" ? "What happened? What did you expect?" : "What would make Babson Radio better?") {
                    TextEditor(text: $message).frame(minHeight: 140)
                }
                if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
                if sent { Section { Text("Sent. Thank you, we read every one.").foregroundStyle(.green) } }
            }
            .navigationTitle("Report or suggest")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(sent ? "Done" : "Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSending ? "Sending…" : "Send") { send() }
                        .disabled(isSending || sent || message.trimmingCharacters(in: .whitespacesAndNewlines).count < 5)
                }
            }
        }
    }

    private func send() {
        isSending = true; errorText = nil
        Task {
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/feedback", [
                    "type": type, "message": message.trimmingCharacters(in: .whitespacesAndNewlines),
                    "platform": "ios", "appVersion": version,
                ])
                sent = true; message = ""
            } catch {
                errorText = (error as? BackendError)?.message ?? error.localizedDescription
            }
            isSending = false
        }
    }
}


// MARK: - Host panel
// Radio controls and the set list. The server opens these 4 hours before a host's show and closes them
// 4 hours after (staff are always allowed). Hosts can ask for changes to their show at any time.

nonisolated struct HostShowItem: Decodable, Identifiable {
    let id: String; let key: String; let kind: String; let refId: String
    let title: String; let startAt: Date; let endAt: Date; let open: Bool
}
nonisolated struct HostNowPlaying: Decodable {
    let song: String; let elapsed: Double; let duration: Double; let isLive: Bool; let streamer: String; let listeners: Int
}
nonisolated struct HostStatus: Decodable {
    let staff: Bool; let controlsOpen: Bool; let windowHours: Int
    let shows: [HostShowItem]; let nowPlaying: HostNowPlaying?
}
nonisolated struct SetlistResponse: Decodable { let songs: String }

@MainActor
final class HostManager: ObservableObject {
    @Published var status: HostStatus?
    @Published var error: String?

    func load() async {
        do { status = try await BackendAPI.get("/api/host/status"); error = nil }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }
}

struct HostPanelView: View {
    @StateObject private var host = HostManager()
    @Environment(\.colorScheme) var scheme

    @State private var pick: String = ""
    @State private var songs = ""
    @State private var setlistMessage: String?
    @State private var saving = false
    @State private var changeShow = ""
    @State private var newName = ""
    @State private var newDescription = ""
    @State private var changeMessage: String?

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    private var openShows: [HostShowItem] { host.status?.shows.filter { $0.open } ?? [] }
    private var selected: HostShowItem? {
        openShows.first { $0.id == pick } ?? openShows.first { $0.startAt <= Date() && $0.endAt >= Date() } ?? openShows.first
    }
    private var weeklyShows: [HostShowItem] {
        var seen = Set<String>()
        return (host.status?.shows ?? []).filter { $0.kind == "weekly" && seen.insert($0.refId).inserted }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let err = host.error { Text(err).font(.system(size: 13)).foregroundColor(.brRed) }
                if let s = host.status {
                    controls(s)
                    setList(s)
                    yourShows(s)
                    changeRequest
                } else if host.error == nil {
                    ProgressView()
                }
            }
            .padding(20)
        }
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
        .navigationTitle("Host panel")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await host.load() }
        .task {
            await host.load()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(20))
                await host.load()
            }
        }
        .task(id: selected?.id) { await loadSetlist() }
    }

    // MARK: sections

    @ViewBuilder private func controls(_ s: HostStatus) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BRSectionHeader(title: "ON AIR")
            if s.controlsOpen {
                let np = s.nowPlaying
                Text((np?.isLive ?? false) ? "LIVE" + ((np?.streamer ?? "").isEmpty ? "" : " · \(np!.streamer)") : "NOW PLAYING")
                    .font(.system(size: 11, weight: .semibold)).foregroundColor(sub)
                Text((np?.song ?? "").isEmpty ? "Nothing reported right now" : np!.song)
                    .font(.system(size: 18, weight: .semibold)).foregroundColor(text)
                if let np { Text("\(np.listeners) listening").font(.system(size: 12)).foregroundColor(sub) }
                Text("Open from \(s.windowHours) hours before your show until \(s.windowHours) hours after. Station controls are with the admins.")
                    .font(.system(size: 11)).foregroundColor(sub)
            } else if let next = s.shows.first(where: { $0.startAt.timeIntervalSinceNow > Double(s.windowHours) * 3600 }) {
                Text("Controls open \(s.windowHours) hours before \(next.title), which starts \(next.startAt.formatted(.dateTime.weekday(.wide).hour().minute())).")
                    .font(.system(size: 14)).foregroundColor(sub)
            } else {
                Text("You have no upcoming shows this week.").font(.system(size: 14)).foregroundColor(sub)
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    @ViewBuilder private func setList(_ s: HostStatus) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BRSectionHeader(title: "SET LIST")
            if let sel = selected {
                if openShows.count > 1 {
                    Picker("Show", selection: Binding(get: { sel.id }, set: { pick = $0 })) {
                        ForEach(openShows) { Text("\($0.title) · \($0.startAt.formatted(.dateTime.weekday(.abbreviated).hour().minute()))").tag($0.id) }
                    }
                    .pickerStyle(.menu)
                }
                Text("\(sel.title) · \(sel.startAt.formatted(.dateTime.weekday(.wide).hour().minute()))")
                    .font(.system(size: 12)).foregroundColor(sub)
                TextEditor(text: $songs)
                    .frame(minHeight: 200)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(alignment: .topLeading) {
                        if songs.isEmpty {
                            Text("One song per line:\nArtist – Song title").font(.system(size: 14)).foregroundColor(sub.opacity(0.7))
                                .padding(.horizontal, 14).padding(.vertical, 16).allowsHitTesting(false)
                        }
                    }
                Button {
                    Task {
                        saving = true; setlistMessage = nil
                        do {
                            let _: EmptyResponse = try await BackendAPI.post("/api/host/setlist",
                                ["key": sel.key, "startAt": Int(sel.startAt.timeIntervalSince1970 * 1000), "songs": songs])
                            setlistMessage = "Saved."
                        } catch { setlistMessage = (error as? BackendError)?.message ?? error.localizedDescription }
                        saving = false
                    }
                } label: {
                    HStack { if saving { ProgressView().tint(.white) } else { Text("SAVE SET LIST").font(BRFont.display(14)).kerning(2) } }
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(accent).foregroundColor(scheme == .dark ? .brDkBg : .white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(saving)
                if let m = setlistMessage { Text(m).font(.system(size: 12)).foregroundColor(sub) }
                Text("Type it as you go or paste the whole list at the end. You can edit it until \(s.windowHours) hours after your show.")
                    .font(.system(size: 11)).foregroundColor(sub)
            } else {
                Text("The set list opens \(s.windowHours) hours before your show.").font(.system(size: 14)).foregroundColor(sub)
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    @ViewBuilder private func yourShows(_ s: HostStatus) -> some View {
        if !s.shows.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                BRSectionHeader(title: "YOUR SHOWS")
                ForEach(s.shows) { show in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(show.title).font(.system(size: 15, weight: .semibold)).foregroundColor(text)
                            Text("\(show.startAt.formatted(.dateTime.weekday(.abbreviated).month().day().hour().minute()))")
                                .font(.system(size: 12)).foregroundColor(sub)
                        }
                        Spacer()
                        Text(show.open ? "PANEL OPEN" : "UPCOMING").font(BRFont.display(10)).kerning(1.5)
                            .foregroundColor(show.open ? accent : sub)
                    }
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading).brCard()
                }
            }
        }
    }

    @ViewBuilder private var changeRequest: some View {
        if !weeklyShows.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                BRSectionHeader(title: "REQUEST A CHANGE TO YOUR SHOW")
                if weeklyShows.count > 1 {
                    Picker("Show", selection: $changeShow) {
                        ForEach(weeklyShows) { Text($0.title).tag($0.refId) }
                    }.pickerStyle(.menu)
                }
                BRTextField(placeholder: "New name (optional)", text: $newName, icon: "textformat")
                BRTextField(placeholder: "New description (optional)", text: $newDescription, icon: "text.alignleft")
                Button {
                    Task {
                        changeMessage = nil
                        let id = changeShow.isEmpty ? (weeklyShows.first?.refId ?? "") : changeShow
                        do {
                            let _: EmptyResponse = try await BackendAPI.post("/api/host/update-request",
                                ["scheduleId": id, "showName": newName, "description": newDescription])
                            newName = ""; newDescription = ""
                            changeMessage = "Sent. Staff will review it and it goes live when approved."
                        } catch { changeMessage = (error as? BackendError)?.message ?? error.localizedDescription }
                    }
                } label: {
                    Text("SEND REQUEST").font(BRFont.display(14)).kerning(2)
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(accent).foregroundColor(scheme == .dark ? .brDkBg : .white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty && newDescription.trimmingCharacters(in: .whitespaces).isEmpty)
                if let m = changeMessage { Text(m).font(.system(size: 12)).foregroundColor(sub) }
                Text("To change your show's picture, use the website.").font(.system(size: 11)).foregroundColor(sub)
            }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
        }
    }

    private func loadSetlist() async {
        guard let sel = selected else { songs = ""; return }
        let ms = Int(sel.startAt.timeIntervalSince1970 * 1000)
        let key = sel.key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sel.key
        if let r: SetlistResponse = try? await BackendAPI.get("/api/host/setlist?key=\(key)&startAt=\(ms)") { songs = r.songs }
        setlistMessage = nil
    }
}


// MARK: - About you (optional details for "people in your class are listening")

struct AboutYouSection: View {
    @Environment(\.colorScheme) var scheme
    @State private var gradYear = ""
    @State private var concentration = ""
    @State private var bMonth = 0
    @State private var bDay = 0
    @State private var message: String?
    @State private var saving = false

    private func field(_ title: String, _ placeholder: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 12, weight: .semibold))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            TextField(placeholder, text: text)
                .font(.system(size: 15))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                .textInputAutocapitalization(.words)
                .padding(12)
                .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("About you (optional)")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
            Text("Tell us about you!")
                .font(.system(size: 12))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            VStack(alignment: .leading, spacing: 4) {
                Text("Graduation year").font(.system(size: 12, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                Picker("Graduation year", selection: $gradYear) {
                    Text("Not set").tag("")
                    ForEach(Terms.gradYearOptions(), id: \.value) { Text($0.label).tag($0.value) }
                }
                .pickerStyle(.menu)
                .tint(scheme == .dark ? .brGold : .brGreen)
            }
            if Terms.concentrations.isEmpty {
                field("Concentration", "Entrepreneurship", $concentration)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Concentration").font(.system(size: 12, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    Picker("Concentration", selection: $concentration) {
                        Text("Not set").tag("")
                        ForEach(Terms.concentrations, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .tint(scheme == .dark ? .brGold : .brGreen)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Birthday (optional)").font(.system(size: 12, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                HStack {
                    Picker("Month", selection: $bMonth) {
                        Text("Month").tag(0)
                        ForEach(1...12, id: \.self) { Text(Calendar.current.monthSymbols[$0 - 1]).tag($0) }
                    }
                    Picker("Day", selection: $bDay) {
                        Text("Day").tag(0)
                        ForEach(1...31, id: \.self) { Text("\($0)").tag($0) }
                    }
                }
                .pickerStyle(.menu)
                .tint(scheme == .dark ? .brGold : .brGreen)
                Text("Birthdays are only used to send you a notification and to let the DJ know when it's your birthday. We never ask for the year.")
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }

            if let message {
                Text(message).font(.system(size: 12)).foregroundColor(scheme == .dark ? .brGold : .brGreen)
            }
            Button {
                saving = true; message = nil
                Task {
                    do {
                        let birthday: Any = (bMonth > 0 && bDay > 0) ? ["month": bMonth, "day": bDay] : NSNull()
                        let _: EmptyResponse = try await BackendAPI.post("/api/me", [
                            "gradYear": gradYear,
                            "concentrations": concentration.isEmpty ? [String]() : [concentration],
                            "birthday": birthday,
                        ])
                        message = "Saved."
                    } catch { message = error.localizedDescription }
                    saving = false
                }
            } label: {
                Text(saving ? "SAVING…" : "SAVE DETAILS")
                    .font(BRFont.display(14)).kerning(2)
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(scheme == .dark ? Color.brGold : Color.brGreen)
                    .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .disabled(saving)
        }
        .padding(18)
        .brCard()
        .task {
            if let me: MeResponse = try? await BackendAPI.get("/api/me") {
                gradYear = me.gradYear ?? ""
                concentration = me.concentrations?.first ?? ""
                bMonth = me.birthday?.month ?? 0
                bDay = me.birthday?.day ?? 0
            }
        }
    }
}


// MARK: - Notifications everyone can choose (birthday message, station announcements)

struct NotificationChoicesSection: View {
    @Environment(\.colorScheme) var scheme
    @StateObject private var push = PushManager.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Notifications").font(.system(size: 15, weight: .semibold))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
            Toggle("Happy birthday message", isOn: Binding(get: { push.birthdayOn }, set: { v in Task { await push.setMine(birthday: v) } }))
            Toggle("Station announcements (live events and news)", isOn: Binding(get: { push.announcementsOn }, set: { v in Task { await push.setMine(announcements: v) } }))
            if !push.status.isEmpty {
                Text(push.status).font(.system(size: 12)).foregroundColor(.brRed)
            }
        }
        .font(.system(size: 14))
        .tint(scheme == .dark ? .brGold : .brGreen)
        .padding(18)
        .brCard()
        .disabled(push.busy || !PushManager.available)
        .task { await push.loadMine() }
    }
}


// MARK: - Beat delay (developers)

/// Tune by ear: how long after the station sends a song you actually hear it. Moves the background pulse.
private struct BeatDelayRow: View {
    @ObservedObject private var audio = AudioPlayerManager.shared
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Beat delay").font(.system(size: 15, weight: .semibold))
                Spacer()
                Text(String(format: "%.2f s", audio.beatDelay))
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
            Slider(value: $audio.beatDelay, in: 0...12, step: 0.25)
                .tint(scheme == .dark ? .brGold : .brGreen)
            Text("Lower it if the pulse lands after the beat, raise it if it lands before. Needs a song that has been analyzed.")
                .font(.system(size: 12))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
        }
        .padding(16)
        .brGlass(in: RoundedRectangle(cornerRadius: 14))
    }
}
