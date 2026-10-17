import SwiftUI
import Combine
import MediaPlayer

// MARK: - Live Player Screen

struct LivePlayerView: View {
    /// True for the left page that stays beside the other tabs on an open foldable in landscape (like two phones side by side).
    var sidePane = false
    @Environment(\.globalProfile) private var globalProfile
    /// Width of the left page when sidePane is true. The view itself fills the whole screen so its glow can spill under the page beside it.
    var paneWidth: CGFloat = 0
    @StateObject private var audio = AudioPlayerManager.shared
    @StateObject private var auth = AuthManager.shared
    @ObservedObject private var presence = PresenceManager.shared
    @ObservedObject private var theme = ArtTheme.shared
    @Environment(\.colorScheme) var scheme
    @State private var showProfileSheet = false
    @State private var showVote = false
    @State private var drawerOpen = false
    @Environment(\.verticalSizeClass) private var vSize
    @Environment(\.horizontalSizeClass) private var hSize
    /// True while the foldable is propped half open. The big clock only shows then, on the outer screen, sideways.
    @State private var halfFolded = false
    @ObservedObject private var lab = TestLab.shared
    /// The real hinge, or the admin Test lab's pretend half-folded switch.
    /// A phone turned sideways. Never true on an open Duo or iPad (regular width), even if the vertical size class blips while the tabs switch.
    private var landscapePhone: Bool { vSize == .compact && hSize != .regular }
    private var folded: Bool { halfFolded || lab.halfFolded }
    /// The full screen board, opened by the corner button on a fully open foldable (same as the website's full screen).
    @State private var showBoard = false

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
        if sidePane { sidePlayer } else { mainBody }
    }

    /// The player on its own, for the left half while another tab fills the right half. It never touches the tab bar.
    private var sidePlayer: some View {
        GeometryReader { g in
            let top = g.safeAreaInsets.top
            let w = paneWidth > 0 ? paneWidth : g.size.width
            let side = max(120, min(w - 56, g.size.height - top - 360))
            VStack(spacing: 0) {
                headerRow(topInset: top, showProfile: false)
                    .padding(.leading, 40).padding(.trailing, 20)
                    .padding(.top, 14).padding(.bottom, 6)
                Spacer(minLength: 8)
                PlayerArtCard()
                    .frame(width: 340, height: 340)
                    .scaleEffect(side / 340)
                    .frame(width: side, height: side)
                Spacer(minLength: 8)
                nowPlayingInfo.padding(.horizontal, 24)
                Spacer(minLength: 8)
                playRow
                Spacer(minLength: 8)
                volumeRow.padding(.horizontal, 36)
                controlNotes
                Spacer(minLength: 24)
            }
            .frame(width: w, height: g.size.height)
        }
        .background(alignment: .leading) {
            // The page's own background: solid base, with the glow fading out toward the page beside it (never over that page).
            ZStack {
                (scheme == .dark ? Color.brDkBg : Color.brLtBg)
                ZStack {
                    theme.wash(scheme)
                    LiveVisualizer(color: glowColor, playing: audio.isPlaying, beat: audio.beatClock)
                }
                .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.8), .init(color: .clear, location: 1)], startPoint: .leading, endPoint: .trailing))
            }
            .frame(width: paneWidth > 0 ? paneWidth : nil)
            .ignoresSafeArea()
            .allowsHitTesting(false)
        }
        .ignoresSafeArea(edges: .top)
        .onAppear { audio.startPolling() }
    }

    private var mainBody: some View {
        GeometryReader { geo in
            let top = geo.safeAreaInsets.top
            let small = geo.size.height < 700
            // Everything the listener needs fits on one screen. The cover takes whatever height is left over.
            let reserved: CGFloat = top + (small ? 410 : 470) + (LiveDrawer<EmptyView>.handleHeight - 46)
            let side = max(120, min(geo.size.width - 72, geo.size.height - reserved))
            let drawerH = min(geo.size.height * 0.72, 560)
            ZStack(alignment: .bottom) {
                if hSize == .regular {
                    duoContent(top: top)
                } else {
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

                    // Equal gaps between every block, so no awkward empty band is left above the drawer.
                    Spacer(minLength: 8)

                    nowPlayingInfo
                        .padding(.horizontal, 24)

                    Spacer(minLength: 8)

                    playRow

                    Spacer(minLength: 8)

                    // Volume under the transport buttons, like Apple Music: quiet speaker, slider, loud speaker.
                    volumeRow
                        .padding(.horizontal, 36)

                    Spacer(minLength: 8)

                    // Reactions always stay on the main screen.
                    LiveExtrasView(mode: .reactions)

                    if !auth.isSignedIn {
                        Text("Sign in for reminders and more.")
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
                LiveDrawer(open: $drawerOpen, height: drawerH, bottomExtra: geo.safeAreaInsets.bottom, tint: accent) {
                    drawerContent
                }
                .offset(y: geo.safeAreaInsets.bottom)
                }
            }
            .ignoresSafeArea(edges: .top)
        }
        // On the whole screen (not just the page above the tab bar), so the color runs all the way to the bottom.
        .background {
            ZStack {
                (scheme == .dark ? Color.brDkBg : Color.brLtBg)
                theme.wash(scheme)
                LiveVisualizer(color: glowColor, playing: audio.isPlaying, beat: audio.beatClock)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .ignoresSafeArea()
        }
        .overlay { EmojiRainOverlay() }
        .trackHalfFolded($halfFolded)
        .overlay {
            if showBoard && hSize == .regular {
                LiveBoardView(canPlay: canPlay, glow: glowColor, stacked: true).ignoresSafeArea().transition(.opacity)
            }
        }
        // The same corner button opens and closes the full screen board. The overlay itself ignores the safe area, so it spans
        // the whole screen and the button sits 22 points from the real corner, clear of the rounded bezel.
        .overlay {
            ZStack {
                if hSize == .regular && (!folded || showBoard) {
                    Button { withAnimation(.easeInOut(duration: 0.25)) { showBoard.toggle() } } label: {
                        Image(systemName: showBoard ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(showBoard ? .white : (scheme == .dark ? .brDkText : .brLtText))
                            .frame(width: 40, height: 40)
                            .brGlass(in: Circle(), interactive: true)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(showBoard ? "Exit full screen" : "Full screen")
                    .padding(.leading, 22).padding(.bottom, 22)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
            }
            .ignoresSafeArea()
        }
#if os(iOS)
        // Turned sideways on an iPhone: a clean full screen board with just the music, like the website's full screen mode.
        .overlay {
            if landscapePhone {
                LiveBoardView(canPlay: canPlay, glow: glowColor, showClock: (folded && hSize == .compact) || lab.clock).transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: landscapePhone)
        // The Live page only reports whether the full screen board is up. ContentView owns the tab bar and decides.
        .onChange(of: landscapePhone) { _, up in BoardState.shared.phoneBoard = up }
        .onChange(of: showBoard) { _, up in BoardState.shared.duoBoard = up }
#endif
        .alert("Enjoying Babson Radio?", isPresented: $audio.showSignInPrompt) {
            Button("Create account or sign in") { showProfileSheet = true }
            Button("Keep listening", role: .cancel) {}
        } message: {
            Text("Create a free account for show reminders.")
        }
        .sheet(isPresented: $showProfileSheet) { ProfileView() }
        .sheet(isPresented: $showVote) { VoteView() }
        .onAppear { audio.startPolling(); ArtTheme.shared.start(); Task { await VoteStore.shared.refresh() }; BoardState.shared.phoneBoard = landscapePhone; BoardState.shared.duoBoard = showBoard
            // Open Duo: the system leaves the tab bar hidden after a tab switch, and only a change in this flag brings it back.
            // So on every return to Live, flip the Duo tracker on and straight off again (the board itself never shows).
            if hSize == .regular && !showBoard { BoardState.shared.nudgeDuo() } }
        .onDisappear { BoardState.shared.phoneBoard = false; BoardState.shared.duoBoard = false; if hSize != .regular { audio.stopPolling() } }
    }

    // MARK: - Roomy layout (open foldable, iPad, wide windows)

    /// Two pages, like an open book. Left: the cover and what is playing. Right: poll, rating, reactions and the media controls. ArrangementView puts them side by side, and stacks them
    /// top and bottom when the device is propped up like a tabletop: the show on top, the touch controls on the stable half.
    @ViewBuilder private func duoContent(top: CGFloat) -> some View {
        if #available(iOS 27.1, *) {
            ArrangementView {
                playerPage(top: top)
            } secondary: {
                reactionsPage(top: top)
            }
        } else {
            HStack(spacing: 0) {
                playerPage(top: top)
                reactionsPage(top: top)
            }
        }
    }

    /// Left page, open or half folded: the logo, then the cover and what is playing, as big as the pane allows. No controls here.
    private func playerPage(top: CGFloat) -> some View {
        GeometryReader { g in
            let side = max(120, min(g.size.width - 48, g.size.height - top - 190))
            VStack(spacing: 0) {
                headerRow(topInset: top, showProfile: false)
                    .padding(.leading, 40).padding(.trailing, 20)
                    .padding(.top, 14).padding(.bottom, 6)
                Spacer(minLength: 0)
                PlayerArtCard()
                    .frame(width: 340, height: 340)
                    .scaleEffect(side / 340)
                    .frame(width: side, height: side)
                nowPlayingInfo
                    .padding(.horizontal, 24)
                    .padding(.top, 14)
                Spacer(minLength: 0)
            }
            .frame(width: g.size.width, height: g.size.height)
            .animation(.easeInOut(duration: 0.3), value: folded)
        }
    }

    @ViewBuilder private var controlNotes: some View {
        if !auth.isSignedIn {
            Text("Sign in for reminders and more.")
                .font(.system(size: 11))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                .multilineTextAlignment(.center).lineLimit(2)
                .padding(.horizontal, 32)
        } else if !auth.canListenLive {
            Text(lockedMessage)
                .font(.system(size: 11))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                .multilineTextAlignment(.center).lineLimit(2)
                .padding(.horizontal, 32)
        }
    }

    /// Right page: profile in the corner, then reactions, ratings and the poll. Open: the poll is inline and the join buttons are
    /// below it. Half folded: the poll shrinks to a button and the media controls sit at the bottom, so everything you touch is here.
    private func reactionsPage(top: CGFloat) -> some View {
        GeometryReader { g in
            ScrollView {
                VStack(spacing: 14) {
                    HStack {
                        Spacer()
                        // On a wide window ContentView draws the profile button; keep its room here.
                        if globalProfile { Color.clear.frame(width: 34, height: 34) } else { ProfileCircleButton() }
                    }
                    .padding(.trailing, 20).padding(.top, top + 12)
                    // The poll is first (a button when half folded), then the ratings, then the reactions.
                    if auth.isSignedIn && auth.canListenLive {
                        // A button only when the pane is too short to hold the poll without scrolling.
                        if folded && g.size.height < 640 {
                            Button { showVote = true } label: {
                                Label("What would you like to hear?", systemImage: "hand.thumbsup")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(accent)
                                    .padding(.horizontal, 18).padding(.vertical, 12)
                                    .brGlass(in: Capsule(), tint: accent.opacity(0.25), fallback: accent.opacity(0.14))
                            }
                            .buttonStyle(.plain)
                        } else {
                            VotePanel(compact: true)
                                .frame(maxWidth: 520)
                                .padding(.horizontal, 24)
                        }
                    }
                    VStack(spacing: 12) {
                        roomBody(community: false, voteButton: false)
                    }
                    .frame(maxWidth: .infinity)
                    LiveExtrasView(mode: .reactions)
                        .frame(maxWidth: .infinity)
                    Spacer(minLength: 8)
                    // Media controls sit at the bottom of this pane, above the join button
                    playRow
                    volumeRow.padding(.horizontal, 36)
                    controlNotes
                        .padding(.bottom, folded ? 24 : 4)
                    if !folded {
                        communitySection
                            .frame(maxWidth: 520)
                            .padding(.horizontal, 24)
                            .padding(.bottom, 20)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: g.size.height)
            }
            .scrollIndicators(.hidden)
        }
    }

    /// The host's note, who is tuned in, set list, vote and community. Shown in the pull-up drawer on a phone, and on the right page of an open foldable.
    private var roomContent: some View { roomBody(community: true) }

    /// What the pull-up drawer holds, top to bottom: the poll (already open), the rating, the host's note, reactions, and the credit.
    private var drawerContent: some View {
        VStack(spacing: 18) {
            if auth.isSignedIn && auth.canListenLive {
                VotePanel(compact: true).padding(.horizontal, 20)
            }
            roomBody(community: !auth.isSignedIn, voteButton: false)
            LiveExtrasView(mode: .emojis)
            DesignedByCredit()
        }
        .padding(.top, 4)
    }

    private func roomBody(community: Bool, voteButton: Bool = true) -> some View {

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
                        if presence.count > 0 {
                            Text(presence.friendsLine ?? "\(presence.count) tuned in")
                                .font(.system(size: 11)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        }
                        if !presence.groups.isEmpty {
                            VStack(spacing: 4) {
                                ForEach(presence.groups.prefix(3)) { g in
                                    Text(g.text).font(.system(size: 12, weight: .semibold)).foregroundColor(accent)
                                }
                            }
                        }
                        LiveExtrasView(mode: .rest)
                        if voteButton && auth.isSignedIn && auth.canListenLive {
                            Button { showVote = true } label: {
                                Label("What would you like to hear?", systemImage: "hand.thumbsup")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(accent)
                                    .padding(.horizontal, 18).padding(.vertical, 12)
                                    .brGlass(in: Capsule(), tint: accent.opacity(0.25), fallback: accent.opacity(0.14))
                            }
                            .buttonStyle(.plain)
                        }
                        if community {
                            communitySection
                                .padding(.bottom, 24)
                        }
                    }
                    .padding(.top, 8)
    }

    // MARK: - Sub-views

    private func headerRow(topInset: CGFloat, profileFirst: Bool = false, showProfile: Bool = true) -> some View {
        HStack(spacing: 12) {
            if profileFirst && showProfile { ProfileCircleButton() }
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

            if !profileFirst && showProfile { ProfileCircleButton() }
        }
        .animation(.easeInOut(duration: 0.25), value: audio.isPlaying)
        .padding(.top, topInset)
    }

    private var nowPlayingInfo: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                if audio.isPlaying {
                    OnAirBadge()
                } else {
                    BRTagChip(text: audio.nowPlaying?.isLive == true ? "LIVE DJ" : "LIVE", style: .live)
                }
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
            return "Sign in to listen, or start a free 3-day guest trial."
        }
        return u.isGuest
            ? "Your guest access has ended. Ask a student to sponsor you."
            : "Listening isn't available right now."
    }

    /// Equalizer on the left while playing, play/stop in the middle, skip on the right (same as the website).
    private var playRow: some View {
        // Three equal slots around the play button: the same width on each side, the same gap, all centered on one line.
        HStack(spacing: 30) {
            ZStack {
                EqualizerBars(color: theme.accent(scheme), playing: audio.isPlaying, beat: audio.beatClock)
            }
            .frame(width: 48, height: 48)
            playControl.opacity(canPlay ? 1 : 0.4)
            SkipControl()
                .frame(width: 48, height: 48)
        }
        .frame(maxWidth: .infinity)
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

            HStack(spacing: 22) {
                Link("Privacy", destination: BabsonLinks.privacy)
                if let ig = BabsonLinks.instagram {
                    Link(destination: ig) {
                        HStack(spacing: 6) { InstagramGlyph(size: 16); Text("Instagram") }
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
                            if let image = phase.image { image.resizable().scaledToFill().modifier(DaytimeCover(on: !ArtTheme.full(scheme))) } else { Color.clear }
                        }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 20))
            }
        }
        .shadow(color: Color.black.opacity(0.55), radius: 24, x: 0, y: 10)
    }
}

/// In the daytime the cover is pulled in a touch (6% less saturation, a hair warmer) so it sits in the muted, warm page.
struct DaytimeCover: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.saturation(0.94).colorMultiply(Color(red: 1.0, green: 0.99, blue: 0.965)) } else { content }
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
    @Environment(\.colorScheme) private var scheme
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
        .opacity(ArtTheme.full(scheme) ? 0.6 : Self.strength)
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
    var showClock: Bool = false
    /// Stacked: the cover as big as the screen allows, with the title and artist underneath. For the open foldable and iPad.
    var stacked = false
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

                if stacked {
                    // Edge to edge: the cover as big as the screen allows on the left, the controls, reactions and rating on the right.
                    let rail: CGFloat = 330
                    let big = max(200, min(geo.size.width - rail - 56, geo.size.height - 120))
                    HStack(spacing: 24) {
                        VStack(spacing: 14) {
                            art(side: big)
                            VStack(spacing: 2) {
                                Text(hasSong ? (np?.title ?? "") : "Babson Radio")
                                    .font(BRFont.display(30)).foregroundColor(.white)
                                    .lineLimit(1).minimumScaleFactor(0.5)
                                Text(hasSong ? ((np?.artist.isEmpty == false) ? np!.artist : "Babson Radio") : "Live from campus")
                                    .font(.system(size: 18, weight: .medium)).foregroundColor(.white.opacity(0.8)).lineLimit(1)
                            }
                            .frame(width: big)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        VStack(spacing: 28) {
                            Spacer(minLength: 0)
                            HStack(spacing: 18) {
                                Button { if canPlay { audio.toggle() } } label: {
                                    Image(systemName: audio.isBuffering ? "ellipsis" : (audio.isPlaying ? "pause.fill" : "play.fill"))
                                        .font(.system(size: 26, weight: .semibold)).foregroundColor(.white)
                                        .frame(width: 68, height: 68)
                                        .brGlass(in: Circle(), interactive: true)
                                }
                                .buttonStyle(.plain).opacity(canPlay ? 1 : 0.4)
                                .accessibilityLabel(audio.isPlaying ? "Pause" : "Play")
                                SkipControl(onDark: true)
                            }
                            HStack(spacing: 10) {
                                Image(systemName: "speaker.fill").font(.system(size: 13)).foregroundColor(.white.opacity(0.7))
                                SystemVolumeSlider(tint: .white).frame(height: 34)
                                Image(systemName: "speaker.wave.3.fill").font(.system(size: 13)).foregroundColor(.white.opacity(0.7))
                            }
                            .padding(.horizontal, 20)
                            LiveExtrasView(mode: .board)
                                .environment(\.colorScheme, .dark)
                            Spacer(minLength: 0)
                        }
                        .frame(width: rail)
                    }
                    .padding(.leading, 28).padding(.trailing, 20).padding(.vertical, 20)
                } else {
                HStack(spacing: 40) {
                    art(side: side)
                    VStack(alignment: .leading, spacing: 8) {
                        if showClock {
                            BigClock(size: min(geo.size.height * 0.24, 110), alignment: .leading, accent: glow, show: "", onDark: true)
                                .padding(.bottom, 6)
                        }
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
                }

                if !stacked {
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


// MARK: - Half-folded tracking

private struct HalfFoldedTracker: ViewModifier {
    @Binding var halfFolded: Bool
    func body(content: Content) -> some View {
        if #available(iOS 27.1, *) {
            content.onHingeChange { _, context in
                halfFolded = context.hinge?.status == .partiallyOpen
            }
        } else {
            content
        }
    }
}

extension View {
    func trackHalfFolded(_ value: Binding<Bool>) -> some View { modifier(HalfFoldedTracker(halfFolded: value)) }
}

// MARK: - Big clock

/// The time, big, like a desk clock: "1:19" with a small AM/PM, the date underneath and the show that is on air.
/// Used on big screens (an open foldable, an iPad) and on the full screen board. Updates once a minute.
struct BigClock: View {
    var size: CGFloat
    var alignment: HorizontalAlignment = .center
    var accent: Color
    var show: String = ""
    var onDark: Bool = false
    @Environment(\.colorScheme) private var scheme

    private var ink: Color { onDark ? .white : (scheme == .dark ? .brDkText : .brLtText) }

    var body: some View {
        TimelineView(.everyMinute) { context in
            let parts = Self.timeParts(context.date)
            VStack(alignment: alignment, spacing: size * 0.04) {
                HStack(alignment: .firstTextBaseline, spacing: size * 0.08) {
                    Text(parts.time)
                        .font(BRFont.display(size)).kerning(size * 0.02)
                        .foregroundColor(ink)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    if !parts.suffix.isEmpty {
                        Text(parts.suffix)
                            .font(BRFont.display(size * 0.26)).kerning(2)
                            .foregroundColor(accent)
                    }
                }
                Text(Self.dateLine(context.date))
                    .font(BRFont.display(max(14, size * 0.16))).kerning(4)
                    .foregroundColor(ink.opacity(0.7))
                if !show.isEmpty {
                    Text(show.uppercased())
                        .font(BRFont.display(max(12, size * 0.11))).kerning(3)
                        .foregroundColor(accent).lineLimit(1).padding(.top, size * 0.04)
                }
            }
            .multilineTextAlignment(alignment == .leading ? .leading : .center)
        }
        .accessibilityElement(children: .combine)
    }

    /// "1:19" and "AM" (or "13:19" and "" in 24-hour settings).
    static func timeParts(_ date: Date) -> (time: String, suffix: String) {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("jmm")
        let pieces = f.string(from: date).components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        return (pieces.first ?? "", pieces.dropFirst().joined(separator: " "))
    }

    static func dateLine(_ date: Date) -> String {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
        return f.string(from: date).uppercased()
    }
}

// MARK: - Pull-up drawer

/// A shelf that peeks up from the bottom: a green lip with a grip and "Swipe up to rate!", and a panel behind it.
/// Tap or drag the lip to open it; drag down or tap to close.
struct LiveDrawer<Content: View>: View {
    /// What shows when closed: the grab tab plus a blurred peek of what is inside.
    static var handleHeight: CGFloat { 72 }
    private static var tabHeight: CGFloat { 44 }
    @Binding var open: Bool
    let height: CGFloat
    /// Extra height below the page's bottom edge, so the drawer runs down to the bottom of the screen.
    var bottomExtra: CGFloat = 0
    let tint: Color
    @ViewBuilder var content: () -> Content
    @Environment(\.colorScheme) private var scheme
    @GestureState private var drag: CGFloat = 0

    /// Babson green, unless the whole UI is following the album art.
    private var base: Color { ArtTheme.full(scheme) ? tint : .brGreen }
    private var shape: UnevenRoundedRectangle { UnevenRoundedRectangle(topLeadingRadius: 28, bottomLeadingRadius: 44, bottomTrailingRadius: 44, topTrailingRadius: 28, style: .continuous) }

    var body: some View {
        let closedOffset = height - Self.handleHeight
        ZStack(alignment: .top) {
            // Frosted glass in the drawer's color
            shape.fill(.ultraThinMaterial)
                // A solid-ish base under the tint (dark in dark mode, cream in light) so the text always has contrast.
                .overlay(shape.fill(scheme == .dark ? Color.black.opacity(0.5) : Color.brLtBg.opacity(0.88)))
                .overlay(shape.fill(LinearGradient(colors: scheme == .dark ? [base.opacity(0.22), base.opacity(0.08)] : [base.opacity(0.16), base.opacity(0.06)], startPoint: .top, endPoint: .bottom)))
                .overlay(shape.stroke(Color.white.opacity(0.3), lineWidth: 1))
                .shadow(color: base.opacity(0.35), radius: 18, y: -4)

            VStack(spacing: 0) {
                Color.clear.frame(height: Self.tabHeight)
                // The contents. Closed, they are a soft blur you can half read; open, they come into focus.
                ScrollView(showsIndicators: false) {
                    content()
                        .padding(.bottom, 24 + bottomExtra)
                }
                .scrollDisabled(!open)
                .blur(radius: open ? 0 : 3.5)
                .opacity(open ? 1 : 0.9)
                .allowsHitTesting(open)
                .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: open ? 1 : 0.35), .init(color: open ? .black : .clear, location: 1)], startPoint: .top, endPoint: .bottom))
                .animation(.easeInOut(duration: 0.3), value: open)
            }
            .clipShape(shape)

            // The grab tab: no words, just a handle and a chevron that bobs a little while it is closed.
            VStack(spacing: 0) {
                Capsule().fill((scheme == .dark ? Color.white : Color.brLtSub).opacity(0.75)).frame(width: 40, height: 5).padding(.top, 9)
                TimelineView(.animation) { tl in
                    let t = tl.date.timeIntervalSinceReferenceDate
                    Image(systemName: open ? "chevron.compact.down" : "chevron.compact.up")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor((scheme == .dark ? Color.white : Color.brLtSub).opacity(0.9))
                        .offset(y: open ? 0 : CGFloat(sin(t * 3.2)) * -2.5)
                }
                .frame(height: 24)
            }
            .frame(maxWidth: .infinity)
            .frame(height: Self.tabHeight, alignment: .top)

            // Tap or drag the tab. Closed, the whole peek works too.
            Color.clear
                .contentShape(Rectangle())
                .frame(height: open ? Self.tabHeight : Self.handleHeight)
                .frame(maxHeight: .infinity, alignment: .top)
                .onTapGesture { withAnimation(.spring(duration: 0.35)) { open.toggle() } }
                // Global coordinates: the drawer moves while you drag it, so measuring in its own space makes the drag jitter.
                .gesture(
                    DragGesture(minimumDistance: 4, coordinateSpace: .global)
                        .updating($drag) { v, state, _ in state = v.translation.height }
                        .onEnded { v in
                            withAnimation(.spring(duration: 0.35)) {
                                if v.translation.height < -30 { open = true } else if v.translation.height > 30 { open = false }
                            }
                        }
                )
        }
        .frame(height: height + bottomExtra)
        .padding(.horizontal, 10)
        .frame(height: height + bottomExtra, alignment: .top)
        .offset(y: offset(closedOffset))
        .animation(.spring(duration: 0.35), value: open)
    }

    private func offset(_ closed: CGFloat) -> CGFloat {
        let base: CGFloat = open ? 0 : closed
        return min(max(base + drag, 0), closed)
    }
}




/// Whether the full screen board is up. Read by ContentView, which is the only place that shows or hides the tab bar.
final class BoardState: ObservableObject {
    static let shared = BoardState()
    /// An iPhone turned sideways (the board comes up by itself).
    @Published var phoneBoard = false
    /// The open Duo / iPad: the board the person opened with the full screen button. Tracked on its own, apart from the phone.
    @Published var duoBoard = false
    var open: Bool { phoneBoard || duoBoard }

    /// Flips the Duo tracker on and right back off so the tab bar gets a fresh show instruction.
    func nudgeDuo() {
        duoBoard = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { [weak self] in self?.duoBoard = false }
    }
}
