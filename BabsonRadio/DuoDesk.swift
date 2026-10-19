import Combine
import SwiftUI
import UIKit

// MARK: - Open foldable / iPad Live pages
// Two 391 x 844 desks side by side, like the design board (design/DuoD): the record, sleeve and amp on the left,
// a stack of leather panels (poll, ratings, controls, schedule, sleep timer) on the right.
// Each page scales to its own half, so the hinge never cuts through anything.

/// A leather panel designed at a fixed size and scaled to fit.
struct ScaledPanel<Content: View>: View {
    var designW: CGFloat = 350
    var designH: CGFloat
    var scale: CGFloat = 0.9
    var corner: CGFloat = 18
    @Environment(\.hwMode) private var mode
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack(alignment: .topLeading) {
            HWLeather(tint: mode.leatherTint, corner: corner, stitch: true)
                .frame(width: designW, height: designH)
            ForEach(0..<4, id: \.self) { i in
                HWScrew().offset(x: i % 2 == 0 ? 8 : designW - 17, y: i < 2 ? 8 : designH - 17)
            }
            content()
                .foregroundStyle(mode.onPanelText)
                .frame(width: designW, height: designH, alignment: .topLeading)
        }
        .frame(width: designW, height: designH, alignment: .topLeading)
        .scaleEffect(scale, anchor: .topLeading)
        .frame(width: designW * scale, height: designH * scale, alignment: .topLeading)
    }
}

/// Today's schedule for the little panel on the right page.
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
                Text("On the air today").font(BRFont.body(14, .bold))
                Spacer()
                Button { TabRouter.shared.request = 1 } label: {
                    Text("See the week").font(BRFont.body(12, .semibold)).foregroundColor(Color(hex: "6FCF93"))
                }.buttonStyle(.plain)
            }
            ForEach(Array(model.items.prefix(2))) { e in
                let live = e.startAt <= Date() && e.endAt > Date()
                HStack(spacing: 8) {
                    Text(hourFmt.string(from: e.startAt)).font(BRFont.body(13, .bold)).frame(width: 46, alignment: .leading)
                    Text(e.title).font(BRFont.body(13, .semibold)).lineLimit(1)
                    Spacer(minLength: 0)
                    if live { Text("LIVE").font(BRFont.body(10, .bold)).foregroundColor(Color(hex: "FF6B55")) }
                }
            }
            if model.items.isEmpty { Text("Nothing scheduled. The station is playing its own music.").font(BRFont.body(12)).foregroundColor(hwm.onPanelSub) }
        }
        .padding(.horizontal, 18).padding(.top, 14)
        .task { await model.load() }
    }
}

