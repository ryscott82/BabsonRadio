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
                VStack(spacing: 4) {
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
                    Text("\(sk.votes)/\(sk.needed) requested")
                        .font(.system(size: 11)).monospacedDigit()
                        .foregroundColor(onDark ? .white.opacity(0.7) : (scheme == .dark ? .brDkSub : .brLtSub))
                    if !model.error.isEmpty {
                        Text(model.error).font(.system(size: 11)).foregroundColor(.brRed)
                            .multilineTextAlignment(.center).frame(maxWidth: 150)
                    }
                }
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

/// The little equalizer bars beside the play button while music plays.
struct EqualizerBars: View {
    let color: Color
    @State private var up = false

    var body: some View {
        HStack(alignment: .center, spacing: 4) {
            ForEach(0..<4, id: \.self) { i in
                Capsule().fill(color)
                    .frame(width: 4, height: up ? 30 : 8)
                    .animation(.easeInOut(duration: 0.45 + Double(i) * 0.09).repeatForever(autoreverses: true).delay(Double(i) * 0.12), value: up)
            }
        }
        .frame(height: 32)
        .onAppear { up = true }
        .accessibilityHidden(true)
    }
}
