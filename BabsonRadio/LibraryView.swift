import SwiftUI
import Combine
import WebKit

// MARK: - Library tab
// Episodes the person saved, plus "Based on your interests" (worked out on the server from what they saved and liked).
// Episodes are YouTube videos the station added; they play in a sheet inside the app. Students only.

nonisolated struct LibEpisode: Identifiable, Decodable, Hashable {
    let id: String
    let title: String
    let showName: String
    let showSlug: String
    let category: String
    let description: String
    let youtubeID: String
    let thumbnailURL: String
    let duration: Double
    let publishedAt: Double   // milliseconds
    let isNew: Bool

    var subtitle: String {
        var parts = [showName]
        if !category.isEmpty { parts.append(category) }
        if publishedAt > 0 { parts.append(Date(timeIntervalSince1970: publishedAt / 1000).formatted(.dateTime.month(.abbreviated).day())) }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

nonisolated private struct LibraryReply: Decodable {
    struct ForYou: Decodable { let basedOnInterests: Bool; let items: [LibEpisode] }
    let saved: [LibEpisode]
    let savedIds: [String]
    let forYou: ForYou
}
nonisolated private struct EpisodesReply: Decodable { let items: [LibEpisode]; let savedIds: [String] }

@MainActor
final class LibraryManager: ObservableObject {
    static let shared = LibraryManager()

    @Published var saved: [LibEpisode] = []
    @Published var savedIds: Set<String> = []
    @Published var forYou: [LibEpisode] = []
    @Published var basedOnInterests = false
    @Published var all: [LibEpisode] = []
    @Published var loaded = false
    @Published var error: String?

    func loadLibrary() async {
        do {
            let r: LibraryReply = try await BackendAPI.get("/api/library")
            saved = r.saved; savedIds = Set(r.savedIds)
            forYou = r.forYou.items; basedOnInterests = r.forYou.basedOnInterests
            error = nil
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        loaded = true
    }

    func loadAll() async {
        do {
            let r: EpisodesReply = try await BackendAPI.get("/api/episodes")
            all = r.items; savedIds = Set(r.savedIds)
            error = nil
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        loaded = true
    }

    /// Save or un-save. The star changes right away and goes back if the server says no.
    func toggle(_ ep: LibEpisode) async {
        let was = savedIds.contains(ep.id)
        if was { savedIds.remove(ep.id); saved.removeAll { $0.id == ep.id } }
        else { savedIds.insert(ep.id); saved.insert(ep, at: 0) }
        do { let _: EmptyResponse = try await BackendAPI.post("/api/library", ["episodeId": ep.id, "saved": !was]) }
        catch {
            if was { savedIds.insert(ep.id); saved.insert(ep, at: 0) } else { savedIds.remove(ep.id); saved.removeAll { $0.id == ep.id } }
            self.error = (error as? BackendError)?.message ?? error.localizedDescription
        }
    }
}

struct LibraryView: View {
    @ObservedObject private var lib = LibraryManager.shared
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) private var scheme
    @State private var query = ""
    @State private var isSearching = false

    /// Episodes whose title, show or category contains what was typed (search used to be its own tab).
    private var results: [LibEpisode] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return [] }
        return lib.all.filter { $0.title.lowercased().contains(q) || $0.showName.lowercased().contains(q) || $0.category.lowercased().contains(q) }
    }
    private var searchingNow: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var canUse: Bool { auth.canAccessLibrary }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    if !canUse {
                        Text(auth.isSignedIn
                             ? "Ask a Babson student to sponsor you."
                             : "Sign in with your Babson email to save episodes.")
                            .font(BRFont.body(14, .regular)).foregroundColor(sub)
                    } else {
                        if let e = lib.error { Text(e).font(BRFont.body(13, .regular)).foregroundColor(.brRed) }

                        if searchingNow {
                            if results.isEmpty {
                                Text("Nothing matches \"\(query)\". Try a show, episode or topic.").font(BRFont.body(14, .regular)).foregroundColor(sub)
                            }
                            ForEach(results) { EpisodeListRow(ep: $0) }
                        } else {
                        // Topics: one tap searches for it.
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            ForEach(ShowCategory.allCases, id: \.self) { cat in
                                CategoryTile(category: cat, onTap: { query = cat.rawValue })
                            }
                        }

                        VStack(alignment: .leading, spacing: 12) {
                            BRSectionHeader(title: "Saved")
                            if lib.saved.isEmpty {
                                Text(lib.loaded ? "Nothing saved yet." : "Loading…")
                                    .font(BRFont.body(14, .regular)).foregroundColor(sub)
                            }
                            ForEach(lib.saved) { EpisodeListRow(ep: $0) }
                        }

                        // Anything you star moves up to Saved right away, so it leaves this list.
                        let fresh = lib.forYou.filter { !lib.savedIds.contains($0.id) }
                        if !fresh.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                BRSectionHeader(title: lib.basedOnInterests ? "Based on your interests" : "New episodes")
                                ForEach(fresh) { EpisodeListRow(ep: $0) }
                            }
                        }
                        }
                    }
                }
                .padding(20)
                .animation(.easeInOut(duration: 0.25), value: lib.savedIds)
            }
            .hwPage()
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { EtchedText(text: "Babson Radio", size: 24) } }
            .profileButton()
            .searchable(text: $query, isPresented: $isSearching, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search shows and episodes")
            .onChange(of: isSearching) { _, now in SearchState.shared.active = now }
            .onDisappear { SearchState.shared.active = false }
            .refreshable { if canUse { await lib.loadLibrary(); await lib.loadAll() } }
        }
        .task(id: canUse) { if canUse { await lib.loadLibrary(); await lib.loadAll() } }
    }
}