struct DuoSleepPanel: View {
    @Environment(\.hwMode) private var hwm
    @ObservedObject private var guardian = ListenGuard.shared
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var auth = AuthManager.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Sleep timer").font(BRFont.body(14, .semibold))
                Spacer()
                if let end = guardian.sleepEnd {
                    TimelineView(.periodic(from: .now, by: 30)) { _ in
                        Text("Stops in \(max(1, Int((end.timeIntervalSinceNow / 60).rounded(.up)))) min")
                            .font(BRFont.body(12)).foregroundColor(hwm.onPanelSub)
                    }
                }
            }
            HStack(spacing: 0) {
                ForEach([("Off", 0), ("15", 15), ("30", 30), ("60", 60)], id: \.1) { item in
                    let chosen = item.1 == 0 ? guardian.sleepEnd == nil : isChosen(item.1)
                    Spacer(minLength: 0)
                    Button { guardian.setSleep(item.1 == 0 ? nil : item.1) } label: {
                        Text(item.0).font(BRFont.body(15, .bold))
                            .foregroundColor(chosen ? Color(hex: "6FCF93") : hwm.onPanelText)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(HWKeyStyle(corner: 12, lit: chosen, height: 40))
                    .frame(width: 70)
                    Spacer(minLength: 0)
                }
            }
            .disabled(!(audio.isPlaying && auth.isSignedIn))
            .opacity(audio.isPlaying && auth.isSignedIn ? 1 : 0.5)
        }
        .padding(.horizontal, 18).padding(.top, 16)
    }

    /// Which preset the running timer is closest to (the timer only stores when it ends).
    private func isChosen(_ m: Int) -> Bool {
        guard let end = guardian.sleepEnd else { return false }
        let left = end.timeIntervalSinceNow / 60
        guard left > 0 else { return false }
        let preset = left <= 15 ? 15 : (left <= 30 ? 30 : 60)
        return preset == m
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

struct DuoLeftPage: View {
    @Environment(\.hwMode) private var hwm
    @Binding var showBoard: Bool
    var canPlay: Bool
    /// Beside another tab (landscape foldable): the bottom panel holds the transport instead of "tuned in".
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
        GeometryReader { geo in
            let k = min(geo.size.width / 391, geo.size.height / 844)
            canvas
                .frame(width: 391, height: 844, alignment: .topLeading)
                .scaleEffect(k, anchor: .topLeading)
                .frame(width: 391 * k, height: 844 * k, alignment: .topLeading)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
                .background(VolumeHost().frame(width: 1, height: 1).allowsHitTesting(false), alignment: .topLeading)
        }
    }

    private var canvas: some View {
        ZStack(alignment: .topLeading) {
            DeskRecord(size: 296, label: album ? theme.main.color : Color(hex: "3A3A36")).offset(x: 88, y: 87)
            DeskSleeve(image: audio.coverImage, size: 338).rotationEffect(.degrees(-2)).offset(x: 22, y: 66)
            if np?.onAir == true {
                HWOnAirLamp(playing: audio.isPlaying, beat: audio.beatClock)
                    .scaleEffect(1.2, anchor: .topLeading).offset(x: 10, y: 49)
            }
            if !sidePane {
                Button { withAnimation(.easeInOut(duration: 0.25)) { showBoard = true } } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right").font(.system(size: 15, weight: .bold))
                }
                .buttonStyle(HWRoundKeyStyle(size: 40))
                .offset(x: 338, y: 22)
                .accessibilityLabel("Full screen")
            }

            // Amp: what is playing.
            ZStack(alignment: .topLeading) {
                HWLeather(tint: HWModeResolver.tint(album: album, color: theme.main.color), corner: 20, stitch: true)
                    .frame(width: 342, height: 252)
                ForEach(0..<4, id: \.self) { i in HWScrew().offset(x: i % 2 == 0 ? 9 : 342 - 18, y: i < 2 ? 9 : 252 - 18) }
                VStack(alignment: .leading, spacing: 4) {
                    Text(titleText).font(BRFont.display(44)).foregroundStyle(hwm.onPanelText)
                        .lineLimit(1).minimumScaleFactor(0.5).frame(height: 46, alignment: .bottomLeading)
                    Text(subText).font(BRFont.body(18, .medium)).foregroundStyle(hwm.onPanelSub).lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(width: 298, alignment: .leading).offset(x: 24, y: 22)

                if let song = np, song.duration > 0 {
                    TimelineView(.periodic(from: .now, by: 1)) { ctx in
                        let t = song.elapsed + ctx.date.timeIntervalSince(audio.nowPlayingFetchedAt)
                        HWSlot(progress: t / song.duration, fill: led, height: 10)
                    }
                    .frame(width: 294).offset(x: 24, y: 118)
                }
                if let next = np?.next {
                    Text("Next: \(next.title)\(next.artist.isEmpty ? "" : " · \(next.artist)")")
                        .font(BRFont.body(13)).foregroundStyle(hwm.onPanelSub).lineLimit(1)
                        .frame(width: 298, alignment: .leading).offset(x: 24, y: 140)
                }
                HWEQWell(color: led, playing: audio.isPlaying, beat: audio.beatClock)
                    .frame(width: 298, height: 60).offset(x: 22, y: 170)
            }
            .frame(width: 342, height: 252, alignment: .topLeading)
            .offset(x: 24, y: 424)

            if sidePane {
                ScaledPanel(designH: 112, scale: 0.977) {
                    ZStack(alignment: .topLeading) {
                        HWDial(size: 46, value: Binding(get: { vol.level }, set: { vol.level = $0 }), onChange: { vol.set($0) })
                            .offset(x: 40, y: 34)
                        Button { if canPlay { audio.toggle() } } label: {
                            Image(systemName: audio.isPlaying ? "stop.fill" : "play.fill").font(.system(size: 24, weight: .bold)).offset(x: audio.isPlaying ? 0 : 2)
                        }
                        .buttonStyle(HWRoundKeyStyle(size: 64, lit: audio.isPlaying)).opacity(canPlay ? 1 : 0.4)
                        .offset(x: 143, y: 18)
                        SkipControl(size: 46).frame(width: 46, height: 46).offset(x: 262, y: 34)
                    }
                }
                .offset(x: 24, y: 696)
            } else {
                ScaledPanel(designH: 112, scale: 0.977) { TunedInRow().padding(.top, 22) }
                    .offset(x: 24, y: 696)
            }
        }
    }
}

