import Combine
import SwiftUI
import UIKit

// MARK: - Open foldable / iPad Live pages
// Two pages side by side (like the design board, design/DuoD), each holding one big amp:
//   left:  the record and sleeve, and the "now playing" amp (title, progress, EQ, volume, play, skip)
//   right: the "join in" amp (reactions, poll, ratings, today's schedule)
// Each page is laid out on a 391 pt wide canvas and scaled to fill its half, so the hinge never cuts through anything
// and the content is as large as the screen allows.

/// Lays a page out on a canvas at least 391 pt wide and `minH` tall, scaled up to fill the space.
/// The canvas grows wider or taller than that to match the half, and the closure gets its width, height and the scale,
/// so the page can spread out instead of leaving wood on the sides.
private struct DuoCanvas<Content: View>: View {
    /// Strip kept clear on the right (where the system corner bar and clock live on a phone-sized foldable).
    var rightReserve: CGFloat = 0
    var minH: CGFloat = 680
    @ViewBuilder var content: (_ w: CGFloat, _ h: CGFloat, _ k: CGFloat) -> Content

    var body: some View {
        GeometryReader { geo in
            let availW = max(1, geo.size.width - rightReserve)
            let availH = max(1, geo.size.height)
            let k = min(availW / 391, availH / minH)
            let wc = availW / k, hc = availH / k
            content(wc, hc, k)
                .frame(width: wc, height: hc, alignment: .top)
                .scaleEffect(k, anchor: .topLeading)
                .frame(width: availW, height: availH, alignment: .topLeading)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
                .background(VolumeHost().frame(width: 1, height: 1).allowsHitTesting(false), alignment: .topLeading)
        }
    }
}

/// Letters carved into the wood: a dark floor that is deepest under the top edge, and a thin light line where the
/// bottom edge catches the light. The grain shows through the carved part.
private struct EtchedText: View {
    var text: String
    var size: CGFloat
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let t = Text(text).font(BRFont.display(size)).tracking(2.5)
        let night = scheme == .dark
        ZStack {
            // On the dark oak the carved part is near black and the lit lower edge does most of the work.
            t.foregroundStyle(Color(hex: "F7DDB3").opacity(night ? 0.42 : 0.55)).offset(y: night ? 1.6 : 1.3)
            t.foregroundStyle(LinearGradient(colors: night ? [Color.black, Color(hex: "1C1008")] : [Color(hex: "180B03"), Color(hex: "5A3515")],
                                             startPoint: .top, endPoint: .bottom))
                .opacity(night ? 0.95 : 0.9)
                .blendMode(.multiply)
        }
        .lineLimit(1).minimumScaleFactor(0.6)
        .accessibilityRepresentation { Text(text) }
    }
}

/// One big amp: leather (or the ivory face in light mode) with screws, sized by its content or by `height`.
private struct DuoAmp<Content: View>: View {
    var height: CGFloat? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .frame(maxWidth: .infinity, maxHeight: height == nil ? nil : .infinity, alignment: .topLeading)
            .hwPanel(corner: 20, padding: 20)
            .overlay(alignment: .topLeading) { HWScrew().padding(9) }
            .overlay(alignment: .topTrailing) { HWScrew().padding(9) }
            .overlay(alignment: .bottomLeading) { HWScrew().padding(9) }
            .overlay(alignment: .bottomTrailing) { HWScrew().padding(9) }
            .frame(height: height)
    }
}

/// Today's schedule, one slim block inside the right amp.
@MainActor
final class TodayModel: ObservableObject {
    @Published var items: [ScheduleEntry] = []
    func load() async {
        if let r: ScheduleFeedResponse = try? await BackendAPI.get("/api/schedule?days=1&back=0") {
            items = r.items.filter { $0.format != "playlist" && $0.endAt > Date() }.sorted { $0.startAt < $1.startAt }
        }
    }
}

private let hourFmt: DateFormatter = {
    let f = DateFormatter(); f.setLocalizedDateFormatFromTemplate("j"); return f
}()

struct DuoSchedulePanel: View {
    @Environment(\.hwMode) private var hwm
    @StateObject private var model = TodayModel()
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("On the air today").font(BRFont.body(15, .bold))
                Spacer()
                Button { TabRouter.shared.request = 1 } label: {
                    Text("See the week").font(BRFont.body(13, .semibold)).foregroundColor(hwm.isLight ? Color(hex: "006644") : Color(hex: "6FCF93"))
                }.buttonStyle(.plain)
            }
            ForEach(Array(model.items.prefix(2))) { e in
                let live = e.startAt <= Date() && e.endAt > Date()
                HStack(spacing: 8) {
                    Text(hourFmt.string(from: e.startAt)).font(BRFont.body(14, .bold)).frame(width: 50, alignment: .leading)
                    Text(e.title).font(BRFont.body(14, .semibold)).lineLimit(1)
                    Spacer(minLength: 0)
                    if live { Text("LIVE").font(BRFont.body(11, .bold)).foregroundColor(Color(hex: "D9402A")) }
                }
            }
            if model.items.isEmpty {
                Text("Nothing scheduled. The station is playing its own music.")
                    .font(BRFont.body(13)).foregroundColor(hwm.onPanelSub)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task { await model.load() }
    }
}

