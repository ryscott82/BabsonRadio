import SwiftUI
import MediaPlayer

// MARK: - Live Player Screen

struct LivePlayerView: View {
    @StateObject private var audio = AudioPlayerManager.shared
    @StateObject private var auth = AuthManager.shared
    @ObservedObject private var presence = PresenceManager.shared
    @Environment(\.colorScheme) var scheme
    @State private var showProfileSheet = false

    /// Signed-out visitors can preview the stream.
    private var canPlay: Bool { auth.canListenLive || !auth.isSignedIn }

    /// The on-air event's color, or the station gold/green.
    private var accent: Color {
        if let hex = audio.nowPlaying?.color, !hex.isEmpty { return Color(hex: hex) }
        return scheme == .dark ? .brGold : .brGreen
    }

    var body: some View {
        GeometryReader { geo in
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {

                // ── Header ──────────────────────────────────────────
                headerRow(topInset: geo.safeAreaInsets.top)
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 24)

                // ── Player Card ─────────────────────────────────────
                PlayerArtCard()
                    .padding(.horizontal, 20)

                // ── Now Playing Info ────────────────────────────────
                nowPlayingInfo
                    .padding(.horizontal, 24)
                    .padding(.top, 24)

                // "3 people in your MKT 3500 class are listening"
                if !presence.groups.isEmpty {
                    VStack(spacing: 4) {
                        ForEach(presence.groups.prefix(3)) { g in
                            Text(g.text)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(accent)
                        }
                    }
                    .padding(.top, 14)
                }

                // ── Play / Stop Control ─────────────────────────────
                playControl
                    .padding(.top, 28)
                    .opacity(canPlay ? 1 : 0.4)

                if !auth.isSignedIn {
                    Text("You're previewing the live stream. Sign in or create a free account from the Profile tab for reminders, friends and more.")
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.top, 12)
                } else if !auth.canListenLive {
                    Text(lockedMessage)
                        .font(.system(size: 13))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.top, 12)
                }

                // ── Volume row ──────────────────────────────────────
                volumeRow
                    .padding(.horizontal, 32)
                    .padding(.top, 24)

