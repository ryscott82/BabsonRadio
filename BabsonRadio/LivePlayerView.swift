import SwiftUI
import MediaPlayer

// MARK: - Live Player Screen

struct LivePlayerView: View {
    @StateObject private var audio = AudioPlayerManager.shared
    @StateObject private var auth = AuthManager.shared
    @ObservedObject private var presence = PresenceManager.shared
    @ObservedObject private var theme = ArtTheme.shared
    @Environment(\.colorScheme) var scheme
    @State private var showProfileSheet = false
    @State private var showVote = false
    @State private var drawerOpen = false
    @Environment(\.verticalSizeClass) private var vSize

    /// Signed-out visitors can preview the stream.
    private var canPlay: Bool { auth.canListenLive || !auth.isSignedIn }

    /// The on-air event's color, or the station gold/green.
    private var accent: Color {
        if ArtTheme.full(scheme), let hex = audio.nowPlaying?.color, !hex.isEmpty { return Color(hex: hex) }
        return theme.accent(scheme)
    }

    /// Visualizer color: the show's color when there is one, else the cover's main color.
    private var glowColor: Color {
        if ArtTheme.full(scheme), let hex = audio.nowPlaying?.color, !hex.isEmpty { return Color(hex: hex) }
        return theme.glow(scheme)
    }

