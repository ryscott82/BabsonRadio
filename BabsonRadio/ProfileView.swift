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
        } else if auth.needsSchoolEmail {
            AppleSchoolEmailView()
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
    @StateObject private var auth = AuthManager.shared
    @ObservedObject private var contacts = ContactsManager.shared
    @ObservedObject private var store = ProfileStore.shared
    @State private var avatarPicker = false
    @Environment(\.colorScheme) var scheme

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
    @State private var selectedPhone: String? = nil
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
                        .padding(.bottom, 24)

                    // The same order as the website's profile.
                    goOnAirRow
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)

                    emojiUnlocksRow
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)

                    if store.hosting || user.isAdmin {
                        hostRow
                            .padding(.horizontal, 20)
                            .padding(.bottom, 16)
                    }

                    if let me = store.me, !me.answered {
                        AboutYouSection()
                            .padding(.horizontal, 20)
                            .padding(.bottom, 16)
                    }

                    // Students only: developers have no babson.edu identity to sponsor guests with.
                    if !user.isDeveloper {
                        inviteFriendsSection
                            .padding(.bottom, 16)
                    }

                    ProfileDisclosure(title: "Notifications") { NotificationChoicesSection(bare: true) }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)

                    invisibleSection
                        .padding(.bottom, 16)

                    if let me = store.me, me.answered {
                        ProfileDisclosure(title: "About you") { AboutYouSection(bare: true) }
                            .padding(.horizontal, 20)
                            .padding(.bottom, 16)
                    }

                    if user.isDeveloper {
                        BeatDelayRow()
                            .padding(.horizontal, 20)
                            .padding(.bottom, 16)
                    }

                    if !user.isGuest {
                        ProfileDisclosure(title: "Phone number") { PhoneChangeSection() }
                            .padding(.horizontal, 20)
                            .padding(.bottom, 16)
                    }

                    reportRow
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)

                    if user.isAdmin {
                        adminRow
                            .padding(.horizontal, 20)
                            .padding(.bottom, 32)
                    }

                    if let ig = BabsonLinks.instagram {
                        Link(destination: ig) {
                            Label { Text("Follow Babson Sound on Instagram") } icon: { InstagramGlyph(size: 18) }
                                .font(BRFont.body(14, .medium))
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
            .background(HWDesk())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 0) {
                        Text("Babson ")
                            .font(BRFont.display(18))
                            .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            .kerning(3)
                        Text("Radio")
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
                    selectedPhone = phoneNumber
                    guestEmail = ""
                    activeSheet = nil
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
        .task { await store.load(); await store.loadHosting() }
        .onAppear { contacts.reshuffle() }
    }

    // MARK: - Account card

    private var accountCard: some View {
        VStack(spacing: 10) {
            HStack(spacing: 16) {
                Button { withAnimation { avatarPicker.toggle() } } label: {
                    ProfileAvatar(initials: user.initials, colorId: store.avatarColor, size: 64)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Change profile color")

                VStack(alignment: .leading, spacing: 3) {
                    Text(user.displayName)
                        .font(BRFont.body(20, .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        .lineLimit(1)
                    if !user.isDeveloper, AuthManager.isBabsonEmail(user.email) {
                        Text("@" + String(user.email.prefix(while: { $0 != "@" })))
                            .font(BRFont.display(14)).kerning(1.5)
                            .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                    }
                    if user.isDeveloper { BRTagChip(text: "DEVELOPER", style: .gold) }
                    if let by = auth.verifyDeadline {
                        Text("Verify your email by \(by.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())).")
                            .font(BRFont.body(12, .medium))
                            .foregroundColor(.brRed)
                    }
                    Text("Member since \(user.joinedDate.formatted(.dateTime.month(.wide).year()))")
                        .font(BRFont.body(13, .regular))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
                Spacer(minLength: 0)
            }

            if avatarPicker {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 38), spacing: 12)], spacing: 12) {
                    ForEach(AvatarPalette.all, id: \.id) { c in
                        Button { Task { await store.setColor(c.id) } } label: {
                            Circle().fill(Color(hex: c.hex)).frame(width: 30, height: 30)
                                .overlay(Circle().stroke(scheme == .dark ? Color.brGold : Color.brGreen, lineWidth: store.avatarColor == c.id || (store.avatarColor == nil && c.id == "babson-green") ? 3 : 0).padding(-4))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(c.id)
                    }
                }
                .padding(.vertical, 8)
                if let e = store.colorError {
                    Text(e).font(BRFont.body(12, .regular)).foregroundColor(.brRed)
                }
            }
        }
        .frame(maxWidth: .infinity)
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
                        .font(BRFont.body(16, .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        .multilineTextAlignment(.leading)
                    Text("Something wrong, or an idea? Tell us.")
                        .font(BRFont.body(13, .regular))
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
                        .font(BRFont.body(16, .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    Text("Station tools")
                        .font(BRFont.body(13, .regular))
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
                        .font(BRFont.body(16, .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    Text("Live feed and set list")
                        .font(BRFont.body(13, .regular))
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

    private var emojiUnlocksRow: some View {
        NavigationLink {
            EmojiUnlocksView()
        } label: {
            HStack(spacing: 14) {
                Text("🔥").font(BRFont.body(20, .regular)).frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Reaction emojis")
                        .font(BRFont.body(16, .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    Text("See what you can unlock")
                        .font(BRFont.body(13, .regular))
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
                        .font(BRFont.body(16, .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    Text("Request airtime")
                        .font(BRFont.body(13, .regular))
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

    // MARK: - Invisible mode

    private var invisibleSection: some View {
        Toggle(isOn: Binding(get: { auth.isInvisible }, set: { auth.setInvisible($0) })) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Invisible mode")
                    .font(BRFont.body(15, .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text("Friends can't see you tuned in. Reactions and contact suggestions are off.")
                    .font(BRFont.body(12, .regular))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
        }
        .tint(scheme == .dark ? .brGold : .brGreen)
        .padding(18)
        .brCard()
        .padding(.horizontal, 20)
    }

    // MARK: - Invite friends

    /// A text goes through Messages; an email goes out from the station and gives the friend guest access when they sign up with it.
    private var selectedContactName: String? {
        selectedPhone.flatMap { p in contacts.list.first { $0.primaryPhone == p }?.name }
    }
    private var emailLooksValid: Bool {
        let e = guestEmail.trimmingCharacters(in: .whitespaces)
        return e.contains("@") && e.contains(".") && !e.contains(" ")
    }
    private var canSendInvite: Bool { (selectedPhone != nil || emailLooksValid) && !inviteSent }
    private var line: Color { scheme == .dark ? .brDkBorder : .brLtBorder }

    private var inviteFriendsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            BRSectionHeader(title: "INVITE FRIENDS")
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                // 1. People you probably know
                if contacts.accessGranted {
                    if contacts.featured.isEmpty {
                        Text("No suggestions yet.")
                            .font(BRFont.body(13, .regular))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18).padding(.vertical, 16)
                    } else {
                        ForEach(contacts.featured) { contact in
                            ContactInviteRow(contact: contact, caption: contact.caption, selected: selectedPhone == contact.primaryPhone && selectedPhone != nil) {
                                selectedPhone = contact.primaryPhone
                                guestEmail = ""
                            }
                            Divider().background(line).padding(.leading, 60)
                        }
                    }
                    Divider().background(line)

                    // 2. Everyone else
                    Button(action: { activeSheet = .contactPicker }) {
                        HStack {
                            Image(systemName: "person.2").font(.system(size: 14))
                            Text("Show all contacts").font(BRFont.body(14, .regular))
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12))
                        }
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                        .padding(.horizontal, 18).padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                } else {
                    Button(action: { contacts.requestAccess() }) {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.badge.plus")
                                .font(.system(size: 18))
                                .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            Text("Allow access to contacts")
                                .font(BRFont.body(14, .medium))
                                .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12))
                                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        }
                        .padding(.horizontal, 18).padding(.vertical, 16)
                    }
                    .buttonStyle(.plain)
                }

                Divider().background(line)

                // 3. Or an email, with how long the access lasts
                VStack(alignment: .leading, spacing: 14) {
                    if let name = selectedContactName ?? selectedPhone {
                        HStack {
                            Image(systemName: "message.fill").font(.system(size: 13))
                            Text("Text \(name)").font(BRFont.body(14, .medium))
                            Spacer()
                            Button { selectedPhone = nil } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 16)) }
                                .buttonStyle(.plain)
                        }
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                    }

                    HStack(spacing: 10) {
                        Image(systemName: "envelope")
                            .font(.system(size: 14))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .frame(width: 20)
                        TextField("Or enter their email address", text: $guestEmail)
                            .font(BRFont.body(15, .regular))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .onChange(of: guestEmail) { _, new in if !new.isEmpty { selectedPhone = nil } }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 12)
                    .background(HWDesk())
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10)
                        .stroke(scheme == .dark ? Color.brDkBorder2 : Color.brLtBorder, lineWidth: 1))

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Access duration")
                            .font(BRFont.display(10)).kerning(2)
                            .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                        HStack(spacing: 8) {
                            ForEach(InviteDuration.allCases) { duration in
                                DurationPill(duration: duration, isSelected: selectedDuration == duration) {
                                    withAnimation(.easeInOut(duration: 0.15)) { selectedDuration = duration }
                                }
                            }
                        }
                    }

                    Button(action: sendInvite) {
                        HStack {
                            Spacer()
                            Image(systemName: "paperplane").font(.system(size: 14, weight: .medium))
                            Text(inviteSent ? "INVITE SENT" : "SEND INVITE")
                                .font(BRFont.display(14)).kerning(2)
                            Spacer()
                        }
                        .padding(.vertical, 13)
                        .foregroundColor(scheme == .dark && !inviteSent ? Color.brDkBg : .white)
                        .brGlass(
                            in: RoundedRectangle(cornerRadius: 12),
                            tint: inviteSent ? Color.brGreen.opacity(0.7) : (scheme == .dark ? Color.brGold : Color.brGreen),
                            interactive: true,
                            fallback: inviteSent ? Color.brGreen.opacity(0.7) : (scheme == .dark ? Color.brGold : Color.brGreen))
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSendInvite)
                    .opacity(canSendInvite || inviteSent ? 1 : 0.5)
                    .animation(.easeInOut(duration: 0.2), value: inviteSent)

                    if let inviteError {
                        Text(inviteError).font(BRFont.body(12, .regular)).foregroundColor(.brRed)
                    }
                }
                .padding(18)
            }
            .brCard()
            .padding(.horizontal, 20)

            Text("Friends you invite get guest access. Suggestions use scrambled phone numbers, never names. Invisible mode turns them off.")
                .font(BRFont.body(11, .regular))
                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                .padding(.horizontal, 24)
        }
    }

    /// A contact: open Messages. An email: the station sends it and the pass is ready when they sign up.
    private func sendInvite() {
        inviteError = nil
        if let phone = selectedPhone {
            activeSheet = .messageComposer(phone)
            selectedPhone = nil
            return
        }
        let email = guestEmail.trimmingCharacters(in: .whitespaces).lowercased()
        guard emailLooksValid else { return }
        Task {
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/guest/invite", [
                    "guestEmail": email,
                    "duration": selectedDuration.apiKey,
                ])
                withAnimation { inviteSent = true }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                withAnimation { guestEmail = ""; inviteSent = false }
            } catch {
                inviteError = (error as? BackendError)?.message ?? error.localizedDescription
            }
        }
    }
}

