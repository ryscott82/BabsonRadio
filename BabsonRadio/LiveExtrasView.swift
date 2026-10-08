import SwiftUI
import Combine

// MARK: - Live extras: reactions that rain down on every screen, song ratings and show ratings.
// Talks to the same /api/live routes as the website.

nonisolated private struct ReactionFeed: Decodable {
    struct Ev: Decodable { let at: Double; let e: String; let c: String }
    let occId: String
    let events: [Ev]
    let now: Double
}
nonisolated private struct MineReply: Decodable { let mine: Int }
nonisolated private struct ShowRatingReply: Decodable { let mine: Int }

private func enc(_ s: String) -> String {
    s.addingPercentEncoding(withAllowedCharacters: CharacterSet.urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+=?#"))) ?? s
}

struct RainDrop: Identifiable {
    let id = UUID()
    let emoji: String
    let x: CGFloat        // 0...1 across the screen
    let size: CGFloat
    let duration: Double
    let delay: Double
    let drift: CGFloat
    let spin: Double
}

@MainActor
final class LiveExtrasModel: ObservableObject {
    static let shared = LiveExtrasModel()
    static let emojis = ["🔥", "❤️", "🎉", "👏"]

    @Published var drops: [RainDrop] = []
    @Published var message = ""
    @Published var songStars = 0
    @Published var showStars = 0

    private let cid = UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(10).lowercased()
    private var since: Double = 0
    private var pollOcc = ""
    private var lastSend = Date.distantPast

    /// Let `count` emojis fall. `spread` staggers them over that many seconds.
    func rain(_ emoji: String, count: Int, spread: Double = 0.35) {
        let new = (0..<count).map { _ in
            RainDrop(emoji: emoji, x: .random(in: 0.04...0.96), size: .random(in: 26...46),
                     duration: .random(in: 2.6...4.4), delay: .random(in: 0...spread),
                     drift: .random(in: -40...40), spin: .random(in: -60...60))
        }
        drops = Array((drops + new).suffix(90))
        let ids = Set(new.map(\.id))
        let wait = (spread + 4.6)
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            self?.drops.removeAll { ids.contains($0.id) }
        }
    }

    /// Tap: rain a handful here right away and tell the server so everyone else sees them too.
    func react(_ emoji: String) async {
        guard !AuthManager.shared.isInvisible else { return }
        rain(emoji, count: Int.random(in: 4...5))
        guard Date().timeIntervalSince(lastSend) > 0.5 else { return }
        lastSend = Date()
        do { let _: EmptyResponse = try await BackendAPI.post("/api/live/reactions", ["emoji": emoji, "cid": String(cid)]) }
        catch { flash(error.localizedDescription) }
    }

    /// Check for other people's reactions every few seconds while the live screen is open.
    func pollLoop() async {
        while !Task.isCancelled {
            if !AuthManager.shared.isInvisible { await pollOnce() }
            try? await Task.sleep(nanoseconds: 3_000_000_000)
        }
    }

    private func pollOnce() async {
        guard let occ = AudioPlayerManager.shared.nowPlaying?.occId, !occ.isEmpty else { return }
        if occ != pollOcc { pollOcc = occ; since = 0 }
        guard let feed: ReactionFeed = try? await BackendAPI.get("/api/live/reactions"), feed.occId == occ else { return }
        let first = since == 0 // do not replay what happened before we opened the screen
        if !first { for ev in feed.events where ev.c != String(cid) && ev.at > since { rain(ev.e, count: 1, spread: 2.5) } }
        since = max(since, feed.events.last?.at ?? 0, feed.now - 4_000)
    }

    func loadSongStars(title: String, artist: String) async {
        songStars = 0
        guard !title.isEmpty else { return }
        if let r: MineReply = try? await BackendAPI.get("/api/live/song-rating?title=\(enc(title))&artist=\(enc(artist))") { songStars = r.mine }
    }

    func rateSong(_ n: Int, title: String, artist: String) async {
        let before = songStars
        songStars = n
        do { let _: EmptyResponse = try await BackendAPI.post("/api/live/song-rating", ["title": title, "artist": artist, "stars": n]) }
        catch { songStars = before; flash(error.localizedDescription) }
    }

    func loadShowStars(occId: String) async {
        showStars = 0
        guard !occId.isEmpty else { return }
        if let r: ShowRatingReply = try? await BackendAPI.get("/api/live/rating?occId=\(enc(occId))") { showStars = r.mine }
    }

    func rateShow(_ n: Int, occId: String, title: String) async {
        let before = showStars
        showStars = n
        do { let _: EmptyResponse = try await BackendAPI.post("/api/live/rating", ["occId": occId, "stars": n, "title": title]) }
        catch { showStars = before; flash(error.localizedDescription) }
    }

    private func flash(_ text: String) {
        message = text
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if self?.message == text { self?.message = "" }
        }
    }
}