    var body: some View {
        GeometryReader { geo in
            let top = geo.safeAreaInsets.top
            let small = geo.size.height < 700
            // Everything the listener needs fits on one screen. The cover takes whatever height is left over.
            let reserved: CGFloat = top + (small ? 410 : 470)
            let side = max(120, min(geo.size.width - 72, geo.size.height - reserved))
            let drawerH = min(geo.size.height * 0.72, 560)
            ZStack(alignment: .bottom) {
                VStack(spacing: 0) {
                    if let a = audio.nowPlaying?.announcement, !a.text.isEmpty {
                        Text(a.text)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                            .multilineTextAlignment(.center).lineLimit(2)
                            .padding(8)
                            .frame(maxWidth: .infinity)
                            .brGlass(in: RoundedRectangle(cornerRadius: 14), tint: accent.opacity(0.3), fallback: accent.opacity(0.18))
                            .padding(.horizontal, 20)
                            .padding(.top, top + 4)
                    }

                    headerRow(topInset: top)
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                        .padding(.bottom, 10)

                    PlayerArtCard()
                        .frame(width: 340, height: 340)
                        .scaleEffect(side / 340)
                        .frame(width: side, height: side)

                    nowPlayingInfo
                        .padding(.horizontal, 24)
                        .padding(.top, 12)

                    playRow
                        .padding(.top, 12)

                    // Volume under the transport buttons, like Apple Music: quiet speaker, slider, loud speaker.
                    volumeRow
                        .padding(.horizontal, 36)
                        .padding(.top, 6)

                    // Reactions always stay on the main screen.
                    LiveExtrasView(mode: .reactions)
                        .padding(.top, 8)

                    if !auth.isSignedIn {
                        Text("Previewing the live stream. Sign in from the Profile tab for reminders, friends and more.")
                            .font(.system(size: 11))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .multilineTextAlignment(.center).lineLimit(2)
                            .padding(.horizontal, 32)
                            .padding(.top, 6)
                    } else if !auth.canListenLive {
                        Text(lockedMessage)
                            .font(.system(size: 11))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                            .multilineTextAlignment(.center).lineLimit(2)
                            .padding(.horizontal, 32)
                            .padding(.top, 6)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.bottom, LiveDrawer<EmptyView>.handleHeight)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .top)

                // Everything else lives in a drawer you pull up.
                LiveDrawer(open: $drawerOpen, height: drawerH, tint: accent) {
                    VStack(spacing: 18) {
                        if let note = audio.nowPlaying?.note, !(note.headline.isEmpty && note.message.isEmpty) {
                            VStack(spacing: 4) {
                                if !note.headline.isEmpty { Text(note.headline).font(.system(size: 14, weight: .bold)) }
                                if !note.message.isEmpty { Text(note.message).font(.system(size: 13)) }
                            }
                            .multilineTextAlignment(.center)
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                            .padding(12).frame(maxWidth: .infinity)
                            .brGlass(in: RoundedRectangle(cornerRadius: 16), tint: accent.opacity(0.25), fallback: accent.opacity(0.15))
                            .padding(.horizontal, 24)
                        }
                        if !presence.groups.isEmpty {
                            VStack(spacing: 4) {
                                ForEach(presence.groups.prefix(3)) { g in
                                    Text(g.text).font(.system(size: 12, weight: .semibold)).foregroundColor(accent)
                                }
                            }
                        }
                        LiveExtrasView(mode: .rest)
                        if auth.isSignedIn && auth.canListenLive {
                            Button { showVote = true } label: {
                                Label("What would you like to hear?", systemImage: "hand.thumbsup")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(accent)
                                    .padding(.horizontal, 18).padding(.vertical, 12)
                                    .brGlass(in: Capsule(), tint: accent.opacity(0.25), fallback: accent.opacity(0.14))
                            }
                            .buttonStyle(.plain)
                        }
                        communitySection
                            .padding(.bottom, 24)
                    }
                    .padding(.top, 8)
                }
            }
            .overlay(alignment: .bottom) {
                // Carry the lip's color down to the tab bar so there is no gap under the closed shelf.
                if !drawerOpen {
                    Rectangle()
                        .fill(theme.lipDeep)
                        .frame(height: geo.safeAreaInsets.bottom + 1)
                        .offset(y: geo.safeAreaInsets.bottom)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                }
            }
            .mask(Rectangle().padding(.bottom, -geo.safeAreaInsets.bottom))
            .background {
                ZStack {
                    (scheme == .dark ? Color.brDkBg : Color.brLtBg)
                    theme.wash(scheme)
                    LiveVisualizer(color: glowColor, playing: audio.isPlaying, beat: audio.beatClock)
                }
                .ignoresSafeArea()
            }
            .ignoresSafeArea(edges: .top)
        }
        .overlay { EmojiRainOverlay() }
#if os(iOS)
        // Turned sideways on an iPhone: a clean full screen board with just the music, like the website's full screen mode.
        .overlay {
            if vSize == .compact {
                LiveBoardView(canPlay: canPlay, glow: glowColor).transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: vSize == .compact)
        .toolbar(vSize == .compact ? .hidden : .visible, for: .tabBar)
#endif
        .alert("Enjoying Babson Radio?", isPresented: $audio.showSignInPrompt) {
            Button("Create account or sign in") { showProfileSheet = true }
            Button("Keep listening", role: .cancel) {}
        } message: {
            Text("Create a free account to get show reminders and see who is tuned in. The music keeps playing.")
        }
        .sheet(isPresented: $showProfileSheet) { ProfileView() }
        .sheet(isPresented: $showVote) { VoteView() }
        .onAppear { audio.startPolling(); ArtTheme.shared.start() }
        .onDisappear { audio.stopPolling() }
    }

    // MARK: - Sub-views

    private func headerRow(topInset: CGFloat) -> some View {
        HStack {
            // Logo wordmark
            VStack(alignment: .leading, spacing: 0) {
                Text("BABSON")
                    .font(BRFont.display(13))
                    .foregroundColor(theme.accent(scheme))
                    .kerning(4)
                Text("RADIO")
                    .font(BRFont.display(26))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    .kerning(4)
            }

            Spacer()

            // ON AIR badge (visible when playing)
            if audio.isPlaying {
                OnAirBadge()
                    .transition(.scale.combined(with: .opacity))
            }

            ProfileCircleButton()
        }
        .animation(.easeInOut(duration: 0.25), value: audio.isPlaying)
        .padding(.top, topInset)
    }

    private var nowPlayingInfo: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                BRTagChip(text: audio.nowPlaying?.isLive == true ? "LIVE DJ" : "LIVE", style: .gold)
                BRTagChip(text: {
                    let t = audio.nowPlaying?.showTitle ?? ""
                    let b = audio.nowPlaying?.blockTitle ?? ""
                    return (t.isEmpty ? (b.isEmpty ? "BABSON RADIO" : b) : t).uppercased()
                }(), style: .subtle)
                Spacer()
            }