// MARK: - One episode: picture, title, play and save

struct EpisodeListRow: View {
    let ep: LibEpisode
    @ObservedObject private var lib = LibraryManager.shared
    @Environment(\.colorScheme) private var scheme
    @State private var playing = false

    var body: some View {
        HStack(spacing: 12) {
            Button { playing = true } label: {
                ZStack {
                    Color.brGreen
                    AsyncImage(url: URL(string: ep.thumbnailURL)) { img in img.resizable().scaledToFill() } placeholder: { Color.clear }
                    Color.black.opacity(0.25)
                    Image(systemName: "play.fill").foregroundColor(.white)
                }
                .frame(width: 96, height: 54)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Play \(ep.title)")

            VStack(alignment: .leading, spacing: 3) {
                Text(ep.title).font(BRFont.body(14, .semibold)).lineLimit(2)
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text(ep.subtitle).font(BRFont.body(12, .regular)).lineLimit(1)
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
            Spacer(minLength: 0)

            Button { Task { await lib.toggle(ep) } } label: {
                Group {
                    if lib.savedIds.contains(ep.id) { HWStar(filled: true, size: 20) }
                    else { Image(systemName: "star").font(.system(size: 18)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub) }
                }
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(lib.savedIds.contains(ep.id) ? "Remove from library" : "Save to library")
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brCard()
        .sheet(isPresented: $playing) { EpisodePlayerSheet(ep: ep) }
    }
}

// MARK: - The video sheet

struct EpisodePlayerSheet: View {
    let ep: LibEpisode
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            YouTubeView(videoID: ep.youtubeID)
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .background(Color.black)
            VStack(alignment: .leading, spacing: 8) {
                Text(ep.title).font(BRFont.body(18, .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text(ep.subtitle).font(BRFont.body(13, .regular))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                if !ep.description.isEmpty {
                    Text(ep.description).font(BRFont.body(14, .regular))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
                Button("Done") { dismiss() }
                    .font(BRFont.body(15, .semibold))
                    .padding(.top, 8)
            }
            .padding(20)
            Spacer()
        }
        .hwPage()
        .presentationDragIndicator(.visible)
        // The live stream would play over the video, so pause it.
        .onAppear { if AudioPlayerManager.shared.isPlaying { AudioPlayerManager.shared.stop() } }
    }
}

struct YouTubeView: UIViewRepresentable {
    let videoID: String

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        let v = WKWebView(frame: .zero, configuration: cfg)
        v.scrollView.isScrollEnabled = false
        v.isOpaque = false
        v.backgroundColor = .black
        let html = """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
        <body><iframe src="https://www.youtube-nocookie.com/embed/\(videoID)?playsinline=1&autoplay=1&rel=0"
        allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></body></html>
        """
        v.loadHTMLString(html, baseURL: URL(string: "https://www.youtube-nocookie.com"))
        return v
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
