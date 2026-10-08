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
nonisolated struct EmojiList: Decodable { let emojis: [String] }
nonisolated struct SkipReply: Decodable { let eligible: Bool; let votes: Int; let needed: Int; let mine: Bool }

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
    static let emojis = ["🔥", "❤️", "🦫", "🤘"]

    @Published var drops: [RainDrop] = []
    @Published var message = ""
    @Published var songStars = 0
    @Published var showStars = 0
    @Published var skip: SkipReply? = nil
    /// The reaction row: the usual ones plus any this person has earned (the server decides which).
    @Published var emojis: [String] = LiveExtrasModel.emojis
    private var pollRound = 0

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
            if pollRound % 20 == 0 { await loadEmojis() } // about once a minute
            pollRound += 1
            if !AuthManager.shared.isInvisible { await pollOnce() }
            try? await Task.sleep(nanoseconds: 3_000_000_000)
        }
    }

    func loadEmojis() async {
        guard AuthManager.shared.isSignedIn, let r: EmojiList = try? await BackendAPI.get("/api/live/emojis") else { return }
        emojis = r.emojis
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

    /// Skip the song (auto DJ only): it skips when 90% of listeners ask.
    func loadSkip() async {
        skip = try? await BackendAPI.get("/api/skip")
    }

    func askSkip() async {
        do { skip = try await BackendAPI.post("/api/skip", [:]) }
        catch { flash((error as? BackendError)?.message ?? error.localizedDescription) }
    }

    func loadShowStars(occId: String) async {
        showStars = 0
        guard !occId.isEmpty else { return }
        if let r: ShowRatingReply = try? await BackendAPI.get("/api/live/rating?occId=\(enc(occId))") { showStars = r.mine }
    }

    /// End-of-show feedback: stars plus an optional note for the host.
    func sendFeedback(stars: Int, comment: String, occId: String, title: String) async -> Bool {
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/live/rating", ["occId": occId, "stars": stars, "title": title, "comment": comment])
            return true
        } catch { flash((error as? BackendError)?.message ?? error.localizedDescription); return false }
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

    // End-of-show feedback state
    @State private var curShow: (occId: String, title: String)? = nil
    @State private var prevShow: (occId: String, title: String, at: Date)? = nil
    @State private var fbStars = 0
    @State private var fbComment = ""
    @State private var fbSent = ""
    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    @ObservedObject private var theme = ArtTheme.shared
    private var gold: Color { theme.accent(scheme) }
    private var songKey: String { "\(np?.artist ?? "")|\(np?.title ?? "")" }

    /// The block or show on air, once it has been going 10 minutes.
    private var rateable: (occId: String, title: String, isShow: Bool)? {
        guard let np, let occ = np.occId, !occ.isEmpty, let start = np.showStart, start > 0 else { return nil }
        guard Date().timeIntervalSince1970 * 1000 > start + 10 * 60_000 else { return nil }
        let title = (np.showTitle?.isEmpty == false ? np.showTitle : np.blockTitle) ?? ""
        return (occ, title, np.isShow ?? false)
    }

    private var showTitleNow: String { (np?.showTitle?.isEmpty == false ? np?.showTitle : np?.blockTitle) ?? "" }

    /// From 5 minutes before a show ends until 45 minutes after, ask how it was.
    private var feedbackTarget: (occId: String, title: String)? {
        guard auth.currentUser.map({ !$0.isGuest }) == true else { return nil }
        if let np, np.isShow == true, let occ = np.occId, !occ.isEmpty, let end = np.showEnd, end > 0 {
            let left = end - Date().timeIntervalSince1970 * 1000
            if left > 0 && left <= 5 * 60_000 { return (occ, showTitleNow) }
        }
        if let p = prevShow, Date().timeIntervalSince(p.at) < 45 * 60 { return (p.occId, p.title) }
        return nil
    }

    private func feedbackCard(_ t: (occId: String, title: String)) -> some View {
        VStack(spacing: 8) {
            Text("How was \(t.title)?").font(.system(size: 14, weight: .semibold)).foregroundColor(text).multilineTextAlignment(.center)
            if fbSent == t.occId {
                Text("Thanks! Your feedback goes to the host.").font(.system(size: 13)).foregroundColor(gold)
            } else {
                HStack(spacing: 6) {
                    ForEach(1...5, id: \.self) { n in
                        Button { fbStars = n } label: {
                            Image(systemName: n <= fbStars ? "star.fill" : "star").font(.system(size: 28)).foregroundColor(n <= fbStars ? gold : sub)
                        }.buttonStyle(.plain)
                    }
                }
                TextField("Anything the host should know? (optional)", text: $fbComment, axis: .vertical)
                    .lineLimit(1...3).font(.system(size: 14)).padding(10)
                    .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                Button("SEND FEEDBACK") {
                    Task {
                        if await model.sendFeedback(stars: fbStars, comment: fbComment, occId: t.occId, title: t.title) {
                            fbSent = t.occId; fbComment = ""; fbStars = 0
                        }
                    }
                }
                .font(BRFont.display(14)).kerning(2).foregroundColor(gold).disabled(fbStars == 0)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .brGlass(in: RoundedRectangle(cornerRadius: 16), tint: theme.glassTint(scheme))
    }

    var body: some View {
        VStack(spacing: 14) {
            if let occ = np?.occId, !occ.isEmpty, auth.isInvisible {
                Text("Reactions are off while Invisible mode is on.")
                    .font(.system(size: 12)).foregroundColor(sub).multilineTextAlignment(.center)
            } else if let occ = np?.occId, !occ.isEmpty {
                BRGlassGroup(spacing: 10) {
                    HStack(spacing: 10) {
                        ForEach(model.emojis, id: \.self) { e in
                            Button { Task { await model.react(e) } } label: {
                                Text(e).font(.system(size: 24)).frame(width: model.emojis.count > 5 ? 42 : 52, height: 44)
                                    .brGlass(in: Capsule(), interactive: true)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("React with \(e)")
                        }
                    }
                }
            }

            if let np, !np.title.isEmpty {
                starRow(label: "Rate this song", value: model.songStars) { n in
                    Task { await model.rateSong(n, title: np.title, artist: np.artist) }
                }
            }

            if auth.isSignedIn, let sk = model.skip, sk.eligible {
                VStack(spacing: 4) {
                    Button { Task { await model.askSkip() } } label: {
                        Label(sk.mine ? "You asked to skip" : "Skip this song", systemImage: "forward.fill")
                            .font(.system(size: 14, weight: .semibold)).foregroundColor(gold)
                            .padding(.horizontal, 18).padding(.vertical, 10)
                            .brGlass(in: Capsule(), interactive: true)
                    }
                    .buttonStyle(.plain).disabled(sk.mine)
                    Text("\(sk.votes) of \(sk.needed) needed. It skips when 90% of listeners ask.")
                        .font(.system(size: 11)).foregroundColor(sub)
                }
            }

            if let t = feedbackTarget {
                feedbackCard(t)
            } else if let r = rateable {
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
        .task(id: "\(songKey)|\(auth.isSignedIn)") {
            // Check the skip count every 10 seconds while a song from the auto DJ is playing.
            guard auth.isSignedIn, np?.isLive != true, np?.isShow != true else { model.skip = nil; return }
            while !Task.isCancelled { await model.loadSkip(); try? await Task.sleep(nanoseconds: 10_000_000_000) }
        }
        .onAppear { if np?.isShow == true, let o = np?.occId, !o.isEmpty { curShow = (o, showTitleNow) } }
        .onChange(of: np?.occId ?? "") { _, new in
            if let c = curShow, c.occId != new { prevShow = (c.occId, c.title, Date()); fbStars = 0; fbComment = "" }
            curShow = (np?.isShow == true && !new.isEmpty) ? (new, showTitleNow) : nil
        }
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