            let song = audio.nowPlaying.flatMap { $0.title.isEmpty ? nil : $0 }
            // Short title and artist share one line; long ones drop to two.
            let titleText = song?.title ?? "Babson Radio"
            let artistText = song.map { $0.artist.isEmpty ? "Babson Radio" : $0.artist } ?? "Live Stream"
            let titleFont = BRFont.display(song == nil ? 30 : 26)
            let titleColor: Color = scheme == .dark ? .brDkText : .brLtText
            let artistColor: Color = scheme == .dark ? .brDkSub : .brLtSub
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(titleText).font(titleFont).foregroundColor(titleColor).kerning(1).lineLimit(1).fixedSize()
                    Text(artistText).font(.system(size: 14, weight: .medium)).foregroundColor(artistColor).lineLimit(1).fixedSize()
                    Spacer(minLength: 0)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(titleText).font(titleFont).foregroundColor(titleColor).kerning(1).lineLimit(1).minimumScaleFactor(0.65)
                    Text(artistText).font(.system(size: 14, weight: .medium)).foregroundColor(artistColor).lineLimit(1)
                }
            }

            if let title = audio.nowPlaying?.showTitle, !title.isEmpty {
                Text("On air: \(title)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(accent)
            }

            if let note = audio.nowPlaying?.note, !(note.headline.isEmpty && note.message.isEmpty) {
                Text(note.headline.isEmpty ? note.message : note.headline)
                    .font(.system(size: 12, weight: .semibold)).foregroundColor(accent).lineLimit(1)
            }

            if let song, song.isLive, !song.streamer.isEmpty {
                Text("Live with \(song.streamer)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.accent(scheme))
            }

            if let song, song.duration > 0 {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    let t = song.elapsed + ctx.date.timeIntervalSince(audio.nowPlayingFetchedAt)
                    ProgressView(value: min(max(t / song.duration, 0), 1))
                        .tint(theme.accent(scheme))
                        .padding(.top, 6)
                }
            }

            if let next = audio.nowPlaying?.next {
                Text("Next: \(next.title)\(next.artist.isEmpty ? "" : " · \(next.artist)")")
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    .lineLimit(1)
            }
        }
    }

    private var lockedMessage: String {
        guard auth.isSignedIn, let u = auth.currentUser else {
            return "Sign in from the Profile tab to listen — or start a free 3-day guest trial."
        }
        return u.isGuest
            ? "Your guest access has ended. Ask a Babson student to sponsor you from the Profile tab."
            : "Listening isn't available right now."
    }

    /// Equalizer on the left while playing, play/stop in the middle, skip on the right (same as the website).
    private var playRow: some View {
        HStack(alignment: .top, spacing: 16) {
            ZStack(alignment: .trailing) {
                Color.clear
                if audio.isPlaying { EqualizerBars(color: theme.accent(scheme)) }
            }
            .frame(maxWidth: .infinity).frame(height: 72)
            playControl.opacity(canPlay ? 1 : 0.4)
            HStack { SkipControl().padding(.top, 12); Spacer(minLength: 0) }
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: 320)
    }

    private var playControl: some View {
        Button(action: { if canPlay { audio.toggle() } }) {
            ZStack {
                let base = theme.button(scheme)
                Color.clear
                    .frame(width: 72, height: 72)
                    .brGlass(in: Circle(), tint: base.opacity(0.75), interactive: true, fallback: base.opacity(0.9))
                    .shadow(color: base.opacity(0.35), radius: 16, x: 0, y: 6)

                if audio.isBuffering {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: scheme == .dark ? .brDkBg : .white))
                        .scaleEffect(1.2)
                } else {
                    Image(systemName: audio.isPlaying ? "stop.fill" : "play.fill")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                        .offset(x: audio.isPlaying ? 0 : 2)
                }
            }
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.15), value: audio.isPlaying)
    }

    private var volumeRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "speaker.fill")
                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                .font(.system(size: 13))

#if os(iOS)
            // Real system volume (same level as the hardware buttons)
            SystemVolumeSlider(tint: theme.accent(scheme))
                .frame(height: 34)
#else
            Capsule()
                .fill(scheme == .dark ? Color.brDkBorder : Color.brLtBorder)
                .frame(height: 3)