enum HWModeResolver {
    static func tint(album: Bool, color: Color) -> Color? { album ? color : nil }
}

// MARK: Right page

struct DuoRightPage: View {
    @Environment(\.hwMode) private var hwm
    var canPlay: Bool
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var auth = AuthManager.shared
    @ObservedObject private var vol = SystemVolume.shared
    private var np: NowPlayingInfo? { audio.nowPlaying }

    var body: some View {
        GeometryReader { geo in
            let k = min(geo.size.width / 391, geo.size.height / 844)
            canvas
                .frame(width: 391, height: 844, alignment: .topLeading)
                .scaleEffect(k, anchor: .topLeading)
                .frame(width: 391 * k, height: 844 * k, alignment: .topLeading)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
                .background(VolumeHost().frame(width: 1, height: 1).allowsHitTesting(false), alignment: .topLeading)
        }
    }

    private var canvas: some View {
        ZStack(alignment: .topLeading) {
            if auth.isSignedIn && auth.canListenLive {
                ScaledPanel(designH: 238) {
                    VotePanel(compact: true, title: "What would you like to hear?", large: true)
                        .padding(.horizontal, 22).padding(.top, 20)
                }
                .offset(x: 7, y: 24)
            }
            ScaledPanel(designH: 142) {
                LiveExtrasView(mode: .ratings)
                    .padding(.top, 16)
            }
            .offset(x: 7, y: 252)

            // Controls
            ScaledPanel(designH: 190, corner: 20) {
                ZStack(alignment: .topLeading) {
                    HWDial(size: 50, value: Binding(get: { vol.level }, set: { vol.level = $0 }), onChange: { vol.set($0) })
                        .offset(x: 36, y: 28)
                    Button { if canPlay { audio.toggle() } } label: {
                        Image(systemName: audio.isPlaying ? "stop.fill" : "play.fill").font(.system(size: 28, weight: .bold)).offset(x: audio.isPlaying ? 0 : 2)
                    }
                    .buttonStyle(HWRoundKeyStyle(size: 76, lit: audio.isPlaying)).opacity(canPlay ? 1 : 0.4)
                    .offset(x: 139, y: 14)
                    SkipControl(size: 48).frame(width: 48, height: 48).offset(x: 268, y: 30)
                    HStack { Text("Volume"); Spacer(); Text("Ask to skip") }
                        .font(BRFont.body(12)).foregroundStyle(hwm.onPanelSub)
                        .padding(.horizontal, 24).offset(y: 100)
                    LiveExtrasView(mode: .reactions).frame(width: 350).offset(y: 128)
                }
            }
            .offset(x: 7, y: 394)

            ScaledPanel(designH: 112) { DuoSchedulePanel() }.offset(x: 7, y: 579)
            ScaledPanel(designH: 112) { DuoSleepPanel() }.offset(x: 7, y: 694)

        }
    }
}
