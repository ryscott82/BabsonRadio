import SwiftUI
import Combine

// MARK: - Live Player Screen
// Phone: one desk (LiveDesk.swift). Open foldable / iPad: two desks side by side (DuoDesk.swift). Turned sideways or opened
// full screen: the board (BoardViews.swift). This file only decides which one to show and owns the sheets and alerts.

struct LivePlayerView: View {
    /// True for the left page that stays beside the other tabs on an open foldable in landscape (like two phones side by side).
    var sidePane = false
    /// Width of the left page when sidePane is true. The view itself fills the whole screen.
    var paneWidth: CGFloat = 0
    @StateObject private var audio = AudioPlayerManager.shared
    @StateObject private var auth = AuthManager.shared
    @ObservedObject private var presence = PresenceManager.shared
    @ObservedObject private var theme = ArtTheme.shared
    @ObservedObject private var lab = TestLab.shared
    @Environment(\.colorScheme) var scheme
    @Environment(\.verticalSizeClass) private var vSize
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var showProfileSheet = false
    @State private var showVote = false
    @State private var drawerOpen = false
    /// True while the foldable is propped half open. The big clock only shows then, on the outer screen, sideways.
    @State private var halfFolded = false
    /// The full screen board, opened by the corner button on a fully open foldable (same as the website's full screen).
    @State private var showBoard = false

    /// A phone turned sideways. Never true on an open Duo or iPad (regular width), even if the vertical size class blips while the tabs switch.
    private var landscapePhone: Bool { vSize == .compact && hSize != .regular }
    private var folded: Bool { halfFolded || lab.halfFolded }
    /// Signed-out visitors can preview the stream.
    private var canPlay: Bool { auth.canListenLive || !auth.isSignedIn }

    private var album: Bool { theme.albumOn }
    private var mode: HWMode { HWMode.resolve(album: album ? theme.main.color : nil, scheme: scheme) }
    private var glowColor: Color { album ? theme.main.color : .hwLED }

    var body: some View {
        if sidePane { sidePlayer } else { mainBody }
    }

    // MARK: Side pane (left half of an open foldable while another tab fills the right half)

