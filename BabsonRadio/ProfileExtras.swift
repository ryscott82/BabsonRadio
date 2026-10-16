import SwiftUI

// MARK: - Pieces shared by the Profile screen and Go on air (mirrors the website's profile page)

/// The six profile colors. Same ids and colors as the website (lib/profile.ts).
enum AvatarPalette {
    static let all: [(id: String, hex: String)] = [
        ("green", "2E7D57"), ("teal", "2A8C8C"), ("blue", "3B6FB6"),
        ("plum", "7B4B94"), ("rust", "B5543A"), ("slate", "556070"),
    ]
    static func color(_ id: String?) -> Color { Color(hex: all.first(where: { $0.id == id })?.hex ?? all[0].hex) }
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
    @Published var me: ProfileMe?
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
        let _: EmptyResponse? = try? await BackendAPI.post("/api/me", ["avatarColor": id])
        await load()
    }
}

/// Colored circle with the first initial.
struct ProfileAvatar: View {
    let name: String
    let colorId: String?
    var size: CGFloat = 84
    var body: some View {
        ZStack {
            Circle().fill(AvatarPalette.color(colorId))
            Text(String(name.trimmingCharacters(in: .whitespaces).first.map { String($0).uppercased() } ?? "?"))
                .font(BRFont.display(size * 0.5)).foregroundColor(.white)
        }
        .frame(width: size, height: size)
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
                        Text(title).font(.system(size: 16, weight: .semibold))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        if let hint { Text(hint).font(.system(size: 13)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub) }
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
    @Environment(\.colorScheme) private var scheme
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
            BRSectionHeader(title: "YOUR SHOW OPTIONS").padding(.horizontal, 20)
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Look during your show").font(.system(size: 15, weight: .semibold)).foregroundColor(text)
                    HStack(spacing: 8) {
                        ForEach(Self.themes, id: \.id) { t in
                            Button { theme = t.id; save() } label: {
                                Text(t.label).font(.system(size: 13, weight: .medium)).lineLimit(1).minimumScaleFactor(0.8)
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
                    Text("Reactions (\(emojis.count)/6)").font(.system(size: 15, weight: .semibold)).foregroundColor(text)
                    Text(emojis.isEmpty ? "None picked: listeners see the usual ones." : "Listeners see these during your show.")
                        .font(.system(size: 12)).foregroundColor(sub)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 8) {
                        ForEach(Self.choices, id: \.self) { e in
                            Button { toggle(e) } label: {
                                Text(e).font(.system(size: 24)).frame(height: 44).frame(maxWidth: .infinity)
                                    .background(emojis.contains(e) ? accent.opacity(0.25) : (scheme == .dark ? Color.brDkSurface2 : Color.brLtSurface2))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(emojis.contains(e) ? accent : .clear, lineWidth: 2))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                Toggle(isOn: Binding(get: { ratings }, set: { ratings = $0; save() })) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Ratings").font(.system(size: 15, weight: .semibold)).foregroundColor(text)
                        Text("Off hides ratings from listeners and from you.").font(.system(size: 12)).foregroundColor(sub)
                    }
                }
                .tint(accent)
                if let error { Text(error).font(.system(size: 12)).foregroundColor(.brRed) }
            }
            .padding(18).brCard().padding(.horizontal, 20)
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