// MARK: - Contact invite row

private struct ContactInviteRow: View {
    let contact: BRContact
    var caption: String? = nil
    var selected = false
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
                    .font(BRFont.body(15, .medium))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                if let caption {
                    Text(caption)
                        .font(BRFont.body(12, .semibold))
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                } else if let phone = contact.primaryPhone {
                    Text(phone)
                        .font(BRFont.body(12, .regular))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
            }

            Spacer()

            Button(action: onInvite) {
                Text(selected ? "Selected" : "Select")
                    .font(BRFont.display(12))
                    .kerning(1)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background((scheme == .dark ? Color.brGold : Color.brGreen).opacity(selected ? 1 : 0.85))
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

    private func letter(_ c: BRContact) -> String {
        let f = c.name.trimmingCharacters(in: .whitespaces).prefix(1).uppercased()
        return f.rangeOfCharacter(from: .letters) != nil ? f : "#"
    }

    /// Alphabetical groups. With no search, the likely contacts get their own group at the top.
    private var sections: [(key: String, items: [BRContact])] {
        var out: [(String, [BRContact])] = []
        var rest = filtered
        if search.isEmpty {
            let likely = filtered.filter { $0.score > 0 }
            if !likely.isEmpty { out.append(("★", likely)) }
            rest = filtered.filter { $0.score == 0 }
        }
        let grouped = Dictionary(grouping: rest, by: letter)
        for k in grouped.keys.sorted(by: { $0 == "#" ? false : ($1 == "#" ? true : $0 < $1) }) {
            out.append((k, grouped[k]!.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }))
        }
        return out
    }

