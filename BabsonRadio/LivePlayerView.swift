import SwiftUI
import MediaPlayer

// MARK: - Live Player Screen

struct LivePlayerView: View {
    @StateObject private var audio = AudioPlayerManager.shared
    @StateObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) var scheme

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

                // ── Play / Stop Control ─────────────────────────────
                playControl
                    .padding(.top, 28)
                    .opacity(auth.canListenLive ? 1 : 0.4)

                if !auth.canListenLive {
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

                // ── Schedule ────────────────────────────────────────
                scheduleSection
                    .padding(.top, 36)
                    .padding(.bottom, 40)
                }
            }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
            .ignoresSafeArea(edges: .top)
        }
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
        }
        .animation(.easeInOut(duration: 0.25), value: audio.isPlaying)
        .padding(.top, topInset)
    }

    private var nowPlayingInfo: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                BRTagChip(text: "LIVE", style: .gold)
                BRTagChip(text: ScheduleItem.sampleSchedule.first(where: { $0.isLive })?.showName.uppercased() ?? "AUTO DJ", style: .subtle)
                Spacer()
            }

            Text(ScheduleItem.sampleSchedule.first(where: { $0.isLive })?.showName ?? "Auto DJ")
                .font(BRFont.display(34))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                .kerning(1)

            Text(ScheduleItem.sampleSchedule.first(where: { $0.isLive })?.host ?? "Curated Mix")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
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
        Button(action: { if auth.canListenLive { audio.toggle() } }) {
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

    var body: some View {
        ZStack(alignment: .bottomLeading) {

            // Base: near-black gradient
            RoundedRectangle(cornerRadius: 20)
                .fill(
                    LinearGradient(
                        colors: scheme == .dark
                            ? [Color(hex: "0C1A13"), Color(hex: "080808")]
                            : [Color(hex: "1A2E22"), Color(hex: "0A1A10")],
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
                .fill(Color.brGreen.opacity(0.18))
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
