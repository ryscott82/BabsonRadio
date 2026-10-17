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

    private var np: NowPlayingInfo? { audio.nowPlaying }
    private var autoPlay: Bool { (np?.title.isEmpty == false) && np?.isLive != true && np?.isShow != true }
    private var key: String { "\(np?.title ?? "")|\(np?.playedAt ?? 0)|\(auth.isSignedIn)|\(autoPlay)" }

    var body: some View {
        Group {
            if auth.isSignedIn, let sk = model.skip, sk.eligible {
                Button { Task { await model.ask() } } label: {
                    Image(systemName: "forward.end.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(onDark ? .white : (scheme == .dark ? .brDkText : .brLtText))
                        .frame(width: 48, height: 48)
                        .brGlass(in: Circle(), interactive: true)
                }
                .buttonStyle(.plain)
                .disabled(sk.mine)
                .opacity(sk.mine ? 0.6 : 1)
                .accessibilityLabel(sk.mine ? "You asked to skip this song" : "Ask to skip this song")
                // The count hangs below the button without changing its size, so the button lines up with the play button.
                .overlay(alignment: .top) {
                    VStack(spacing: 2) {
                        Text("\(sk.votes)/\(sk.needed)")
                            .font(.system(size: 11)).monospacedDigit()
                            .foregroundColor(onDark ? .white.opacity(0.7) : (scheme == .dark ? .brDkSub : .brLtSub))
                        if !model.error.isEmpty {
                            Text(model.error).font(.system(size: 11)).foregroundColor(.brRed)
                                .multilineTextAlignment(.center).frame(width: 150)
                        }
                    }
                    .fixedSize()
                    .offset(y: 52)
                }
            } else if auth.isSignedIn {
                // Not skippable right now (a live show, or the station's skip link isn't set up): show it dimmed so it never just vanishes.
                Image(systemName: "forward.end.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(onDark ? .white : (scheme == .dark ? .brDkText : .brLtText))
                    .frame(width: 48, height: 48)
                    .brGlass(in: Circle(), interactive: false)
                    .opacity(0.35)
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
            if playing {
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