    private func row(_ contact: BRContact) -> some View {
        Button(action: { if let phone = contact.primaryPhone { onSelect(phone) } }) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(contact.avatarColor.opacity(0.8)).frame(width: 36, height: 36)
                    Text(contact.initials).font(BRFont.display(13)).foregroundColor(.white)
                }
                VStack(alignment: .leading) {
                    Text(contact.name).font(BRFont.body(15, .medium))
                    if contact.savedBy >= 1 {
                        Text("\(contact.savedBy)+ mutuals").font(BRFont.body(12, .semibold)).foregroundColor(scheme == .dark ? .brGold : .brGreen)
                    } else if let p = contact.primaryPhone {
                        Text(p).font(BRFont.body(12, .regular)).foregroundColor(.secondary)
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

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                List {
                    ForEach(sections, id: \.key) { sec in
                        Section {
                            ForEach(sec.items) { row($0) }
                        } header: {
                            Text(sec.key == "★" ? "Might be interested in Babson Radio" : sec.key).id("sec-" + sec.key)
                        }
                    }
                }
                .listStyle(.plain)
                .overlay(alignment: .trailing) {
                    if search.isEmpty {
                        let keys = sections.map(\.key)
                        GeometryReader { geo in
                            VStack(spacing: 0) {
                                ForEach(keys, id: \.self) { k in
                                    Text(k == "★" ? "★" : k)
                                        .font(BRFont.body(10, .bold))
                                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                                        .frame(maxHeight: .infinity)
                                }
                            }
                            .frame(width: 22, height: min(geo.size.height, CGFloat(keys.count) * 16))
                            .frame(maxHeight: .infinity)
                            .contentShape(Rectangle())
                            .gesture(DragGesture(minimumDistance: 0).onChanged { g in
                                let h = min(geo.size.height, CGFloat(keys.count) * 16)
                                let top = (geo.size.height - h) / 2
                                let idx = Int((g.location.y - top) / h * CGFloat(keys.count))
                                if keys.indices.contains(idx) { proxy.scrollTo("sec-" + keys[idx], anchor: .top) }
                            })
                        }
                        .frame(width: 22)
                    }
                }
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
                    .font(BRFont.body(14, .medium))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                        .font(.system(size: 10))
                    Text(invite.expiresLabel)
                        .font(BRFont.body(12, .regular))
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
    /// The few likely contacts shown on the profile page. Reshuffled each time the profile opens.
    @Published var featured: [BRContact] = []
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
        reshuffle()
    }

    /// Pick a fresh handful of likely contacts (favoring stronger matches, but not always the same ones).
    func reshuffle() {
        let strong = babson.filter { $0.score >= 3 }.shuffled()
        let rest = babson.filter { $0.score < 3 }.shuffled()
        featured = Array((strong + rest).prefix(5))
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
            suggestionsNote = byContact.isEmpty ? "No suggestions yet." : ""
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

    /// Babson's own phone lines (Public Safety, advising, offices) are public and are never suggested.
    /// Babson's campus numbers all start 781-239. Add other prefixes ("617555") or full 10-digit numbers here if more turn up.
    nonisolated private static let blockedNumberPrefixes = ["781239"]

    /// Words that mark an office or department instead of a person. A contact with one of these in its name or details is never suggested.
    nonisolated private static let officeWords = ["public safety", "campus police", "campus safety", "security", "advising", "advisor", "adviser",
                                                  "student life", "dean of", "registrar", "financial aid", "help desk", "helpdesk", "dining", "health services",
                                                  "counseling", "front desk", "main office", "switchboard"]

    nonisolated private static func isBlockedNumber(_ raw: String) -> Bool {
        var d = raw.filter(\.isNumber)
        if d.count == 11, d.hasPrefix("1") { d.removeFirst() }
        return blockedNumberPrefixes.contains { d.hasPrefix($0) }
    }

    /// True for Babson's own lines and office-style contacts. These are left out of suggestions and their numbers are never uploaded.
    nonisolated private static func isCampusOffice(_ c: CNContact, name: String) -> Bool {
        if c.phoneNumbers.contains(where: { isBlockedNumber($0.value.stringValue) }) { return true }
        let text = [name, c.organizationName, c.departmentName, c.jobTitle, c.nickname].joined(separator: " ")
        return officeWords.contains { text.localizedCaseInsensitiveContains($0) }
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

    nonisolated private static func digits(_ s: String) -> String { s.filter { $0.isNumber } }

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
            let me = AuthManager.shared.currentUser
            let myEmail = (me?.email ?? "").lowercased()
            let myName = (me?.displayName ?? "").lowercased()
            let myPhone = Self.digits(me?.phoneNumber ?? "")
            do {
                try self.store.enumerateContacts(with: request) { contact, _ in
                    let name = "\(contact.givenName) \(contact.familyName)"
                        .trimmingCharacters(in: .whitespaces)
                    let phone = contact.phoneNumbers.first?.value.stringValue
                    // Never list the person's own contact card.
                    let isMe = (!myEmail.isEmpty && contact.emailAddresses.contains { ($0.value as String).lowercased() == myEmail })
                        || (!myName.isEmpty && name.lowercased() == myName)
                        || (myPhone.count >= 10 && contact.phoneNumbers.contains { Self.digits($0.value.stringValue).suffix(10) == myPhone.suffix(10) })
                    if isMe { return }
                    if !name.isEmpty, let phone {
                        // Babson's own lines and offices stay in the full contact list but are never suggested or counted.
                        let office = Self.isCampusOffice(contact, name: name)
                        let match = office ? nil : Self.babsonMatch(contact, name: name)
                        let hashes = office ? [] : contact.phoneNumbers.compactMap { Self.phoneHash($0.value.stringValue) }
                        let emailHashes = office ? [] : contact.emailAddresses.compactMap { Self.emailHash($0.value as String) }
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
    var caption: String? { nil }

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
    let insights: [String: HostInsight]?
}
nonisolated struct HostComment: Decodable { let stars: Double?; let text: String? }
nonisolated struct HostNote: Decodable { let headline: String?; let message: String? }
/// Live feed for one show: pinned note, reactions, ratings.
nonisolated struct HostInsight: Decodable {
    let ratingsHidden: Bool?
    let comments: [HostComment]?
    let reactions: [String: Int]?
    let recentReactions: [String: Int]?
    let ratingCount: Int?
    let ratingAvg: Double?
    let note: HostNote?
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
    @State private var skipping = false
    @State private var skipMessage: String?
    @State private var target = 0            // 0 = listeners, 1 = station staff
    @State private var noteHeadline = ""
    @State private var noteBody = ""
    @State private var staffText = ""
    @State private var msgStatus: String?
    @State private var sending = false

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
                if let err = host.error { Text(err).font(BRFont.body(13, .regular)).foregroundColor(.brRed) }
                if let s = host.status {
                    controls(s)
                    if s.controlsOpen, selected != nil {
                        messageCard(s)
                        ratingsCard(s)
                        reactionsCard(s)
                    }
                    HostOptionsView(inset: 0)
                    setList(s)
                    yourShows(s)
                    changeRequest
                } else if host.error == nil {
                    ProgressView()
                }
            }
            .padding(20)
        }
        .background(HWDesk())
        .navigationTitle("Host panel")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await host.load() }
        .task {
            await host.load()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(host.status?.controlsOpen == true ? 8 : 20))
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
                    .font(BRFont.body(11, .semibold)).foregroundColor(sub)
                Text((np?.song ?? "").isEmpty ? "Nothing reported right now" : np!.song)
                    .font(BRFont.body(18, .semibold)).foregroundColor(text)
                if let np { Text("\(np.listeners) listening").font(BRFont.body(12, .regular)).foregroundColor(sub) }
                Button {
                    Task {
                        skipping = true; skipMessage = nil
                        do { let _: EmptyResponse = try await BackendAPI.post("/api/host/skip", [String: String]()); skipMessage = "Skipped." }
                        catch { skipMessage = (error as? BackendError)?.message ?? error.localizedDescription }
                        skipping = false
                    }
                } label: {
                    HStack(spacing: 8) {
                        if skipping { ProgressView().tint(.white) } else { Image(systemName: "forward.fill"); Text("Skip track").font(BRFont.display(14)).kerning(2) }
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
                .disabled(skipping)
                if let m = skipMessage { Text(m).font(BRFont.body(12, .regular)).foregroundColor(sub) }
                Text("Open \(s.windowHours) hours before to \(s.windowHours) hours after your show.")
                    .font(BRFont.body(11, .regular)).foregroundColor(sub)
            } else if let next = s.shows.first(where: { $0.startAt.timeIntervalSinceNow > Double(s.windowHours) * 3600 }) {
                Text("Opens \(s.windowHours) hours before \(next.title).")
                    .font(BRFont.body(14, .regular)).foregroundColor(sub)
            } else {
                Text("You have no upcoming shows this week.").font(BRFont.body(14, .regular)).foregroundColor(sub)
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private func insight(_ s: HostStatus) -> HostInsight? { selected.flatMap { s.insights?[$0.id] } }

    private func field(_ placeholder: String, _ binding: Binding<String>, axis: Axis = .horizontal) -> some View {
        TextField(placeholder, text: binding, axis: axis)
            .font(BRFont.body(15, .regular)).foregroundColor(text)
            .padding(12)
            .background(HWDesk())
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder private func messageCard(_ s: HostStatus) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BRSectionHeader(title: "SEND A MESSAGE")
            Picker("To", selection: $target) {
                Text("Listeners").tag(0)
                Text("Station staff").tag(1)
            }
            .pickerStyle(.segmented)
            if target == 0 {
                if let n = insight(s)?.note, !(n.headline ?? "").isEmpty || !(n.message ?? "").isEmpty {
                    Text("Pinned now: \(n.headline ?? "") \(n.message ?? "")").font(BRFont.body(12, .regular)).foregroundColor(sub)
                }
                field("Headline", $noteHeadline)
                field("Message (optional)", $noteBody, axis: .vertical)
            } else {
                field("Message to the station team", $staffText, axis: .vertical)
            }
            HStack(spacing: 10) {
                Button { Task { await sendMessage() } } label: {
                    Text(sending ? "SENDING…" : (target == 0 ? "PIN TO LISTENERS" : "SEND TO STAFF")).font(BRFont.display(13)).kerning(1.5)
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                }
                .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
                .disabled(sending || (target == 0 ? noteHeadline.trimmingCharacters(in: .whitespaces).isEmpty && noteBody.trimmingCharacters(in: .whitespaces).isEmpty : staffText.trimmingCharacters(in: .whitespaces).count < 2))
                if target == 0 {
                    Button { Task { noteHeadline = ""; noteBody = ""; await sendMessage(clear: true) } } label: {
                        Text("Clear").font(BRFont.display(13)).kerning(1.5).padding(.vertical, 13).padding(.horizontal, 16)
                            .foregroundColor(accent)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(accent, lineWidth: 1.5))
                    }
                    .disabled(sending)
                }
            }
            if let m = msgStatus { Text(m).font(BRFont.body(12, .regular)).foregroundColor(sub) }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private func sendMessage(clear: Bool = false) async {
        sending = true; msgStatus = nil
        do {
            if target == 0, let sel = selected {
                let _: EmptyResponse = try await BackendAPI.post("/api/live/note",
                    ["occId": sel.id, "headline": clear ? "" : noteHeadline, "message": clear ? "" : noteBody])
                msgStatus = clear ? "Cleared." : "Pinned for listeners."
            } else {
                let _: EmptyResponse = try await BackendAPI.post("/api/host/staff-message", ["text": staffText])
                staffText = ""; msgStatus = "Sent to the station team."
            }
            await host.load()
        } catch { msgStatus = (error as? BackendError)?.message ?? error.localizedDescription }
        sending = false
    }

    @ViewBuilder private func ratingsCard(_ s: HostStatus) -> some View {
        let i = insight(s)
        VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "LIVE RATINGS")
            if i?.ratingsHidden == true {
                Text("Ratings are off for you. Listeners can still rate, and the station still sees them. That was chosen when the show was booked and can't change during the show.")
                    .font(BRFont.body(13, .regular)).foregroundColor(sub)
            } else if (i?.ratingCount ?? 0) == 0 {
                Text("No ratings yet.").font(BRFont.body(14, .regular)).foregroundColor(sub)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(String(format: "%.1f", i?.ratingAvg ?? 0)).font(BRFont.body(32, .bold)).foregroundColor(text)
                    Text("★  ·  \(i?.ratingCount ?? 0) rating\((i?.ratingCount ?? 0) == 1 ? "" : "s")").font(BRFont.body(13, .regular)).foregroundColor(sub)
                }
                ForEach(Array((i?.comments ?? []).enumerated()), id: \.offset) { _, c in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(repeating: "★", count: Int((c.stars ?? 0).rounded()))).font(BRFont.body(11, .regular)).foregroundColor(accent)
                        Text(c.text ?? "").font(BRFont.body(14, .regular)).foregroundColor(text)
                    }
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                    .background(HWDesk())
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    @ViewBuilder private func reactionsCard(_ s: HostStatus) -> some View {
        let i = insight(s)
        let total = (i?.reactions ?? [:]).sorted { $0.value > $1.value }
        let recent = i?.recentReactions ?? [:]
        VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "LIVE REACTIONS")
            if total.isEmpty {
                Text("No reactions yet.").font(BRFont.body(14, .regular)).foregroundColor(sub)
            } else {
                ForEach(total, id: \.key) { e, n in
                    HStack {
                        Text(e).font(BRFont.body(26, .regular))
                        Text("\(n)").font(BRFont.body(20, .semibold)).foregroundColor(text)
                        Spacer()
                        if let r = recent[e], r > 0 { Text("+\(r) just now").font(BRFont.body(12, .semibold)).foregroundColor(accent) }
                    }
                }
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
                    .font(BRFont.body(12, .regular)).foregroundColor(sub)
                TextEditor(text: $songs)
                    .frame(minHeight: 200)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(HWFieldFill())
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(alignment: .topLeading) {
                        if songs.isEmpty {
                            Text("One song per line:\nArtist – Song title").font(BRFont.body(14, .regular)).foregroundColor(sub.opacity(0.7))
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
                    HStack { if saving { ProgressView().tint(.white) } else { Text("Save set list").font(BRFont.display(14)).kerning(2) } }
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
                .disabled(saving)
                if let m = setlistMessage { Text(m).font(BRFont.body(12, .regular)).foregroundColor(sub) }
                Text("Type as you go or paste the list at the end.")
                    .font(BRFont.body(11, .regular)).foregroundColor(sub)
            } else {
                Text("Opens \(s.windowHours) hours before your show.").font(BRFont.body(14, .regular)).foregroundColor(sub)
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
                            Text(show.title).font(BRFont.body(15, .semibold)).foregroundColor(text)
                            Text("\(show.startAt.formatted(.dateTime.weekday(.abbreviated).month().day().hour().minute()))")
                                .font(BRFont.body(12, .regular)).foregroundColor(sub)
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
                            changeMessage = "Sent. It goes live when approved."
                        } catch { changeMessage = (error as? BackendError)?.message ?? error.localizedDescription }
                    }
                } label: {
                    Text("Send request").font(BRFont.display(14)).kerning(2)
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
                .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty && newDescription.trimmingCharacters(in: .whitespaces).isEmpty)
                if let m = changeMessage { Text(m).font(BRFont.body(12, .regular)).foregroundColor(sub) }
                Text("Change the picture on the website.").font(BRFont.body(11, .regular)).foregroundColor(sub)
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
    /// Inside a Profile disclosure row: no card or title of its own.
    var bare = false
    @State private var gradYear = ""
    @State private var concentration = ""
    @State private var bMonth = 0
    @State private var bDay = 0
    @State private var message: String?
    @State private var saving = false
    /// What is saved on the server. The save button only appears when something differs from this, then goes away once saved.
    @State private var saved: [String] = ["", "", "0", "0"]
    private var current: [String] { [gradYear, concentration, String(bMonth), String(bDay)] }
    private var dirty: Bool { current != saved }

    private func field(_ title: String, _ placeholder: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(BRFont.body(12, .semibold))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            TextField(placeholder, text: text)
                .font(BRFont.body(15, .regular))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                .textInputAutocapitalization(.words)
                .padding(12)
                .background(HWDesk())
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !bare {
                Text("About you")
                    .font(BRFont.body(15, .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text("All optional.")
                    .font(BRFont.body(12, .regular))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Graduation year").font(BRFont.body(12, .semibold))
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
                    Text("Concentration").font(BRFont.body(12, .semibold))
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
                Text("Birthday (optional)").font(BRFont.body(12, .semibold))
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
                Text("Only used for a birthday notification and so the DJ knows. We never ask for the year.")
                    .font(BRFont.body(12, .regular))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }

            if let message {
                Text(message).font(BRFont.body(12, .regular)).foregroundColor(scheme == .dark ? .brGold : .brGreen)
            }
            if dirty || saving {
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
                        saved = current
                        message = "Saved."
                        await ProfileStore.shared.load()
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        if message == "Saved." { message = nil }
                    } catch { message = error.localizedDescription }
                    saving = false
                }
            } label: {
                Text(saving ? "SAVING…" : "SAVE DETAILS")
                    .font(BRFont.display(14)).kerning(2)
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
            }
            .buttonStyle(HWKeyStyle(corner: 10, lit: false, height: nil))
            .disabled(saving)
            }
        }
        .padding(bare ? 0 : 18)
        .modifier(CardIf(on: !bare))
        .task {
            if let me: MeResponse = try? await BackendAPI.get("/api/me") {
                gradYear = me.gradYear ?? ""
                concentration = me.concentrations?.first ?? ""
                bMonth = me.birthday?.month ?? 0
                bDay = me.birthday?.day ?? 0
                saved = current
            }
        }
    }
}


// MARK: - Notifications everyone can choose (birthday message, station announcements)

struct NotificationChoicesSection: View {
    @Environment(\.colorScheme) var scheme
    var bare = false
    @StateObject private var push = PushManager.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !bare {
                Text("Notifications").font(BRFont.body(15, .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
            }
            Toggle("Happy birthday message", isOn: Binding(get: { push.birthdayOn }, set: { v in Task { await push.setMine(birthday: v) } }))
            Toggle("Station announcements (live events and news)", isOn: Binding(get: { push.announcementsOn }, set: { v in Task { await push.setMine(announcements: v) } }))
            if !push.status.isEmpty {
                Text(push.status).font(BRFont.body(12, .regular)).foregroundColor(.brRed)
            }
        }
        .font(BRFont.body(14, .regular))
        .tint(scheme == .dark ? .brGold : .brGreen)
        .padding(bare ? 12 : 18)
        .modifier(CardIf(on: !bare))
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
                Text("Beat delay").font(BRFont.body(15, .semibold))
                Spacer()
                Text(String(format: "%.2f s", audio.beatDelay))
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
            Slider(value: $audio.beatDelay, in: 0...12, step: 0.25)
                .tint(scheme == .dark ? .brGold : .brGreen)
            Text("Lower if the pulse lands late, raise if early.")
                .font(BRFont.body(12, .regular))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
        }
        .padding(16)
        .brGlass(in: RoundedRectangle(cornerRadius: 14))
    }
}


/// The standard card, or nothing (when the view already sits inside a card).
private struct CardIf: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View { if on { content.brCard() } else { content } }
}