    private var sidePlayer: some View {
        // The same desk as the Live tab, and no safe-area override: it gets exactly the frame the left page has on the Live
        // tab, so it does not change size or position when you switch.
        ZStack(alignment: .topLeading) {
            HWDesk(album: album ? theme.main.color : nil)
                .frame(width: paneWidth > 0 ? paneWidth : nil)
                .frame(maxWidth: .infinity, alignment: .leading)
            DuoLeftPage(showBoard: $showBoard, canPlay: canPlay, sidePane: true)
                .frame(width: paneWidth > 0 ? paneWidth : nil)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .ignoresSafeArea(.container, edges: [.bottom, .leading])
        .environment(\.hwMode, mode)
        .onAppear { audio.startPolling() }
    }

    // MARK: Main

    private var mainBody: some View {
        GeometryReader { geo in
            // Whatever the system keeps at the right edge (corner bar, clock): the window is wider than this view.
            let windowW = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first?.keyWindow?.bounds.width ?? geo.size.width
            let strip = hSize == .regular ? max(0, windowW - geo.frame(in: .global).maxX) : 0
            ZStack(alignment: .topLeading) {
                if hSize == .regular {
                    HWDesk(album: album ? theme.main.color : nil)
                    // The system keeps a strip on the right for its corner bar. The two pages still split the real screen in half
                    // (so the fold never cuts through an amp) and the right page keeps that strip clear itself.
                    duoContent(trailingInset: strip)
                        .frame(width: geo.size.width + strip, height: geo.size.height)
                } else {
                    PhoneLiveDesk(canPlay: canPlay, drawerOpen: $drawerOpen, lockedNote: phoneNote) { drawerContent }
                        .frame(width: geo.size.width, height: geo.size.height)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
        }
        // Open foldable / iPad: the amps run to the bottom and left edges of the screen (their corners line up with the phone's).
        .ignoresSafeArea(.container, edges: hSize == .regular ? [.bottom, .leading] : [])
        .background(Color.black.ignoresSafeArea())
        .environment(\.hwMode, mode)
        .overlay { EmojiRainOverlay() }
        .trackHalfFolded($halfFolded)
        .overlay {
            if showBoard && hSize == .regular {
                LiveBoardView(canPlay: canPlay, glow: glowColor, stacked: true, onExit: { withAnimation(.easeInOut(duration: 0.25)) { showBoard = false } })
                    .ignoresSafeArea().transition(.opacity)
            }
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
        .onAppear {
            audio.startPolling(); ArtTheme.shared.start()
            Task { await VoteStore.shared.refresh() }
            if BoardState.shared.wantBoard && hSize == .regular { BoardState.shared.wantBoard = false; showBoard = true }
            BoardState.shared.phoneBoard = landscapePhone; BoardState.shared.duoBoard = showBoard
            // Open Duo: the system leaves the tab bar hidden after a tab switch, and only a change in this flag brings it back.
            if hSize == .regular && !showBoard { BoardState.shared.nudgeDuo() }
        }
        .onDisappear {
            BoardState.shared.phoneBoard = false; BoardState.shared.duoBoard = false
            if hSize != .regular { audio.stopPolling() }
        }
    }

    // MARK: Roomy layout (open foldable, iPad, wide windows)

    /// Two desks, like an open book. ArrangementView puts them side by side, and stacks them top and bottom when the device is
    /// propped up like a tabletop: the show on top, the touch controls on the stable half.
    @ViewBuilder private func duoContent(trailingInset: CGFloat) -> some View {
        if #available(iOS 27.1, *) {
            ArrangementView {
                DuoLeftPage(showBoard: $showBoard, canPlay: canPlay, desktop: true)
            } secondary: {
                DuoRightPage(canPlay: canPlay, desktop: true, trailingInset: trailingInset)
            }
        } else {
            HStack(spacing: 0) {
                DuoLeftPage(showBoard: $showBoard, canPlay: canPlay, desktop: true)
                DuoRightPage(canPlay: canPlay, desktop: true, trailingInset: trailingInset)
            }
        }
    }

    // MARK: Drawer (phone)

    /// Shown on the cover when someone is signed in but cannot listen.
    private var phoneNote: String? { (auth.isSignedIn && !auth.canListenLive) ? lockedMessage : nil }

    private var lockedMessage: String {
        guard auth.isSignedIn, let u = auth.currentUser else {
            return "Sign in to listen, or start a free 3-day guest trial."
        }
        return u.isGuest
            ? "Your guest access has ended. Ask a student to sponsor you."
            : "Listening isn't available right now."
    }

    /// What the pull-up drawer holds, top to bottom: the host's note, the poll, ratings and song links, who is tuned in,
    /// the reaction keys, and the credit.
    private var drawerContent: some View {
        VStack(spacing: 16) {
            if !auth.isSignedIn {
                Text(auth.canListenLive ? "Sign in for reminders and more." : lockedMessage)
                    .font(BRFont.body(13, .medium)).foregroundColor(Color.hwCream.opacity(0.78))
                    .multilineTextAlignment(.center)
            }
            if let note = audio.nowPlaying?.note, !(note.headline.isEmpty && note.message.isEmpty) {
                VStack(spacing: 3) {
                    if !note.headline.isEmpty { Text(note.headline).font(BRFont.body(14, .bold)) }
                    if !note.message.isEmpty { Text(note.message).font(BRFont.body(13)) }
                }
                .foregroundStyle(Color.hwInk)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(HWPlate(color: Color(hex: "C5E7D1")))
            }
            if auth.isSignedIn && auth.canListenLive {
                VotePanel(compact: true)
            }
            LiveExtrasView(mode: .rest)
            TunedInRow()
            LiveExtrasView(mode: .emojis)
            if drawerIsQuiet {
                Text("Polls, ratings and reactions show up here while a show is on.")
                    .font(BRFont.body(14)).multilineTextAlignment(.center)
                    .foregroundStyle(Color.hwCream.opacity(0.75))
                    .padding(.horizontal, 14)
            }
            communityKeys
            DesignedByCredit()
        }
        .padding(.top, 4)
    }

    /// True when none of the live extras have anything to show (nothing on air, or the station is not open yet).
    private var drawerIsQuiet: Bool {
        let hasNote = audio.nowPlaying?.note.map { !($0.headline.isEmpty && $0.message.isEmpty) } ?? false
        return !(auth.isSignedIn && auth.canListenLive) && !hasNote
    }

    /// Join and links, as steel keys.
    private var communityKeys: some View {
        VStack(spacing: 12) {
            if !auth.isSignedIn { Link(destination: BabsonLinks.join) {
                Label("Join Babson Sound", systemImage: "person.badge.plus")
                    .font(BRFont.body(15, .bold)).modifier(HWKeyInk())
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(HWKeyFace(corner: 12))
            } }
            HStack(spacing: 22) {
                Link("Privacy", destination: BabsonLinks.privacy)
                if let ig = BabsonLinks.instagram {
                    Link(destination: ig) { HStack(spacing: 6) { InstagramGlyph(size: 16); Text("Instagram") } }
                }
            }
            .font(BRFont.body(14, .medium))
            .foregroundColor(Color.hwCream.opacity(0.85))
        }
        .padding(.horizontal, 14)
    }
}

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

/// The time, big, like a desk clock: "1:19" with a small AM/PM and the date underneath. Used on the full screen board.
/// Updates once a minute.
struct BigClock: View {
    var size: CGFloat
    var alignment: HorizontalAlignment = .center
    var accent: Color
    var show: String = ""
    var onDark: Bool = false
    @Environment(\.colorScheme) private var scheme

    private var ink: Color { onDark ? .hwCream : (scheme == .dark ? .brDkText : .brLtText) }

    var body: some View {
        TimelineView(.everyMinute) { context in
            let parts = Self.timeParts(context.date)
            VStack(alignment: alignment, spacing: size * 0.04) {
                HStack(alignment: .firstTextBaseline, spacing: size * 0.08) {
                    Text(parts.time)
                        .font(BRFont.display(size))
                        .foregroundColor(ink)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    if !parts.suffix.isEmpty {
                        Text(parts.suffix)
                            .font(BRFont.display(size * 0.26))
                            .foregroundColor(accent)
                    }
                }
                Text(Self.dateLine(context.date))
                    .font(BRFont.body(max(13, size * 0.15), .semibold))
                    .foregroundColor(ink.opacity(0.7))
                if !show.isEmpty {
                    Text(show)
                        .font(BRFont.body(max(12, size * 0.11), .semibold))
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
        return f.string(from: date)
    }
}

/// Whether the full screen board is up. Read by ContentView, which is the only place that shows or hides the tab bar.
final class BoardState: ObservableObject {
    static let shared = BoardState()
    /// An iPhone turned sideways (the board comes up by itself).
    @Published var phoneBoard = false
    /// The open Duo / iPad: the board the person opened with the full screen button. Tracked on its own, apart from the phone.
    @Published var duoBoard = false
    /// Set by the full screen button on the left page while another tab is showing: bring up the board on the Live tab.
    @Published var wantBoard = false
    var open: Bool { phoneBoard || duoBoard }

    /// Flips the Duo tracker on and right back off so the tab bar gets a fresh show instruction.
    func nudgeDuo() {
        duoBoard = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { [weak self] in self?.duoBoard = false }
    }
}

/// Lettering on a steel key: cream normally, dark ink on light aluminum keys inside the black drawer.
struct HWKeyInk: ViewModifier {
    @Environment(\.hwLightKeys) private var lightKeys
    func body(content: Content) -> some View { content.foregroundStyle(Color.white).shadow(color: .black.opacity(0.55), radius: 0, x: 0, y: 1) }
}