#endif

            Image(systemName: "speaker.wave.3.fill")
                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                .font(.system(size: 13))
        }
    }

    // ── Join / community links ──────────────────────────────
    private var communitySection: some View {
        VStack(spacing: 14) {
            Link(destination: BabsonLinks.join) {
                HStack(spacing: 8) {
                    Spacer()
                    Image(systemName: "person.badge.plus")
                    Text("JOIN BABSON SOUND")
                        .font(BRFont.display(15))
                        .kerning(2)
                    Spacer()
                }
                .padding(.vertical, 14)
                .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                .brGlass(in: RoundedRectangle(cornerRadius: 14), tint: theme.button(scheme), interactive: true, fallback: theme.button(scheme))
            }

            if auth.isTester {
            ShareLink(item: BabsonLinks.interest,
                      subject: Text("Babson Radio"),
                      message: Text("Student radio is coming back to Babson. Tell them what you want to hear:")) {
                HStack(spacing: 8) {
                    Spacer()
                    Image(systemName: "square.and.arrow.up")
                    Text("SHARE THE FORM")
                        .font(BRFont.display(15))
                        .kerning(2)
                    Spacer()
                }
                .padding(.vertical, 14)
                .foregroundColor(theme.accent(scheme))
                .brGlass(in: RoundedRectangle(cornerRadius: 14), interactive: true)
            }
            }

            HStack(spacing: 22) {
                Link("Privacy", destination: BabsonLinks.privacy)
                if let ig = BabsonLinks.instagram {
                    Link(destination: ig) {
                        HStack(spacing: 5) { Image(systemName: "camera"); Text("Instagram") }
                    }
                }
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(theme.accent(scheme))
        }
        .padding(.horizontal, 24)
    }

}

// MARK: - Player Art Card

struct PlayerArtCard: View {
    @Environment(\.colorScheme) var scheme
    @ObservedObject private var audio = AudioPlayerManager.shared