                communitySection
                    .padding(.top, 36)
                    .padding(.bottom, 40)
                }
            }
            .background {
                ZStack {
                    (scheme == .dark ? Color.brDkBg : Color.brLtBg)
                    LiveVisualizer(color: accent, playing: audio.isPlaying)
                }
                .ignoresSafeArea()
            }
            .ignoresSafeArea(edges: .top)
        }
        .alert("Enjoying Babson Radio?", isPresented: $audio.showSignInPrompt) {
            Button("Create account or sign in") { showProfileSheet = true }
            Button("Keep listening", role: .cancel) {}
        } message: {
            Text("Create a free account to get show reminders and see who is tuned in. The music keeps playing.")
        }
        .sheet(isPresented: $showProfileSheet) { ProfileView() }
        .onAppear { audio.startPolling() }
        .onDisappear { audio.stopPolling() }
    }

    // MARK: - Sub-views

    private func headerRow(topInset: CGFloat) -> some View {
        HStack {
            // Logo wordmark
            VStack(alignment: .leading, spacing: 0) {
                Text("BABSON")
                    .font(BRFont.display(13))
                    .foregroundColor(scheme == .dark ? .brGold : .brGreen)
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
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                BRTagChip(text: audio.nowPlaying?.isLive == true ? "LIVE DJ" : "LIVE", style: .gold)
                BRTagChip(text: ScheduleItem.sampleSchedule.first(where: { $0.isLive })?.showName.uppercased() ?? "BABSON RADIO", style: .subtle)
                Spacer()
            }

            let song = audio.nowPlaying.flatMap { $0.title.isEmpty ? nil : $0 }
            Text(song?.title ?? "Babson Radio")
                .font(BRFont.display(song == nil ? 34 : 28))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                .kerning(1)
                .lineLimit(2)

            Text(song.map { $0.artist.isEmpty ? "Babson Radio" : $0.artist } ?? "Live Stream")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)

            if let title = audio.nowPlaying?.showTitle, !title.isEmpty {
                Text("On air: \(title)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(accent)
            }

            if let song, song.isLive, !song.streamer.isEmpty {
                Text("Live with \(song.streamer)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brGold : .brGreen)
            }

            if let song, song.duration > 0 {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    let t = song.elapsed + ctx.date.timeIntervalSince(audio.nowPlayingFetchedAt)
                    ProgressView(value: min(max(t / song.duration, 0), 1))
                        .tint(scheme == .dark ? .brGold : .brGreen)
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

    private var playControl: some View {
        Button(action: { if canPlay { audio.toggle() } }) {
            ZStack {
                Circle()
                    .fill(scheme == .dark ? Color.brGold : Color.brGreen)
                    .frame(width: 72, height: 72)
                    .shadow(color: (scheme == .dark ? Color.brGold : Color.brGreen).opacity(0.35),
                            radius: 16, x: 0, y: 6)

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
            SystemVolumeSlider(tint: scheme == .dark ? .brGold : .brGreen)
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
                .background(scheme == .dark ? Color.brGold : Color.brGreen)
                .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }

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
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(scheme == .dark ? Color.brGold : Color.brGreen, lineWidth: 1.5))
                .foregroundColor(scheme == .dark ? .brGold : .brGreen)
            }

            HStack(spacing: 22) {
                Link("About us", destination: BabsonLinks.about)
                Link("Privacy", destination: BabsonLinks.privacy)
                Link("Events", destination: BabsonLinks.events)
                if let ig = BabsonLinks.instagram {
                    Link(destination: ig) {
                        HStack(spacing: 5) { Image(systemName: "camera"); Text("Instagram") }
                    }
                }
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(scheme == .dark ? .brGold : .brGreen)
        }
        .padding(.horizontal, 24)
    }

    private var scheduleSection: some View {
        VStack(spacing: 0) {
            BRSectionHeader(title: "TODAY'S SCHEDULE")
                .padding(.horizontal, 20)
                .padding(.bottom, 16)

            VStack(spacing: 1) {
                ForEach(ScheduleItem.sampleSchedule) { item in
                    ScheduleRow(item: item)
                }
            }
            .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1)
            )
            .padding(.horizontal, 20)
        }
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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
    @State private var changedAt = Date.distantPast
    @State private var wasPlaying = false

    private var animated: Bool { !lowPower && !reduceMotion && scenePhase == .active }

    var body: some View {
        Group {
            if animated {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
                    let c = color, p = playing, was = wasPlaying, at = changedAt
                    Canvas { ctx, size in LiveVisualizer.draw(&ctx, size, tl.date, c, p, was, at) }
                }
            } else {
                LinearGradient(colors: [color.opacity(0.28), color.opacity(0.05), .clear],
                               startPoint: .top, endPoint: .bottom)
            }
        }
        .allowsHitTesting(false)
        .onAppear { wasPlaying = playing }
        .onChange(of: playing) { _, now in wasPlaying = !now; changedAt = Date() }
        .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange)) { _ in
            lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        }
    }

    nonisolated private static func draw(_ ctx: inout GraphicsContext, _ size: CGSize, _ date: Date,
                                         _ color: Color, _ playing: Bool, _ wasPlaying: Bool, _ changedAt: Date) {
        let t = date.timeIntervalSinceReferenceDate
        // Ease between calm (paused) and lively (playing) over about a second.
        let k = min(max(date.timeIntervalSince(changedAt) / 1.2, 0), 1)
        let from = wasPlaying ? 1.0 : 0.25, to = playing ? 1.0 : 0.25
        let energy = from + (to - from) * k
        let beat = pow(max(0, sin(t * 2 * .pi * 118 / 60)), 5)
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