/// "23 tuned in" and a row of steel avatars.
struct TunedInRow: View {
    @Environment(\.hwMode) private var hwm
    @ObservedObject private var presence = PresenceManager.shared
    private static let colors = ["DA6A56", "569A6D", "4887B0", "BC7348", "896DAE", "C69D45", "469898", "B76087", "7C8948"]
    var body: some View {
        VStack(spacing: 8) {
            if presence.count > 0 {
                Text(presence.friendsLine ?? "\(presence.count) tuned in")
                    .font(BRFont.body(12)).foregroundColor(hwm.onPanelSub)
            }
            if !presence.friends.isEmpty {
                HStack(spacing: -4) {
                    ForEach(Array(presence.friends.prefix(9).enumerated()), id: \.offset) { i, f in
                        HWAvatar(text: String(f.firstName.prefix(1)).uppercased(), color: Color(hex: Self.colors[i % Self.colors.count]), size: 24)
                            .zIndex(Double(100 - i))
                    }
                    let rest = presence.count - min(presence.friends.count, 9)
                    if rest > 0 {
                        HWAvatar(text: "+\(rest)", color: Color(hex: "E4E4E0"), size: 24).zIndex(0)
                    }
                }
            }
            ForEach(presence.groups.prefix(3)) { g in
                Text(g.text).font(BRFont.body(12, .semibold)).foregroundColor(Color(hex: "6FCF93"))
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: Left page

/// The record peeking out from behind its sleeve, `s` is the sleeve's side.
private struct DuoArt: View {
    var s: CGFloat
    var image: UIImage?
    var label: Color
    var body: some View {
        ZStack(alignment: .topLeading) {
            DeskRecord(size: s * 0.925, label: label).offset(x: s * 0.346, y: s * 0.053)
            DeskSleeve(image: image, size: s).rotationEffect(.degrees(-2))
        }
        .frame(width: s * 1.27, height: s, alignment: .topLeading)
    }
}

struct DuoLeftPage: View {
    @Environment(\.hwMode) private var hwm
    @Binding var showBoard: Bool
    var canPlay: Bool
    /// Beside another tab (landscape foldable). Looks exactly the same; only the full screen button acts differently.
    var sidePane = false
    @ObservedObject private var vol = SystemVolume.shared
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var theme = ArtTheme.shared

    private var np: NowPlayingInfo? { audio.nowPlaying }
    private var album: Bool { theme.albumOn }
    private var led: Color { album ? theme.palette.first.map { $0.mixed(with: .init(r: 1, g: 1, b: 1), 0.15).color } ?? .hwLED : .hwLED }
    private var titleText: String { (np?.title.isEmpty == false) ? np!.title : "Babson Radio" }
    private var subText: String {
        guard let np, !np.title.isEmpty else { return "Live from campus" }
        if np.onAir, let show = np.showTitle, !show.isEmpty, np.showOnly != true {
            return np.streamer.isEmpty ? show : "\(show) with \(np.streamer)"
        }
        return np.artist.isEmpty ? "Babson Radio" : np.artist
    }

    var body: some View {
        DuoCanvas { w, hc, _ in
            // The amp is about 350 pt tall; the sleeve takes what is left (and never more than the width allows).
            let s = max(150, min((w - 24) / 1.27, 330, hc - 350 - 56))
            VStack(spacing: 0) {
                artRow(s).padding(.leading, 12)
                Spacer(minLength: 10)
                amp
            }
            // The amp runs into the bottom left corner of the screen; its corner lines up with the phone's.
            .padding(.leading, 0).padding(.trailing, 12).padding(.top, 24).padding(.bottom, 0)
        }
    }

    private func artRow(_ s: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            DuoArt(s: s, image: audio.coverImage, label: album ? theme.main.color : Color(hex: "3A3A36"))
                .overlay(alignment: .bottomTrailing) {
                    // Full screen: small, in the corner of the art so it stays out of the way. The same on every tab:
                    // beside another tab it goes back to Live and opens the board there.
                    Button {
                        if sidePane {
                            BoardState.shared.wantBoard = true
                            TabRouter.shared.request = 0
                        } else {
                            withAnimation(.easeInOut(duration: 0.25)) { showBoard = true }
                        }
                    } label: {
                        Image(systemName: "arrow.up.left.and.arrow.down.right").font(.system(size: 13, weight: .bold))
                    }
                    .buttonStyle(HWRoundKeyStyle(size: 34))
                    .offset(x: 2, y: 2)
                    .accessibilityLabel("Full screen")
                }
                .frame(maxWidth: .infinity)
            if np?.onAir == true {
                HWOnAirLamp(playing: audio.isPlaying, beat: audio.beatClock)
                    .scaleEffect(1.2, anchor: .topLeading).offset(x: -2, y: -18)
            }
        }
        .frame(height: s)
    }

    // MARK: The now playing amp

    private var amp: some View {
        DuoAmp {
            VStack(alignment: .leading, spacing: 10) {
                Text(titleText)
                    .font(BRFont.display(40)).foregroundStyle(hwm.onPanelText)
                    .lineLimit(1).minimumScaleFactor(0.5)
                    .shadow(color: .black.opacity(0.45), radius: 0, x: 0, y: 1)
                Text(subText)
                    .font(BRFont.body(18, .medium)).foregroundStyle(hwm.onPanelSub)
                    .lineLimit(1).minimumScaleFactor(0.7)

                if let song = np, song.duration > 0 {
                    TimelineView(.periodic(from: .now, by: 1)) { ctx in
                        let t = song.elapsed + ctx.date.timeIntervalSince(audio.nowPlayingFetchedAt)
                        HWSlot(progress: t / song.duration, fill: led, height: 10)
                    }
                    .padding(.top, 4)
                }
                if let next = np?.next {
                    Text("Next: \(next.title)\(next.artist.isEmpty ? "" : " · \(next.artist)")")
                        .font(BRFont.body(13)).foregroundStyle(hwm.onPanelSub).lineLimit(1)
                }

                HWEQWell(color: led, playing: audio.isPlaying, beat: audio.beatClock)
                    .frame(height: 58)
                    .padding(.top, 2)

                controls
            }
        }
    }

    /// Volume knob, play key, skip knob.
    private var controls: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 12) {
                HWDial(size: 52, value: Binding(get: { vol.level }, set: { vol.level = $0 }), onChange: { vol.set($0) })
                    .frame(width: 52, height: 52)
                knobLabel("Volume")
            }
            .padding(.top, 16)
            Spacer(minLength: 0)
            Button { if canPlay { audio.toggle() } } label: {
                Group {
                    if audio.isBuffering {
                        ProgressView().progressViewStyle(.circular).tint(Color.hwCream).scaleEffect(1.3)
                    } else {
                        Image(systemName: audio.isPlaying ? "stop.fill" : "play.fill")
                            .font(.system(size: 30, weight: .bold))
                            .offset(x: audio.isPlaying ? 0 : 2)
                    }
                }
            }
            .buttonStyle(HWRoundKeyStyle(size: 84, lit: audio.isPlaying))
            .opacity(canPlay ? 1 : 0.4)
            .accessibilityLabel(audio.isPlaying ? "Stop" : "Play")
            Spacer(minLength: 0)
            VStack(spacing: 12) {
                SkipControl().frame(width: 52, height: 52)
                knobLabel("Skip")
            }
            .padding(.top, 16)
        }
        .padding(.horizontal, 6)
    }

