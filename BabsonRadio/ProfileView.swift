import SwiftUI
import Combine
import Contacts

// MARK: - Profile Tab
// Shows AuthView if signed out, signed-in profile otherwise.

struct ProfileView: View {
    @StateObject private var auth = AuthManager.shared

    var body: some View {
        if auth.isSignedIn, let user = auth.currentUser {
            SignedInProfileView(user: user)
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
    @StateObject private var auth = AuthManager.shared
    @StateObject private var contacts = ContactsManager()
    @Environment(\.colorScheme) var scheme

    // Listeners (will come from Firestore presence in production)
    @State private var listeners: [LiveListener] = LiveListener.sampleListeners

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
                        .padding(.bottom, 32)

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
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Sign Out") {
                        auth.signOut()
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
                if user.isDeveloper {
                    BRTagChip(text: "DEVELOPER", style: .gold)
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
                        Text("\(listeners.count) people tuned in")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        Text("Live right now")
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

            Text("Listener identities are private.")
                .font(.system(size: 11))
                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                .padding(.horizontal, 24)
        }
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
                        .background(
                            inviteSent
                                ? Color.brGreen.opacity(0.7)
                                : (scheme == .dark ? Color.brGold : Color.brGreen)
                        )
                        .foregroundColor(scheme == .dark && !inviteSent ? Color.brDkBg : .white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
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
                            ForEach(contacts.list.prefix(5)) { contact in
                                ContactInviteRow(contact: contact) {
                                    if let phone = contact.primaryPhone {
                                        activeSheet = .messageComposer(phone)
                                    }
                                }
                                if contact.id != contacts.list.prefix(5).last?.id {
                                    Divider()
                                        .background(scheme == .dark ? Color.brDkBorder : Color.brLtBorder)
                                        .padding(.leading, 60)
                                }
                            }
                        }

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

            Text("Babson Radio never stores or uploads your contacts.")
                .font(.system(size: 11))
                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                .padding(.horizontal, 24)
        }
    }
}

// MARK: - Contact invite row

private struct ContactInviteRow: View {
    let contact: BRContact
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
                if let phone = contact.primaryPhone {
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
        search.isEmpty ? contacts.list : contacts.list.filter {
            $0.name.localizedCaseInsensitiveContains(search)
        }
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
                            if let p = contact.primaryPhone {
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

class ContactsManager: ObservableObject {
    @Published var accessGranted = false
    @Published var list: [BRContact] = []

    // Store kept alive for the lifetime of the manager
    private let store = CNContactStore()

    func requestAccessIfNeeded() async {
        let status = CNContactStore.authorizationStatus(for: .contacts)
        switch status {
        case .authorized:
            await MainActor.run { self.accessGranted = true }
            loadContacts()
        case .notDetermined:
            // Don't auto-prompt — wait for the user to tap the button
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

    private func loadContacts() {
        let keys: [CNKeyDescriptor] = [
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor
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
                        result.append(BRContact(id: contact.identifier, name: name, primaryPhone: phone))
                    }
                }
            } catch {
                print("Contacts load error: \(error)")
            }
            DispatchQueue.main.async { self.list = result }
        }
    }
}

// MARK: - BRContact model

struct BRContact: Identifiable {
    let id: String
    let name: String
    let primaryPhone: String?

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