    private var tint: Color? {
        if let hex = audio.nowPlaying?.color, !hex.isEmpty { return Color(hex: hex) }
        return nil
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {

            // Base: near-black gradient
            RoundedRectangle(cornerRadius: 20)
                .fill(
                    LinearGradient(
                        colors: tint.map { [$0.opacity(0.7), Color(hex: "080808")] }
                            ?? (scheme == .dark
                                ? [Color(hex: "0C1A13"), Color(hex: "080808")]
                                : [Color(hex: "1A2E22"), Color(hex: "0A1A10")]),
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .aspectRatio(1, contentMode: .fit)

            // Grain texture via canvas noise
            GrainOverlay()
                .clipShape(RoundedRectangle(cornerRadius: 20))

            // Subtle scanlines
            ScanlinesOverlay()
                .clipShape(RoundedRectangle(cornerRadius: 20))

            // Green glow orb (top-right)
            Circle()
                .fill((tint ?? Color.brGreen).opacity(0.25))
                .frame(width: 220, height: 220)
                .blur(radius: 60)
                .offset(x: 60, y: -60)

            // Gold horizontal stripe near bottom
            VStack {
                Spacer()
                Rectangle()
                    .fill(Color.brGold.opacity(0.5))
                    .frame(height: 1)
                    .padding(.bottom, 52)
            }

            // Station wordmark centered
            VStack(spacing: 4) {
                Spacer()
                HStack { Spacer()
                    VStack(spacing: 0) {
                        Text("BABSON")
                            .font(BRFont.display(18))
                            .foregroundColor(Color.brGold.opacity(0.9))
                            .kerning(6)
                        Text("RADIO")
                            .font(BRFont.display(52))
                            .foregroundColor(.white.opacity(0.92))
                            .kerning(8)
                    }
                    Spacer()
                }
                Spacer()
            }

            // Album art for the current song (covers the wordmark when there is one)
            if let art = audio.nowPlaying?.art, !art.isEmpty, let url = URL(string: art) {
                Color.clear
                    .aspectRatio(1, contentMode: .fit)
                    .overlay(
                        AsyncImage(url: url) { phase in
                            if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                        }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 20))
            }

            // Bottom-left: indicator light + freq label
            HStack(spacing: 8) {
                // Green indicator LED
                ZStack {
                    Circle()
                        .fill(Color.brGreen)
                        .frame(width: 8, height: 8)
                    Circle()
                        .fill(Color.brGreen.opacity(0.3))
                        .frame(width: 16, height: 16)
                }

                Text("INTERNET RADIO")
                    .font(BRFont.display(10))
                    .foregroundColor(Color.white.opacity(0.45))
                    .kerning(2.5)
            }
            .padding(18)
        }
        .shadow(color: Color.black.opacity(0.55), radius: 24, x: 0, y: 10)
    }
}

// MARK: - Grain Overlay (canvas noise)

struct GrainOverlay: View {
    var body: some View {
        Canvas { context, size in
            let tileSize: CGFloat = 1.5
            let cols = Int(size.width / tileSize)
            let rows = Int(size.height / tileSize)

            for row in 0..<rows {
                for col in 0..<cols {
                    // Simple deterministic noise from position
                    let seed = Double((row &* 1009) &+ (col &* 409))
                    let noise = (sin(seed * 0.7312) * 0.5 + 0.5)
                    if noise > 0.72 {
                        let alpha = (noise - 0.72) * 0.55
                        context.fill(
                            Path(CGRect(
                                x: CGFloat(col) * tileSize,
                                y: CGFloat(row) * tileSize,
                                width: tileSize,
                                height: tileSize
                            )),
                            with: .color(.white.opacity(alpha))
                        )
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .opacity(0.4)
    }
}

// MARK: - Scanlines Overlay

struct ScanlinesOverlay: View {
    var body: some View {
        Canvas { context, size in
            var y: CGFloat = 0
            while y < size.height {
                context.fill(
                    Path(CGRect(x: 0, y: y, width: size.width, height: 1)),
                    with: .color(.black.opacity(0.12))
                )
                y += 3
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Schedule Row

struct ScheduleRow: View {
    let item: ScheduleItem
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(spacing: 14) {
            // Time
            Text(item.time)
                .font(BRFont.display(14))
                .foregroundColor(item.isLive
                    ? (scheme == .dark ? .brGold : .brGreen)
                    : (scheme == .dark ? .brDkSub : .brLtSub))
                .kerning(0.5)
                .frame(width: 68, alignment: .leading)

            // Live indicator dot
            if item.isLive {
                Circle()
                    .fill(Color.brRed)
                    .frame(width: 6, height: 6)
            } else {
                Circle()
                    .fill(Color.clear)
                    .frame(width: 6, height: 6)
            }

            // Show name + host
            VStack(alignment: .leading, spacing: 2) {
                Text(item.showName)
                    .font(.system(size: 15, weight: item.isLive ? .semibold : .regular))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text(item.host)
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }

            Spacer()

            if item.isLive {
                OnAirBadge()
                    .scaleEffect(0.85)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(item.isLive
            ? (scheme == .dark ? Color.brGreen.opacity(0.07) : Color.brGreen.opacity(0.05))
            : Color.clear)
    }
}

#Preview {
    LivePlayerView()
}


#if os(iOS)
// MARK: - System volume slider
// MPVolumeView is Apple's supported control for device volume. It stays in sync with the
// hardware buttons and Control Center. NOTE: it does not render in the iOS Simulator.

struct SystemVolumeSlider: UIViewRepresentable {
    var tint: Color

    func makeUIView(context: Context) -> MPVolumeView {
        let v = MPVolumeView(frame: .zero)
        v.showsVolumeSlider = true
        v.tintColor = UIColor(tint)
        return v
    }

    func updateUIView(_ view: MPVolumeView, context: Context) {
        view.tintColor = UIColor(tint)
    }
}
#endif


// MARK: - Animated background

/// Soft ribbons and glowing orbs that swell with a steady beat, tinted with `color`.
/// Decorative (not driven by the audio). Switches to a still gradient in Low Power Mode,
/// with Reduce Motion on, or while the app is in the background.
struct LiveVisualizer: View {
    let color: Color
    let playing: Bool
    /// When set, the pulse follows the song's real tempo; otherwise a steady 118 BPM.
    var beat: BeatClock? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
    @State private var changedAt = Date.distantPast
    @State private var wasPlaying = false

    /// Tune these two to taste. Higher softness = blurrier, lower strength = fainter.
    private static let softness: CGFloat = 14
    private static let strength: Double = 0.9

    private var animated: Bool { !lowPower && !reduceMotion && scenePhase == .active }

    var body: some View {
        Group {
            if animated {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
                    let c = color, p = playing, was = wasPlaying, at = changedAt, bc = beat
                    Canvas { ctx, size in LiveVisualizer.draw(&ctx, size, tl.date, c, p, was, at, bc) }
                }
            } else {
                LinearGradient(colors: [color.opacity(0.28), color.opacity(0.05), .clear],
                               startPoint: .top, endPoint: .bottom)
            }
        }
        .blur(radius: Self.softness)
        .opacity(Self.strength)
        .allowsHitTesting(false)
        .onAppear { wasPlaying = playing }
        .onChange(of: playing) { _, now in wasPlaying = !now; changedAt = Date() }
        .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange)) { _ in
            lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        }
    }

    nonisolated private static func draw(_ ctx: inout GraphicsContext, _ size: CGSize, _ date: Date,
                                         _ color: Color, _ playing: Bool, _ wasPlaying: Bool, _ changedAt: Date, _ clock: BeatClock?) {
        let t = date.timeIntervalSinceReferenceDate
        // Ease between calm (paused) and lively (playing) over about a second.
        let k = min(max(date.timeIntervalSince(changedAt) / 1.2, 0), 1)
        let from = wasPlaying ? 1.0 : 0.25, to = playing ? 1.0 : 0.25
        let energy = from + (to - from) * k
        // Follow the song's real beat when we know it, else a steady 118 BPM.
        let beat = clock.map { pow(max(0, cos(2 * .pi * $0.phase(at: date))), 5) }
            ?? pow(max(0, sin(t * 2 * .pi * 118 / 60)), 5)
        let w = size.width, h = size.height

        ctx.blendMode = .plusLighter

        for i in 0..<4 {
            let fi = Double(i)
            let x = w * (0.5 + 0.42 * sin(t * (0.13 + fi * 0.05) + fi * 2))
            let y = h * (0.5 + 0.35 * cos(t * (0.11 + fi * 0.04) + fi * 1.3))
            let r = min(w, h) * (0.35 + 0.1 * sin(t * 0.4 + fi)) * (1 + beat * 0.12 * energy)
            let rect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
            ctx.fill(Path(ellipseIn: rect),
                     with: .radialGradient(
                        Gradient(colors: [(i % 2 == 0 ? color : Color.white).opacity(0.20 * (0.5 + energy * 0.5)), color.opacity(0)]),
                        center: CGPoint(x: x, y: y), startRadius: 0, endRadius: r))
        }

        let bands = 5
        for b in 0..<bands {
            let fb = Double(b)
            let base = h * (0.3 + fb / Double(bands) * 0.5)
            let amp = h * (0.05 + 0.1 * energy) * (1 + beat * 0.5 * energy) * (0.6 + fb * 0.18)
            let speed = 0.5 + fb * 0.17
            var path = Path()
            path.move(to: CGPoint(x: 0, y: h))
            var x: CGFloat = 0
            while x <= w {
                let u = Double(x / w)
                let y = base + sin(u * 5 + t * speed + fb) * amp + sin(u * 11 - t * speed * 1.4 + fb * 2) * amp * 0.35
                path.addLine(to: CGPoint(x: x, y: y))
                x += 8
            }
            path.addLine(to: CGPoint(x: w, y: h))
            path.closeSubpath()
            ctx.fill(path, with: .linearGradient(
                Gradient(colors: [(b % 2 == 0 ? color : Color.white).opacity(0.14), color.opacity(0)]),
                startPoint: CGPoint(x: 0, y: base - amp), endPoint: CGPoint(x: 0, y: h)))
        }
    }
}


#if os(iOS)
// MARK: - Full screen board (landscape)

/// Just the music, big, over the visualizer. Controls fade away a few seconds after you stop touching the screen.
struct LiveBoardView: View {
    let canPlay: Bool
    let glow: Color
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var theme = ArtTheme.shared
    @State private var awake = true
    @State private var hideTask: Task<Void, Never>?

    private var np: NowPlayingInfo? { audio.nowPlaying }
    private var hasSong: Bool { np?.title.isEmpty == false }

    private func wake() {
        withAnimation(.easeOut(duration: 0.2)) { awake = true }
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if !Task.isCancelled { withAnimation(.easeIn(duration: 0.5)) { awake = false } }
        }
    }

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.height * 0.74, geo.size.width * 0.4)
            ZStack {
                Color.black.ignoresSafeArea()
                LiveVisualizer(color: glow, playing: audio.isPlaying, beat: audio.beatClock).ignoresSafeArea()

                HStack(spacing: 40) {
                    art(side: side)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(hasSong ? (np?.title ?? "") : "Babson Radio")
                            .font(BRFont.display(34)).foregroundColor(.white)
                            .lineLimit(3).minimumScaleFactor(0.6)
                        Text(hasSong ? ((np?.artist.isEmpty == false) ? np!.artist : "Babson Radio") : "Live from campus")
                            .font(.system(size: 20, weight: .medium)).foregroundColor(.white.opacity(0.8)).lineLimit(2)
                        if let show = np?.showTitle, !show.isEmpty {
                            Text(show.uppercased()).font(BRFont.display(13)).kerning(3).foregroundColor(glow).padding(.top, 8)
                        }
                        if hasSong, let next = np?.next {
                            Text("Next: \(next.title)\(next.artist.isEmpty ? "" : " · \(next.artist)")")
                                .font(.system(size: 14)).foregroundColor(.white.opacity(0.5)).lineLimit(1).padding(.top, 10)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 32).padding(.bottom, 70)

                VStack {
                    Spacer()
                    // Play/pause, skip and volume. They fade a few seconds after the last tap.
                    HStack(spacing: 18) {
                        Button { if canPlay { audio.toggle() } } label: {
                            Image(systemName: audio.isBuffering ? "ellipsis" : (audio.isPlaying ? "pause.fill" : "play.fill"))
                                .font(.system(size: 22, weight: .semibold)).foregroundColor(.white)
                                .frame(width: 56, height: 56)
                                .brGlass(in: Circle(), interactive: true)
                        }
                        .buttonStyle(.plain).opacity(canPlay ? 1 : 0.4)
                        .accessibilityLabel(audio.isPlaying ? "Pause" : "Play")
                        SkipControl(onDark: true)
                        Image(systemName: "speaker.fill").font(.system(size: 13)).foregroundColor(.white.opacity(0.7))
                        SystemVolumeSlider(tint: .white).frame(width: 200, height: 34)
                        Image(systemName: "speaker.wave.3.fill").font(.system(size: 13)).foregroundColor(.white.opacity(0.7))
                    }
                    .padding(.horizontal, 22).padding(.vertical, 10)
                    .brGlass(in: Capsule())
                    .padding(.bottom, 8)
                    .opacity(awake ? 1 : 0).allowsHitTesting(awake)
                    HStack {
                        Text("BABSON RADIO").font(BRFont.display(11)).kerning(5).foregroundColor(.white.opacity(0.4))
                        Spacer()
                    }
                    .padding(.horizontal, 32).padding(.bottom, 10)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .contentShape(Rectangle())
        .onTapGesture { wake() }
        .onAppear { wake() }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
    }

    @ViewBuilder private func art(side: CGFloat) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18)
                .fill(LinearGradient(colors: [glow.opacity(0.7), Color(hex: "080808")], startPoint: .topLeading, endPoint: .bottomTrailing))
            VStack(spacing: 0) {
                Text("BABSON").font(BRFont.display(14)).kerning(5).foregroundColor(Color.brGold.opacity(0.9))
                Text("RADIO").font(BRFont.display(38)).kerning(6).foregroundColor(.white.opacity(0.92))
            }
            if let art = np?.art, !art.isEmpty, let url = URL(string: art) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                }
            }
        }
        .frame(width: side, height: side)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(color: glow.opacity(0.5), radius: 50)
    }
}
#endif


// MARK: - Pull-up drawer

/// A shelf that peeks up from the bottom: a green lip with a grip and "Swipe up to rate!", and a panel behind it.
/// Tap or drag the lip to open it; drag down or tap to close.
struct LiveDrawer<Content: View>: View {
    static var handleHeight: CGFloat { 46 }
    @Binding var open: Bool
    let height: CGFloat
    let tint: Color
    @ViewBuilder var content: () -> Content
    @Environment(\.colorScheme) private var scheme
    @GestureState private var drag: CGFloat = 0
    @State private var nudge = false
    @ObservedObject private var theme = ArtTheme.shared

