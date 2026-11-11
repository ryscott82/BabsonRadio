import SwiftUI
import Combine

// MARK: - Shows tab
// The station's shows with their description and hosts, the same list as the website's Shows page. Tap one to see its episodes.

nonisolated struct ShowItem: Identifiable, Decodable, Hashable {
    let id: String
    let slug: String
    let name: String
    let category: String
    let description: String
    let longDescription: String
    let artworkURL: String
    let isFeatured: Bool
    let hostNames: [String]
    let totalEpisodes: Int

    var hosts: String { hostNames.joined(separator: ", ") }
}

nonisolated private struct ShowsReply: Decodable { let items: [ShowItem] }

@MainActor
final class ShowsManager: ObservableObject {
    static let shared = ShowsManager()
    @Published var shows: [ShowItem] = []
    @Published var loaded = false
    @Published var error: String?

    func load() async {
        do {
            let r: ShowsReply = try await BackendAPI.get("/api/shows")
            shows = r.items; error = nil
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        loaded = true
    }
}

struct ShowsView: View {
    @ObservedObject private var mgr = ShowsManager.shared
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) private var scheme

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    BRSectionHeader(title: "Shows")
                    if let e = mgr.error { Text(e).font(BRFont.body(13, .regular)).foregroundColor(.brRed) }
                    if mgr.loaded && mgr.shows.isEmpty && mgr.error == nil {
                        Text("New shows will show up here as they are added.").font(BRFont.body(14, .regular)).foregroundColor(sub)
                    } else if !mgr.loaded {
                        Text("Loading…").font(BRFont.body(14, .regular)).foregroundColor(sub)
                    }
                    ForEach(mgr.shows) { show in
                        NavigationLink(value: show) { ShowRow(show: show) }.buttonStyle(.plain)
                    }
                }
                .padding(20)
            }
            .hwPage()
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { EtchedText(text: "Babson Radio", size: 24) } }
            .profileButton()
            .navigationDestination(for: ShowItem.self) { ShowDetailView(show: $0) }
            .refreshable { await mgr.load() }
        }
        .task(id: auth.canAccessLibrary) { if auth.canAccessLibrary { await mgr.load() } }
    }
}

private struct ShowRow: View {
    let show: ShowItem
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        HStack(spacing: 14) {
            ShowArt(show: show).frame(width: 72, height: 72)
            VStack(alignment: .leading, spacing: 3) {
                Text(show.name).font(BRFont.body(16, .semibold)).lineLimit(1)
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                if !show.category.isEmpty {
                    Text(show.category).font(BRFont.body(12, .regular)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
                Text(show.description).font(BRFont.body(13, .regular)).lineLimit(2)
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                if !show.hosts.isEmpty {
                    Text(show.hosts).font(BRFont.body(12, .regular)).lineLimit(1)
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brCard()
    }
}

/// The show's picture, or its first letter on a plain plate. No green gradient.
private struct ShowArt: View {
    let show: ShowItem
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ZStack {
            (scheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.07))
            Text(String(show.name.prefix(1))).font(BRFont.display(30)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            if let u = URL(string: show.artworkURL), !show.artworkURL.isEmpty {
                AsyncImage(url: u) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

struct ShowDetailView: View {
    let show: ShowItem
    @ObservedObject private var lib = LibraryManager.shared
    @Environment(\.colorScheme) private var scheme
    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var episodes: [LibEpisode] { lib.all.filter { $0.showSlug == show.slug } }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 16) {
                    ShowArt(show: show).frame(width: 110, height: 110)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(show.name).font(BRFont.display(26)).foregroundColor(text)
                        if !show.category.isEmpty { Text(show.category).font(BRFont.body(13, .regular)).foregroundColor(sub) }
                        if !show.hosts.isEmpty { Text("With \(show.hosts)").font(BRFont.body(13, .regular)).foregroundColor(sub) }
                    }
                }
                Text(show.longDescription.isEmpty ? show.description : show.longDescription)
                    .font(BRFont.body(14, .regular)).foregroundColor(sub)
                if AuthManager.shared.isSignedIn {
                    ReportContentButton(what: "Show page: \(show.name)", text: show.longDescription.isEmpty ? show.description : show.longDescription)
                        .foregroundColor(sub)
                }
                BRSectionHeader(title: "Episodes")
                if episodes.isEmpty {
                    Text(lib.loaded ? "No episodes yet." : "Loading…").font(BRFont.body(14, .regular)).foregroundColor(sub)
                }
                ForEach(episodes) { EpisodeListRow(ep: $0) }
            }
            .padding(20)
        }
        .hwPage()
        .navigationBarTitleDisplayMode(.inline)
        .task { if !lib.loaded { await lib.loadAll() } }
    }
}
