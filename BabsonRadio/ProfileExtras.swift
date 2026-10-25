import SwiftUI
import Combine

// MARK: - Pieces shared by the Profile screen and Go on air (mirrors the website's profile page)

/// The profile colors. Same ids and colors as the website (lib/profile.ts).
enum AvatarPalette {
    static let all: [(id: String, hex: String)] = [
        ("babson-green", "006644"), ("courtyard", "597C31"), ("sherwood", "9EB28F"), ("alfresco", "567B8A"),
        ("bright-gold", "DDD055"), ("mango", "EEAF00"), ("ochre", "AD9001"), ("peacock", "368180"),
        ("summer-nights", "005172"), ("englewood", "6C6F70"), ("daphne", "C7D28A"), ("cedar-key", "DAD7CB"),
        ("blue-heather", "C6D3D7"), ("beach-haven", "EDE8C4"),
    ]
    private static func hex(_ id: String?) -> String { all.first(where: { $0.id == id })?.hex ?? all[0].hex }
    static func color(_ id: String?) -> Color { Color(hex: hex(id)) }
    /// Letter color on the circle: dark on the light brand colors, white on the rest.
    static func ink(_ id: String?) -> Color {
        let n = Int(hex(id), radix: 16) ?? 0
        let lum = (0.299 * Double(n >> 16) + 0.587 * Double((n >> 8) & 255) + 0.114 * Double(n & 255)) / 255
        return lum > 0.62 ? Color(hex: "1A1710") : .white
    }
}

nonisolated struct ProfileMe: Decodable {
    struct Birthday: Decodable { let month: Int; let day: Int }
    struct HostPrefs: Decodable { let theme: String; let emojis: [String]; let ratings: Bool }
    let invisible: Bool?
    let avatarColor: String?
    let joinedAt: Double?
    let gradYear: String?
    let concentrations: [String]?
    let birthday: Birthday?
    let hostPrefs: HostPrefs?

    /// "About you" counts as answered once any of it is filled in.
    var answered: Bool { !(gradYear ?? "").isEmpty || !(concentrations ?? []).isEmpty || birthday != nil }
}

nonisolated struct HostAccess: Decodable { let host: Bool; let hosting: Bool }

@MainActor
final class ProfileStore: ObservableObject {
    static let shared = ProfileStore()
    @Published var me: ProfileMe? { didSet { avatarColor = me?.avatarColor } }
    /// The chosen profile color. Changes the moment you tap, and goes back if the server says no.
    @Published var avatarColor: String?
    @Published var colorError: String?
    /// A show of theirs is on air, or about to be (the host controls window is open). Drives the Host tab.
    @Published var hosting = false

    func load() async {
        if let r: ProfileMe = try? await BackendAPI.get("/api/me") { me = r }
    }
    func loadHosting() async {
        guard AuthManager.shared.isSignedIn, AuthManager.shared.currentUser?.isGuest != true else { hosting = false; return }
        if let r: HostAccess = try? await BackendAPI.get("/api/host/access") { hosting = r.hosting } else { hosting = false }
    }
    func setColor(_ id: String) async {
        let before = avatarColor
        avatarColor = id; colorError = nil
        do { let _: EmptyResponse = try await BackendAPI.post("/api/me", ["avatarColor": id]) }
        catch {
            avatarColor = before
            colorError = (error as? BackendError)?.message ?? error.localizedDescription
        }
    }
}

/// Colored circle with the person's initials (RS, not just R).
struct ProfileAvatar: View {
    let initials: String
    let colorId: String?
    var size: CGFloat = 84
    var body: some View {
        HWAvatar(text: initials, color: AvatarPalette.color(colorId), size: size, display: true)
    }
}

/// A card that opens its content in place.
struct ProfileDisclosure<Content: View>: View {
    let title: String
    var hint: String? = nil
    @ViewBuilder var content: () -> Content
    @State private var open = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.easeInOut(duration: 0.2)) { open.toggle() } } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(title).font(BRFont.body(16, .semibold))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        if let hint { Text(hint).font(BRFont.body(13, .regular)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub) }
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold))
                        .rotationEffect(.degrees(open ? 90 : 0))
                        .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                }
                .padding(16).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open { content().padding(.horizontal, 4).padding(.bottom, 8) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .brCard()
    }
}

// MARK: - Host options (bottom of Go on air)

struct HostOptionsView: View {
    /// Side margin: 20 on its own page, 0 when the page around it already has margins (the Host tab).
    var inset: CGFloat = 20
    @Environment(\.colorScheme) private var scheme
    @State private var custom = ""
    @State private var theme = "auto"
    @State private var emojis: [String] = []
    @State private var ratings = true
    @State private var loaded = false
    @State private var error: String?