// MARK: - The falling emojis (put over the whole screen)

struct EmojiRainOverlay: View {
    @ObservedObject private var model = LiveExtrasModel.shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if !reduceMotion {
                    ForEach(model.drops) { d in
                        RainDropView(drop: d, width: geo.size.width, height: geo.size.height)
                    }
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct RainDropView: View {
    let drop: RainDrop
    let width: CGFloat
    let height: CGFloat
    @State private var fallen = false
    @State private var faded = false

    var body: some View {
        Text(drop.emoji)
            .font(.system(size: drop.size))
            .rotationEffect(.degrees(fallen ? drop.spin : 0))
            .position(x: drop.x * width + (fallen ? drop.drift : 0), y: fallen ? height + 80 : -50)
            .opacity(faded ? 0 : 1)
            .onAppear {
                withAnimation(.timingCurve(0.3, 0.1, 0.6, 1, duration: drop.duration).delay(drop.delay)) { fallen = true }
                withAnimation(.easeIn(duration: drop.duration * 0.25).delay(drop.delay + drop.duration * 0.75)) { faded = true }
            }
    }
}

// MARK: - Buttons and star rows under the player

struct LiveExtrasView: View {
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var model = LiveExtrasModel.shared
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) private var scheme

    private var np: NowPlayingInfo? { audio.nowPlaying }
    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var gold: Color { scheme == .dark ? .brGold : .brGreen }
    private var songKey: String { "\(np?.artist ?? "")|\(np?.title ?? "")" }

    /// The block or show on air, once it has been going 10 minutes.
    private var rateable: (occId: String, title: String, isShow: Bool)? {
        guard let np, let occ = np.occId, !occ.isEmpty, let start = np.showStart, start > 0 else { return nil }
        guard Date().timeIntervalSince1970 * 1000 > start + 10 * 60_000 else { return nil }
        let title = (np.showTitle?.isEmpty == false ? np.showTitle : np.blockTitle) ?? ""
        return (occ, title, np.isShow ?? false)
    }

    var body: some View {
        VStack(spacing: 14) {
            if let occ = np?.occId, !occ.isEmpty, auth.isInvisible {
                Text("Reactions are off while Invisible mode is on.")
                    .font(.system(size: 12)).foregroundColor(sub).multilineTextAlignment(.center)
            } else if let occ = np?.occId, !occ.isEmpty {
                HStack(spacing: 10) {
                    ForEach(LiveExtrasModel.emojis, id: \.self) { e in
                        Button { Task { await model.react(e) } } label: {
                            Text(e).font(.system(size: 24)).frame(width: 52, height: 44)
                                .background(.ultraThinMaterial, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("React with \(e)")
                    }
                }
            }

            if let np, !np.title.isEmpty {
                starRow(label: "Rate this song", value: model.songStars) { n in
                    Task { await model.rateSong(n, title: np.title, artist: np.artist) }
                }
            }

            if let r = rateable {
                starRow(label: (r.isShow ? "Rate the whole show: " : "Rate this hour of music: ") + r.title, value: model.showStars) { n in
                    Task { await model.rateShow(n, occId: r.occId, title: r.title) }
                }
            }

            if !model.message.isEmpty {
                Text(model.message).font(.system(size: 12)).foregroundColor(gold).multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 24)
        .task { await model.pollLoop() }
        .task(id: songKey) { await model.loadSongStars(title: np?.title ?? "", artist: np?.artist ?? "") }
        .task(id: np?.occId ?? "") { await model.loadShowStars(occId: np?.occId ?? "") }
    }

    private func starRow(label: String, value: Int, set: @escaping (Int) -> Void) -> some View {
        VStack(spacing: 4) {
            Text(label).font(.system(size: 12, weight: .semibold)).foregroundColor(sub).lineLimit(1)
            HStack(spacing: 6) {
                ForEach(1...5, id: \.self) { n in
                    Button { set(n) } label: {
                        Image(systemName: n <= value ? "star.fill" : "star").font(.system(size: 24)).foregroundColor(n <= value ? gold : sub)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(n) star\(n == 1 ? "" : "s")")
                }
            }
        }
    }
}
