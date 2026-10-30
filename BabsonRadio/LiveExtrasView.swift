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
nonisolated struct EmojiList: Decodable { let emojis: [String]; let top: [String]? }
/// An admin-made rule (Admin > Easter eggs on the website): while it matches, the reaction row changes.
nonisolated struct EggRule: Decodable {
    let artist: [String]; let title: [String]; let show: [String]; let emojis: [String]
    func matches(artist a: String, title t: String, show s: String) -> Bool {
        func hit(_ needles: [String], _ hay: String) -> Bool {
            let h = hay.lowercased()
            return !h.isEmpty && needles.contains { !$0.isEmpty && h.contains($0) }
        }
        return hit(artist, a) || hit(title, t) || hit(show, s)
    }
}
nonisolated struct EggList: Decodable { let eggs: [EggRule] }
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
    /// Their own most used first. The main screen shows the first 5; the drawer shows the whole row (up to 10).
    @Published var topEmojis: [String] = LiveExtrasModel.emojis
    private var pollRound = 0
    private var emojiOcc = ""

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
        // One reaction per 10 seconds goes to the server. Extra taps still rain on this screen only.
        guard Date().timeIntervalSince(lastSend) > 10 else { return }
        lastSend = Date()
        do { let _: EmptyResponse = try await BackendAPI.post("/api/live/reactions", ["emoji": emoji, "cid": String(cid)]) }
        catch { flash(error.localizedDescription) }
    }

    /// Check for other people's reactions every few seconds while the live screen is open.
    func pollLoop() async {
        while !Task.isCancelled {
            // About once a minute, and right away when a different show comes on (hosts can pick their own reactions).
            let occNow = AudioPlayerManager.shared.nowPlaying?.occId ?? ""
            if pollRound % 20 == 0 || occNow != emojiOcc { emojiOcc = occNow; await loadEmojis(); await loadEggs() }
            pollRound += 1
            if !AuthManager.shared.isInvisible { await pollOnce() }
            // 3s while reactions are flowing, 6s when quiet.
            try? await Task.sleep(nanoseconds: Date().timeIntervalSince(lastEventAt) < 30 ? 3_000_000_000 : 6_000_000_000)
        }
    }
    private var lastEventAt = Date()

    @Published var eggs: [EggRule] = []
    func loadEggs() async {
        if let r: EggList = try? await BackendAPI.get("/api/live/easter-eggs") { eggs = r.eggs }
    }

    /// Hold a key, pick another unlocked reaction: it takes that key's place and the server remembers the row.
    func swapKey(at index: Int, to emoji: String) async {
        var row = Array(topEmojis.prefix(5))
        guard index < row.count else { return }
        if let at = row.firstIndex(of: emoji) { row[at] = row[index] }
        row[index] = emoji
        topEmojis = row
        let _: EmptyResponse? = try? await BackendAPI.post("/api/live/emojis", ["slots": row])
    }

    func loadEmojis() async {
        guard AuthManager.shared.isSignedIn, let r: EmojiList = try? await BackendAPI.get("/api/live/emojis") else { return }
        emojis = r.emojis
        topEmojis = r.top ?? r.emojis
    }

    private func pollOnce() async {
        guard let occ = AudioPlayerManager.shared.nowPlaying?.occId, !occ.isEmpty else { return }
        if occ != pollOcc { pollOcc = occ; since = 0 }
        guard let feed: ReactionFeed = try? await BackendAPI.getPublic("/api/live/reactions"), feed.occId == occ else { return }
        let first = since == 0 // do not replay what happened before we opened the screen
        if !first { for ev in feed.events where ev.c != String(cid) && ev.at > since { rain(ev.e, count: 1, spread: 2.5); lastEventAt = Date() } }
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
        ReactionGlyph(emoji: drop.emoji, size: drop.size)
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
    @Environment(\.hwMode) private var hwm
    enum Mode { case reactions, rest, board, emojis, ratings }
    /// `.emojis` is just the emoji row (a second copy that does no polling of its own).
    /// `.board` is the emoji row plus the song rating, for the full screen board.
    /// `.reactions` is the emoji row that stays on the main screen; `.rest` is ratings and feedback, which live in the drawer.
    /// `.ratings` is just the star rows and the song links (the open foldable's ratings panel).
    var mode: Mode = .rest
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var model = LiveExtrasModel.shared
    @ObservedObject private var lab = TestLab.shared
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) private var scheme

    private var np: NowPlayingInfo? { audio.nowPlaying }

    /// The reactions change with the music through admin-made rules (Test Lab can force the Pittsburgh one).
    private var reactionRow: [String] {
        if lab.pittsburgh { return [":pgh-bridge:", ":pgh-helmet:", ":pgh-stadium:", ":pgh-heart:"] }
        if let n = np, let e = model.eggs.first(where: { $0.matches(artist: n.artist, title: n.title, show: n.showTitle ?? "") }) {
            return e.emojis
        }
        return mode == .reactions ? Array(model.topEmojis.prefix(5)) : model.emojis
    }

    @State private var swapIndex: Int? = nil
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
    private var ratingsOn: Bool { np?.ratingsOn != false }
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
        guard ratingsOn, auth.currentUser.map({ !$0.isGuest }) == true else { return nil }
        if let np, np.isShow == true, let occ = np.occId, !occ.isEmpty, let end = np.showEnd, end > 0 {
            let left = end - Date().timeIntervalSince1970 * 1000
            if left > 0 && left <= 5 * 60_000 { return (occ, showTitleNow) }
        }
        if let p = prevShow, Date().timeIntervalSince(p.at) < 45 * 60 { return (p.occId, p.title) }
        return nil
    }

    private func feedbackCard(_ t: (occId: String, title: String)) -> some View {
        VStack(spacing: 8) {
            Text("How was \(t.title)?").font(BRFont.body(14, .semibold)).foregroundColor(hwm.onPanelText).multilineTextAlignment(.center)
            if fbSent == t.occId {
                Text("Thanks for rating.").font(BRFont.body(13, .regular)).foregroundColor(gold)
            } else {
                HStack(spacing: 4) {
                    ForEach(1...5, id: \.self) { n in
                        Button { fbStars = n } label: { HWStar(filled: n <= fbStars, size: 30) }.buttonStyle(.plain)
                    }
                }
                Button("Send rating") {
                    Task {
                        if await model.sendFeedback(stars: fbStars, comment: "", occId: t.occId, title: t.title) {
                            fbSent = t.occId; fbComment = ""; fbStars = 0
                        }
                    }
                }
                .buttonStyle(HWKeyStyle())
                .disabled(fbStars == 0).opacity(fbStars == 0 ? 0.5 : 1)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black.opacity(0.35)))
    }

    /// The pick list for a held key: every reaction you have unlocked that is not already on the row.
    private var swapSheet: some View {
        let shown = Set(reactionRow.prefix(4))
        let choices = model.emojis.filter { !shown.contains($0) }
        return VStack(spacing: 14) {
            Text("Swap for").font(BRFont.body(17, .regular)).foregroundColor(.white)
            if choices.isEmpty {
                Text("No other reactions unlocked yet.").font(BRFont.body(14, .regular)).foregroundColor(.white.opacity(0.8))
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 12) {
                    ForEach(choices, id: \.self) { c in
                        Button {
                            let i = swapIndex; swapIndex = nil
                            if let i { Task { await model.swapKey(at: i, to: c) } }
                        } label: { ReactionGlyph(emoji: c, size: 23).frame(maxWidth: .infinity) }
                        .buttonStyle(HWKeyStyle(corner: 10, lit: false, height: 44))
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(HWDesk())
        .presentationDetents([.height(240), .medium])
    }

    var body: some View {
        VStack(spacing: 14) {
            if mode != .rest, mode != .ratings, let occ = np?.occId, !occ.isEmpty, auth.isInvisible {
                Text("Reactions are off in Invisible mode.")
                    .font(BRFont.body(12, .regular)).foregroundColor(sub).multilineTextAlignment(.center)
            } else if mode != .rest, mode != .ratings, let occ = np?.occId, !occ.isEmpty {
                // Steel keys. On the amp panel: four 60 x 44 keys. In the drawer and on the board: a grid of 38 pt keys, five across.
                let panel = mode == .reactions
                let list = panel ? Array(reactionRow.prefix(4)) : reactionRow
                let perRow = panel ? 4 : 5
                let rows = stride(from: 0, to: list.count, by: perRow).map { Array(list[$0..<min($0 + perRow, list.count)]) }
                VStack(spacing: panel ? 0 : 12) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        HStack(spacing: panel ? 0 : 8) {
                            ForEach(row, id: \.self) { e in
                                if panel { Spacer(minLength: 0) }
                                Button { Task { await model.react(e) } } label: {
                                    ReactionGlyph(emoji: e, size: panel ? 23 : 21)
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(HWKeyStyle(corner: panel ? 12 : 10, lit: false, height: panel ? 44 : 38))
                                .frame(width: panel ? 60 : nil)
                                // Hold a key to swap it for another reaction you have unlocked.
                                .highPriorityGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in
                                    if panel, !lab.pittsburgh, Array(reactionRow.prefix(4)) == Array(model.topEmojis.prefix(4)), let i = reactionRow.prefix(4).firstIndex(of: e) { swapIndex = i }
                                })
                                .accessibilityLabel(e.hasPrefix(":pgh-") ? "React" : "React with \(e). Hold to swap.")
                                if panel { Spacer(minLength: 0) }
                            }
                        }
                        .padding(.bottom, panel ? 0 : 4)
                    }
                }
            }

            if mode == .rest || mode == .board || mode == .ratings {
            if ratingsOn, let np, !np.title.isEmpty, np.showOnly != true {
                    starRow(label: "Rate this song", value: model.songStars) { n in
                        Task { await model.rateSong(n, title: np.title, artist: np.artist) }
                    }
                }
                if ratingsOn, let r = rateable {
                    starRow(label: "Rate this show", value: model.showStars) { n in
                        Task { await model.rateShow(n, occId: r.occId, title: r.title) }
                    }
                }
                // Hidden while someone is live: a live show has no song info to look up (same as the website).
                if let np, !np.title.isEmpty, np.showOnly != true, np.isLive != true {
                    SongLinksRow(title: np.title, artist: np.artist)
                }
    
                if mode == .rest, let t = feedbackTarget {
                    feedbackCard(t)
                }
            }

            if mode != .rest, !model.message.isEmpty {
                Text(model.message).font(BRFont.body(12, .semibold)).foregroundColor(Color(hex: "FFD9A0")).multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 24)
        .sheet(isPresented: Binding(get: { swapIndex != nil }, set: { if !$0 { swapIndex = nil } })) { swapSheet }
        // The data loading rides on an always-present empty view (tasks on an empty container never run).
        .background(
            Color.clear.frame(width: 1, height: 1)
                .task { if mode == .reactions { await model.pollLoop() } }
                .task(id: songKey) { if mode == .reactions { await model.loadSongStars(title: np?.title ?? "", artist: np?.artist ?? "") } }
                .task(id: np?.occId ?? "") { if mode == .reactions { await model.loadShowStars(occId: np?.occId ?? "") } }
        )
        .onAppear { if np?.isShow == true, let o = np?.occId, !o.isEmpty { curShow = (o, showTitleNow) } }
        .onChange(of: np?.occId ?? "") { _, new in
            if let c = curShow, c.occId != new { prevShow = (c.occId, c.title, Date()); fbStars = 0; fbComment = "" }
            curShow = (np?.isShow == true && !new.isEmpty) ? (new, showTitleNow) : nil
        }
    }

    private func starRow(label: String, value: Int, set: @escaping (Int) -> Void) -> some View {
        HStack {
            Text(label).font(BRFont.body(13, .semibold)).foregroundColor(hwm.onPanelSub).lineLimit(1)
            Spacer(minLength: 8)
            HStack(spacing: 2) {
                ForEach(1...5, id: \.self) { n in
                    Button { set(n) } label: { HWStar(filled: n <= value, size: 24) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(n) star\(n == 1 ? "" : "s")")
                }
            }
        }
    }
}


/// "Find this song" keys: plain search links, so there is no account or key to keep up. Same links as the website.
struct SongLinksRow: View {
    let title: String
    let artist: String
    @Environment(\.openURL) private var openURL

    private var q: String { enc([title, artist].filter { !$0.isEmpty }.joined(separator: " ")) }

    var body: some View {
        HStack(spacing: 12) {
            key("Apple Music", "https://music.apple.com/us/search?term=\(q)")
            key("Spotify", "https://open.spotify.com/search/\(q)")
        }
    }

    private func key(_ label: String, _ url: String) -> some View {
        Button { if let u = URL(string: url) { openURL(u) } } label: {
            Text(label).font(BRFont.body(12, .semibold)).frame(maxWidth: .infinity)
        }
        .buttonStyle(HWKeyStyle(corner: 14, lit: false, height: 28))
    }
}


/// A reaction, drawn: normal emoji as text, the beaver logo (":br:") as the logo image.
struct ReactionGlyph: View {
    let emoji: String
    let size: CGFloat
    var body: some View {
        if emoji == ":br:" {
            Image("LaunchLogo").resizable().scaledToFit().frame(height: size * 1.15)
        } else if emoji.hasPrefix(":pgh-"), emoji.hasSuffix(":") {
            let kind = String(emoji.dropFirst(5).dropLast())
            if ["bridge", "helmet", "stadium", "heart"].contains(kind) {
                Image("Pgh" + kind.capitalized).resizable().scaledToFit().frame(height: size * 1.2)
            } else {
                PittsburghGlyph(kind: kind, size: size * 1.2)
            }
        } else {
            Text(emoji).font(.system(size: size))
        }
    }
}


// MARK: - Pittsburgh reactions

/// Our own simple drawings for the Pittsburgh reaction set (the same artwork as the website's public/pgh/*.svg): a yellow bridge,
/// a black and gold football helmet, a black and gold pirate flag and a red heart. Drawn in a 64 by 64 box. Not team logos.
struct PittsburghGlyph: View {
    let kind: String
    let size: CGFloat
    private static let gold = Color(red: 0.99, green: 0.72, blue: 0.15)
    private static let ink = Color(red: 0.105, green: 0.105, blue: 0.105)

    var body: some View {
        Canvas { ctx, sz in
            let k = sz.width / 64
            ctx.scaleBy(x: k, y: k)
            let gold = Self.gold, ink = Self.ink
            func stroke(_ path: Path, _ w: CGFloat, _ c: Color) {
                ctx.stroke(path, with: .color(c), style: StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round))
            }
            func seg(_ a: CGPoint, _ b: CGPoint) -> Path { var p = Path(); p.move(to: a); p.addLine(to: b); return p }
            switch kind {
            case "bridge":
                stroke(seg(CGPoint(x: 4, y: 40), CGPoint(x: 60, y: 40)), 3.5, gold)
                stroke(seg(CGPoint(x: 18, y: 12), CGPoint(x: 18, y: 40)), 4, gold)
                stroke(seg(CGPoint(x: 46, y: 12), CGPoint(x: 46, y: 40)), 4, gold)
                var cables = Path()
                cables.move(to: CGPoint(x: 4, y: 38)); cables.addQuadCurve(to: CGPoint(x: 18, y: 14), control: CGPoint(x: 11, y: 24))
                cables.move(to: CGPoint(x: 18, y: 14)); cables.addQuadCurve(to: CGPoint(x: 46, y: 14), control: CGPoint(x: 32, y: 40))
                cables.move(to: CGPoint(x: 46, y: 14)); cables.addQuadCurve(to: CGPoint(x: 60, y: 38), control: CGPoint(x: 53, y: 24))
                stroke(cables, 2.5, gold)
                for (x, y) in [(24.0, 23.0), (28.0, 26.0), (32.0, 27.0), (36.0, 26.0), (40.0, 23.0)] {
                    stroke(seg(CGPoint(x: x, y: y), CGPoint(x: x, y: 40)), 1.6, gold)
                }
                var water = Path()
                water.move(to: CGPoint(x: 6, y: 52))
                water.addQuadCurve(to: CGPoint(x: 18, y: 52), control: CGPoint(x: 12, y: 48))
                water.addQuadCurve(to: CGPoint(x: 30, y: 52), control: CGPoint(x: 24, y: 56))
                water.addQuadCurve(to: CGPoint(x: 42, y: 52), control: CGPoint(x: 36, y: 48))
                water.addQuadCurve(to: CGPoint(x: 54, y: 52), control: CGPoint(x: 48, y: 56))
                stroke(water, 2.5, gold.opacity(0.55))
            case "helmet":
                var shell = Path()
                shell.move(to: CGPoint(x: 10, y: 38))
                shell.addCurve(to: CGPoint(x: 37, y: 11), control1: CGPoint(x: 8, y: 20), control2: CGPoint(x: 22, y: 9))
                shell.addCurve(to: CGPoint(x: 54, y: 38), control1: CGPoint(x: 50, y: 13), control2: CGPoint(x: 56, y: 25))
                shell.addLine(to: CGPoint(x: 45, y: 42)); shell.addLine(to: CGPoint(x: 39, y: 47)); shell.addLine(to: CGPoint(x: 20, y: 47))
                shell.addCurve(to: CGPoint(x: 10, y: 38), control1: CGPoint(x: 14, y: 47), control2: CGPoint(x: 10, y: 43))
                shell.closeSubpath()
                ctx.fill(shell, with: .color(ink))
                var stripe = Path()
                stripe.move(to: CGPoint(x: 22, y: 14))
                stripe.addCurve(to: CGPoint(x: 50, y: 23), control1: CGPoint(x: 32, y: 7), control2: CGPoint(x: 46, y: 12))
                stroke(stripe, 3.5, gold)
                ctx.fill(Path(ellipseIn: CGRect(x: 26, y: 32, width: 6, height: 6)), with: .color(gold))
                let mask = Color(red: 0.79, green: 0.8, blue: 0.82)
                stroke(seg(CGPoint(x: 40, y: 40), CGPoint(x: 58, y: 40)), 2.4, mask)
                stroke(seg(CGPoint(x: 41, y: 46), CGPoint(x: 56, y: 46)), 2.4, mask)
                stroke(seg(CGPoint(x: 52, y: 36), CGPoint(x: 52, y: 50)), 2.4, mask)
            case "pirate":
                var flag = Path()
                flag.move(to: CGPoint(x: 6, y: 12))
                flag.addQuadCurve(to: CGPoint(x: 32, y: 12), control: CGPoint(x: 20, y: 6))
                flag.addQuadCurve(to: CGPoint(x: 58, y: 12), control: CGPoint(x: 44, y: 18))
                flag.addLine(to: CGPoint(x: 58, y: 50))
                flag.addQuadCurve(to: CGPoint(x: 32, y: 50), control: CGPoint(x: 44, y: 56))
                flag.addQuadCurve(to: CGPoint(x: 6, y: 50), control: CGPoint(x: 20, y: 44))
                flag.closeSubpath()
                ctx.fill(flag, with: .color(ink))
                ctx.fill(Path(ellipseIn: CGRect(x: 23, y: 17, width: 18, height: 18)), with: .color(.white))
                ctx.fill(Path(roundedRect: CGRect(x: 27, y: 32, width: 10, height: 7), cornerRadius: 2), with: .color(.white))
                ctx.fill(Path(ellipseIn: CGRect(x: 26.1, y: 23.6, width: 4.8, height: 4.8)), with: .color(ink))
                ctx.fill(Path(ellipseIn: CGRect(x: 33.1, y: 23.6, width: 4.8, height: 4.8)), with: .color(ink))
                stroke(seg(CGPoint(x: 16, y: 39), CGPoint(x: 48, y: 48)), 3.4, .white)
                stroke(seg(CGPoint(x: 48, y: 39), CGPoint(x: 16, y: 48)), 3.4, .white)
            default: // heart
                var h = Path()
                h.move(to: CGPoint(x: 32, y: 56))
                h.addCurve(to: CGPoint(x: 17, y: 14), control1: CGPoint(x: 8, y: 40), control2: CGPoint(x: 6, y: 22))
                h.addCurve(to: CGPoint(x: 32, y: 19), control1: CGPoint(x: 25, y: 9), control2: CGPoint(x: 31, y: 13))
                h.addCurve(to: CGPoint(x: 47, y: 14), control1: CGPoint(x: 33, y: 13), control2: CGPoint(x: 39, y: 9))
                h.addCurve(to: CGPoint(x: 32, y: 56), control1: CGPoint(x: 58, y: 22), control2: CGPoint(x: 56, y: 40))
                h.closeSubpath()
                ctx.fill(h, with: .color(Color(red: 0.84, green: 0.15, blue: 0.24)))
                var shine = Path()
                shine.move(to: CGPoint(x: 17, y: 22))
                shine.addCurve(to: CGPoint(x: 25, y: 17), control1: CGPoint(x: 18, y: 18), control2: CGPoint(x: 21, y: 16))
                stroke(shine, 3, Color.white.opacity(0.5))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}


// MARK: - Reaction keys (board)

/// A row of steel reaction keys at any size, with the same rules as the main row: the person's most used first, an admin easter-egg
/// set while it matches the song or show, and the Pittsburgh set in the test lab. No polling here; the Live screen already does that.
struct ReactionKeys: View {
    @Environment(\.hwMode) private var hwm
    var count = 4
    var keyW: CGFloat = 60
    var keyH: CGFloat = 44
    var glyph: CGFloat = 23
    var corner: CGFloat = 12
    @ObservedObject private var model = LiveExtrasModel.shared
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var lab = TestLab.shared
    @ObservedObject private var auth = AuthManager.shared

    private var row: [String] {
        let list: [String]
        if lab.pittsburgh { list = [":pgh-bridge:", ":pgh-helmet:", ":pgh-stadium:", ":pgh-heart:"] }
        else if let n = audio.nowPlaying, let e = model.eggs.first(where: { $0.matches(artist: n.artist, title: n.title, show: n.showTitle ?? "") }) { list = e.emojis }
        else { list = model.topEmojis }
        return Array(list.prefix(count))
    }

    var body: some View {
        if auth.isInvisible {
            Text("Reactions are off in Invisible mode.").font(BRFont.body(12)).foregroundStyle(hwm.onPanelSub)
        } else {
            HStack(spacing: 0) {
                ForEach(row, id: \.self) { e in
                    Spacer(minLength: 0)
                    Button { Task { await model.react(e) } } label: {
                        ReactionGlyph(emoji: e, size: glyph).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(HWKeyStyle(corner: corner, lit: false, height: keyH))
                    .frame(width: keyW)
                    .accessibilityLabel(e.hasPrefix(":pgh-") ? "React" : "React with \(e)")
                    Spacer(minLength: 0)
                }
            }
        }
    }
}