    private static let choices = ["🔥", "❤️", "🦫", "🤘", "🎉", "😂", "👏", "🙌", "💃", "🕺", "🎶", "✨", "😍", "🤯", "💯", "🥳", "😎", "🌟", "🙏", "🎧", "🫶", "🍿", "🥹", "🤩"]
    private static let themes: [(id: String, label: String)] = [("auto", "Automatic"), ("standard", "Standard"), ("art", "Album art colors")]
    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            BRSectionHeader(title: "YOUR SHOW OPTIONS").padding(.horizontal, inset)
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Look during your show").font(BRFont.body(15, .semibold)).foregroundColor(text)
                    HStack(spacing: 8) {
                        ForEach(Self.themes, id: \.id) { t in
                            Button { theme = t.id; save() } label: {
                                Text(t.label).font(BRFont.body(13, .medium)).lineLimit(1).minimumScaleFactor(0.8)
                                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                                    .foregroundColor(theme == t.id ? (scheme == .dark ? Color.brDkBg : .white) : text)
                                    .background(theme == t.id ? accent : (scheme == .dark ? Color.brDkSurface2 : Color.brLtSurface2))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Reactions (\(emojis.count)/6)").font(BRFont.body(15, .semibold)).foregroundColor(text)
                    Text(emojis.isEmpty ? "None picked: listeners see the usual ones." : "Listeners see these during your show.")
                        .font(BRFont.body(12, .regular)).foregroundColor(sub)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 8) {
                        ForEach(Self.choices + emojis.filter { !Self.choices.contains($0) }, id: \.self) { e in
                            Button { toggle(e) } label: {
                                Text(e).font(BRFont.body(24, .regular)).frame(height: 44).frame(maxWidth: .infinity)
                                    .background(emojis.contains(e) ? accent.opacity(0.25) : (scheme == .dark ? Color.brDkSurface2 : Color.brLtSurface2))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(emojis.contains(e) ? accent : .clear, lineWidth: 2))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                HStack(spacing: 10) {
                    TextField("", text: $custom, prompt: Text("Add your own emoji").foregroundColor(.brPlaceholder))
                        .font(BRFont.body(18, .regular))
                        .padding(10)
                        .background(scheme == .dark ? Color.brDkSurface2 : Color.brLtSurface2)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .onChange(of: custom) { _, new in
                            // Keep just the last emoji typed or pasted.
                            if let last = new.last(where: { $0.unicodeScalars.contains { $0.properties.isEmojiPresentation || $0.value > 0x2100 } }) { custom = String(last) }
                        }
                    Button {
                        let e = custom.trimmingCharacters(in: .whitespaces)
                        guard !e.isEmpty, !emojis.contains(e) else { custom = ""; return }
                        if emojis.count >= 6 { error = "Up to 6 reactions."; return }
                        emojis.append(e); custom = ""; error = nil; save()
                    } label: {
                        Text("ADD").font(BRFont.display(13)).kerning(1.5).foregroundColor(accent)
                    }
                    .buttonStyle(.plain).disabled(custom.isEmpty)
                }
                if let error { Text(error).font(BRFont.body(12, .regular)).foregroundColor(.brErrorText) }
            }
            .padding(18).brCard().padding(.horizontal, inset)
        }
        .task {
            guard !loaded, let me: ProfileMe = try? await BackendAPI.get("/api/me"), let p = me.hostPrefs else { return }
            theme = p.theme; emojis = p.emojis; ratings = p.ratings; loaded = true
        }
    }

    private func toggle(_ e: String) {
        if let i = emojis.firstIndex(of: e) { emojis.remove(at: i) }
        else if emojis.count >= 6 { error = "Up to 6 reactions."; return }
        else { emojis.append(e) }
        error = nil; save()
    }

    private func save() {
        let body: [String: Any] = ["hostPrefs": ["theme": theme, "emojis": emojis, "ratings": ratings] as [String: Any]]
        Task {
            do { let _: EmptyResponse = try await BackendAPI.post("/api/me", body); error = nil }
            catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        }
    }
}

// MARK: - Change phone number

private nonisolated struct PhoneChangeInfo: Decodable {
    nonisolated struct Pending: Decodable { let last4: String }
    let current: String
    let pending: Pending?
}

/// Asks an admin to change the number on the account. Inside a Profile disclosure row.
struct PhoneChangeSection: View {
    @Environment(\.colorScheme) private var scheme
    @State private var info: PhoneChangeInfo?
    @State private var phone = ""
    @State private var busy = false
    @State private var message = ""

    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text((info.map { $0.current.isEmpty ? "" : "Current number ends in \($0.current). " } ?? "") + "An admin approves changes.")
                .font(BRFont.body(12, .regular)).foregroundColor(sub)
            if let p = info?.pending {
                Text("Waiting for approval: number ending in \(p.last4).")
                    .font(BRFont.body(14, .regular)).foregroundColor(text)
                Button("Cancel request") { Task { await cancel() } }
                    .font(BRFont.body(14, .semibold)).foregroundColor(accent).disabled(busy)
            } else {
                PhoneField(phoneNumber: $phone)
                if !message.isEmpty { Text(message).font(BRFont.body(13, .regular)).foregroundColor(.brErrorText) }
                Button { Task { await send() } } label: {
                    Text("Request change").font(BRFont.body(15, .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .foregroundColor(scheme == .dark ? .black : .white)
                        .background(accent, in: RoundedRectangle(cornerRadius: 12))
                }
                .disabled(busy || PhoneField.digits(phone).count != 10)
            }
        }
        .task { info = try? await BackendAPI.get("/api/me/phone") }
    }

    private func send() async {
        busy = true; message = ""
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/me/phone", ["phone": PhoneField.digits(phone)])
            phone = ""
            info = try? await BackendAPI.get("/api/me/phone")
        } catch { message = error.localizedDescription }
        busy = false
    }

    private func cancel() async {
        busy = true
        let _: EmptyResponse? = try? await BackendAPI.post("/api/me/phone", ["cancel": true])
        info = try? await BackendAPI.get("/api/me/phone")
        busy = false
    }
}