    private func knobLabel(_ text: String) -> some View {
        Text(text)
            .font(BRFont.body(12, .semibold)).tracking(0.2)
            .foregroundStyle(hwm.onPanelSub)
            .frame(width: 64)
    }
}

// MARK: Right page

struct DuoRightPage: View {
    @Environment(\.hwMode) private var hwm
    var canPlay: Bool
    /// The strip along the right edge that the system keeps for its corner bar and clock.
    var trailingInset: CGFloat = 0
    @ObservedObject private var auth = AuthManager.shared

    private var etch: some View {
        Rectangle().fill(hwm.onPanelText.opacity(0.16)).frame(height: 1)
    }

    var body: some View {
        DuoCanvas(rightReserve: trailingInset) { _, h, k in
            // A header band the height of the profile button's row, with the station name in it.
            let band = 76 / k
            VStack(spacing: 0) {
                EtchedText(text: "Babson Radio", size: 38)
                    .frame(maxWidth: .infinity, minHeight: band, maxHeight: band, alignment: .center)
                    .padding(.horizontal, 24)

                DuoAmp(height: h - band) {
                    VStack(spacing: 0) {
                        // Reaction keys (this one also keeps the live counts and star data loading).
                        LiveExtrasView(mode: .reactions).padding(.horizontal, -24)

                        if auth.isSignedIn && auth.canListenLive {
                            Spacer(minLength: 10); etch; Spacer(minLength: 10)
                            VotePanel(compact: true, title: "What would you like to hear?", large: true)
                        }

                        Spacer(minLength: 10); etch; Spacer(minLength: 10)
                        LiveExtrasView(mode: .ratings).padding(.horizontal, -24)

                        Spacer(minLength: 10); etch; Spacer(minLength: 10)
                        DuoSchedulePanel()

                        TunedInRow().padding(.top, 8)
                    }
                }
                .padding(.horizontal, 12)
            }
        }
    }
}