    private var corner: CGFloat { 22 }

    var body: some View {
        let closedOffset = height - Self.handleHeight
        VStack(spacing: 0) {
            // The lip
            ZStack {
                UnevenRoundedRectangle(topLeadingRadius: corner, topTrailingRadius: corner)
                    .fill(LinearGradient(colors: [theme.lip, theme.lipDeep], startPoint: .top, endPoint: .bottom))
                    .overlay(alignment: .bottom) {
                        // A darker lower edge, so the lip has thickness
                        Rectangle().fill(.black.opacity(0.28)).frame(height: 3)
                    }
                    .shadow(color: .black.opacity(0.3), radius: 8, y: -2)
                    .overlay(alignment: .top) {
                        // A lit top edge, like a real shelf
                        UnevenRoundedRectangle(topLeadingRadius: corner, topTrailingRadius: corner)
                            .stroke(Color.white.opacity(0.35), lineWidth: 1)
                            .mask(LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center))
                    }
                VStack(spacing: 3) {
                    // Grip
                    HStack(spacing: 4) { ForEach(0..<3, id: \.self) { _ in Capsule().fill(.white.opacity(0.55)).frame(width: 14, height: 3) } }
                    HStack(spacing: 6) {
                        Image(systemName: open ? "chevron.down" : "chevron.up").font(.system(size: 10, weight: .bold))
                            .offset(y: (!open && nudge) ? -2 : 0)
                        Text(open ? "Swipe down to close" : "Swipe up to rate!")
                            .font(BRFont.display(14)).kerning(2)
                    }
                    .foregroundColor(.white)
                    .shadow(color: .black.opacity(0.35), radius: 1, y: 1)
                }
            }
            .frame(height: Self.handleHeight)
            // Tipped back a little, so the shelf looks like it recedes into the screen.
            .rotation3DEffect(.degrees(open ? 0 : -14), axis: (x: 1, y: 0, z: 0), anchor: .bottom, perspective: 0.5)
            .animation(.spring(duration: 0.3), value: open)
            .contentShape(Rectangle())
            .onTapGesture { withAnimation(.spring(duration: 0.3)) { open.toggle() } }
            // Global coordinates: the lip moves while you drag it, so measuring in its own space makes the drag jitter.
            .gesture(
                DragGesture(minimumDistance: 4, coordinateSpace: .global)
                    .updating($drag) { v, state, _ in state = v.translation.height }
                    .onEnded { v in
                        withAnimation(.spring(duration: 0.3)) {
                            if v.translation.height < -30 { open = true } else if v.translation.height > 30 { open = false }
                        }
                    }
            )

            // The panel
            ScrollView(showsIndicators: false) { content() }
                .frame(height: height - Self.handleHeight)
                .background(
                    // The inside of the shelf: darker at the back (top), lighter toward you
                    LinearGradient(colors: scheme == .dark ? [Color.brDkBg, Color.brDkSurface] : [Color.brLtSurface2, Color.brLtSurface],
                                   startPoint: .top, endPoint: .bottom)
                )
                .overlay(alignment: .top) {
                    // The shadow the lip casts into the shelf
                    LinearGradient(colors: [.black.opacity(0.35), .clear], startPoint: .top, endPoint: .bottom).frame(height: 22).allowsHitTesting(false)
                }
                .overlay {
                    // Shadowed side walls, so it reads as a recessed box
                    HStack(spacing: 0) {
                        LinearGradient(colors: [.black.opacity(0.22), .clear], startPoint: .leading, endPoint: .trailing).frame(width: 16)
                        Spacer(minLength: 0)
                        LinearGradient(colors: [.clear, .black.opacity(0.22)], startPoint: .leading, endPoint: .trailing).frame(width: 16)
                    }
                    .allowsHitTesting(false)
                }
        }
        .frame(height: height)
        .offset(y: offset(closedOffset))
        .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { nudge = true } }
    }

    private func offset(_ closed: CGFloat) -> CGFloat {
        let base: CGFloat = open ? 0 : closed
        return min(max(base + drag, 0), closed)
    }
}
