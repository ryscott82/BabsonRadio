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

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var canUse: Bool { auth.isSignedIn && !auth.isGuest }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    if !canUse {
                        Text(auth.isSignedIn
                             ? "Saved episodes are for Babson students. Guests can listen live."
                             : "Sign in with your Babson email to save episodes. Use the profile button in the top corner.")
                            .font(.system(size: 14)).foregroundColor(sub)
                    } else {
                        if let e = lib.error { Text(e).font(.system(size: 13)).foregroundColor(.brRed) }

                        VStack(alignment: .leading, spacing: 12) {
                            BRSectionHeader(title: "SAVED")
                            if lib.saved.isEmpty {
                                Text(lib.loaded ? "Nothing saved yet. Tap the star on an episode to keep it here." : "Loading…")
                                    .font(.system(size: 14)).foregroundColor(sub)
                            }
                            ForEach(lib.saved) { EpisodeListRow(ep: $0) }
                        }

                        if !lib.forYou.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                BRSectionHeader(title: lib.basedOnInterests ? "BASED ON YOUR INTERESTS" : "NEW EPISODES")
                                ForEach(lib.forYou) { EpisodeListRow(ep: $0) }
                            }
                        }
                    }
                }
                .padding(20)
            }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
            .navigationTitle("Library")
            .navigationBarTitleDisplayMode(.inline)
            .profileButton()
            .refreshable { if canUse { await lib.loadLibrary() } }
        }
        .task(id: canUse) { if canUse { await lib.loadLibrary() } }
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
                Text(ep.title).font(.system(size: 14, weight: .semibold)).lineLimit(2)
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text(ep.subtitle).font(.system(size: 12)).lineLimit(1)
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
            Spacer(minLength: 0)

            Button { Task { await lib.toggle(ep) } } label: {
                Image(systemName: lib.savedIds.contains(ep.id) ? "star.fill" : "star")
                    .font(.system(size: 18))
                    .foregroundColor(lib.savedIds.contains(ep.id) ? (scheme == .dark ? .brGold : .brGreen) : (scheme == .dark ? .brDkSub : .brLtSub))
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
                Text(ep.title).font(.system(size: 18, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text(ep.subtitle).font(.system(size: 13))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                if !ep.description.isEmpty {
                    Text(ep.description).font(.system(size: 14))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
                Button("Done") { dismiss() }
                    .font(.system(size: 15, weight: .semibold))
                    .padding(.top, 8)
            }
            .padding(20)
            Spacer()
        }
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
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
