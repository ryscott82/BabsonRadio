import SwiftUI
import Combine

/// Next-track button for beside play/pause, same as the website: a round button with "X/Y requested" under it.
/// Only shows when the station is playing its own music (not a live show) and the listener is signed in.
@MainActor
final class SkipModel: ObservableObject {
    @Published var skip: SkipReply? = nil
    @Published var error = ""

    func load() async {
        skip = try? await BackendAPI.get("/api/skip")
    }

    func ask() async {
        error = ""
        do { skip = try await BackendAPI.post("/api/skip", [:]) }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }
}

struct SkipControl: View {
    @Environment(\.colorScheme) private var scheme
    @StateObject private var model = SkipModel()
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var auth = AuthManager.shared
    @ObservedObject private var theme = ArtTheme.shared
    /// Light-on-dark styling for the full screen board.
    var onDark = false
    /// Diameter of the key (52 on the phone, 48 on the open foldable).
    var size: CGFloat = 52

    private var np: NowPlayingInfo? { audio.nowPlaying }
    private var autoPlay: Bool { (np?.title.isEmpty == false) && np?.isLive != true && np?.isShow != true }
    private var key: String { "\(np?.title ?? "")|\(np?.playedAt ?? 0)|\(auth.isSignedIn)|\(autoPlay)" }

    private func knobIcon(_ dim: Bool = false) -> some View {
        Image(systemName: "forward.end.fill")
            .font(.system(size: 18, weight: .semibold))
            .opacity(dim ? 0.55 : 1)
    }

    var body: some View {
        Group {
            if auth.isSignedIn, let sk = model.skip, sk.eligible {
                Button { Task { await model.ask() } } label: { knobIcon() }
                .buttonStyle(HWRoundKeyStyle(size: size, lit: sk.mine))
                .disabled(sk.mine)
                .accessibilityLabel(sk.mine ? "You asked to skip this song" : "Ask to skip this song")
                // The count sits on the key like a small badge, so the key keeps the volume knob's size.
                .overlay(alignment: .topTrailing) {
                    VStack(spacing: 2) {
                        Text("\(sk.votes)/\(sk.needed)")
                            .font(BRFont.body(11, .semibold)).monospacedDigit()
                            .foregroundColor(Color.hwCream.opacity(0.78))
                        if !model.error.isEmpty {
                            Text(model.error).font(BRFont.body(11)).foregroundColor(Color(hex: "FFB4A8"))
                                .multilineTextAlignment(.center).frame(width: 150)
                        }
                    }
                    .fixedSize()
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background(Capsule().fill(Color.black.opacity(0.7)))
                    .offset(x: 12, y: -8)
                }
            } else if auth.isSignedIn {
                // Not skippable right now (a live show, or the station's skip link isn't set up): show it dimmed so it never just vanishes.
                ZStack { HWRoundKeyFace(size: size, pressed: true); knobIcon(true).hwEngraved().offset(y: 2) }
                    .frame(width: size, height: size)
                    .opacity(0.5)
                    .accessibilityLabel("Skip is not available right now")
            }
        }
        // The polling lives on an always-present empty view: modifiers on a Group with nothing in it never run,
        // which is why the button never appeared.
        .background(
            Color.clear.frame(width: 1, height: 1)
                .task(id: key) {
                    guard auth.isSignedIn, autoPlay else { model.skip = nil; return }
                    // Check the count every 10 seconds while the station's own music plays.
                    while !Task.isCancelled { await model.load(); try? await Task.sleep(nanoseconds: 10_000_000_000) }
                }
        )
    }
}

/// The equalizer icon beside the play button. Playing: the bars hit on the same beat as the background (the song's real tempo
/// when known, else 118 BPM). Paused: the same icon, still.
struct EqualizerBars: View {
    let color: Color
    var playing = true
    var beat: BeatClock? = nil
    @ObservedObject private var power = PowerState.shared

    private static let rest: [Double] = [0.45, 0.8, 0.6, 0.95]   // heights when still, 0...1
    private static let lift: [Double] = [0.5, 0.2, 0.4, 0.05]    // how far each bar jumps on the beat

    private func bars(_ values: [Double]) -> some View {
        HStack(alignment: .center, spacing: 4) {
            ForEach(0..<4, id: \.self) { i in
                Capsule().fill(color).frame(width: 4, height: 8 + 22 * values[i])
            }
        }
        .frame(width: 28, height: 32)
    }

    /// Driven by the clock, not by a looping animation on state. A repeat-forever animation tied to state also animates the view's
    /// position whenever the layout changes (rotating, unfolding, split view), which scattered the bars around the screen.
    var body: some View {
        Group {
            if playing && !power.lowPower {
                TimelineView(.animation) { tl in
                    // The same pulse the background uses, so they hit together.
                    let t = tl.date.timeIntervalSinceReferenceDate
                    let pulse = beat.map { pow(max(0, cos(2 * .pi * $0.phase(at: tl.date))), 5) }
                        ?? pow(max(0, sin(t * 2 * .pi * 118 / 60)), 5)
                    bars((0..<4).map { min(1, Self.rest[$0] * 0.55 + Self.lift[$0] * pulse + 0.2) })
                }
            } else {
                bars(Self.rest).opacity(0.55)
            }
        }
        .fixedSize()
        .accessibilityHidden(true)
    }
}
