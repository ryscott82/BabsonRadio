import SwiftUI
import UIKit
import CoreImage.CIFilterBuiltins

// MARK: - Full screen board
// Just the music, big, on the desk. Two designs (design/LbD sideways phone, design/DuoFsD open Duo / iPad).
// No equalizer and no record here: the cover, what is playing, reaction keys and a QR code to react from a phone.
// The play/skip/volume strip fades away a few seconds after you stop touching the screen.

enum QRCode {
    static func image(_ text: String) -> UIImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(text.utf8)
        f.correctionLevel = "M"
        guard let out = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
              let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// A cream plate with a QR code that opens the website, so anyone in the room can react to the stream.
struct QRPlate: View {
    var size: CGFloat
    var body: some View {
        ZStack {
            Color(hex: "F4EFE2")
            HWTile(name: HWTex.cface, opacity: 0.28, blend: .multiply)
            if let img = QRCode.image("https://babsonradio.com") {
                Image(uiImage: img).interpolation(.none).resizable().scaledToFit()
                    .padding(size * 0.08).blendMode(.multiply)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.1, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: size * 0.1, style: .continuous).strokeBorder(Color.black.opacity(0.2), lineWidth: 1))
        .shadow(color: .black.opacity(0.4), radius: 4, x: 0, y: 3)
        .accessibilityLabel("QR code for babsonradio.com")
    }
}

/// A vertical volume slot for the sideways phone board.
struct VerticalVolume: View {
    @ObservedObject private var vol = SystemVolume.shared
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                Capsule().fill(Color.black.opacity(0.6))
                    .overlay(Capsule().strokeBorder(Color.black, lineWidth: 1))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(0.10), lineWidth: 1).offset(y: 1).mask(Capsule()))
                Capsule().fill(Color.hwCream.opacity(0.85))
                    .frame(height: max(geo.size.width - 6, geo.size.height * CGFloat(vol.level) - 6))
                    .padding(3)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { g in
                vol.set(1 - Double(g.location.y / geo.size.height))
            })
        }
        .accessibilityLabel("Volume")
        .accessibilityValue("\(Int(vol.level * 100)) percent")
    }
}

struct LiveBoardView: View {
    let canPlay: Bool
    let glow: Color
    var showClock: Bool = false
    /// Stacked: the open foldable and iPad design (cover on the left page, title panel on the right).
    var stacked = false
    var onExit: (() -> Void)? = nil
    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var theme = ArtTheme.shared
    @State private var awake = true
    @State private var hideTask: Task<Void, Never>?

    private var np: NowPlayingInfo? { audio.nowPlaying }
    private var hasSong: Bool { np?.title.isEmpty == false }
    private var album: Bool { theme.albumOn }
    private var mode: HWMode { album ? .album(theme.main.color) : .dark }

    private var titleText: String { hasSong ? (np?.title ?? "") : "Babson Radio" }
    private var subText: String {
        guard hasSong, let np else { return "Live from campus" }
        if np.onAir, let show = np.showTitle, !show.isEmpty, np.showOnly != true {
            return np.streamer.isEmpty ? show : "\(show) with \(np.streamer)"
        }
        return np.artist.isEmpty ? "Babson Radio" : np.artist
    }
    private var nextText: String? {
        guard hasSong, let next = np?.next else { return nil }
        return "Next: \(next.title)\(next.artist.isEmpty ? "" : " · \(next.artist)")"
    }

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
            let design = stacked ? CGSize(width: 1248, height: 844) : CGSize(width: 844, height: 390)
            let k = min(geo.size.width / design.width, geo.size.height / design.height)
            ZStack {
                HWDesk(album: album ? theme.main.color : nil)
                Group { if stacked { stackedCanvas } else { sidewaysCanvas } }
                    .frame(width: design.width, height: design.height, alignment: .topLeading)
                    .scaleEffect(k, anchor: .center)
                    .frame(width: geo.size.width, height: geo.size.height)
                transport
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .background(VolumeHost().frame(width: 1, height: 1).allowsHitTesting(false), alignment: .topLeading)
        }
        .environment(\.hwMode, mode)
        .contentShape(Rectangle())
        .onTapGesture { wake() }
        .onAppear { wake() }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
    }

    // MARK: Sideways phone (844 x 390)

    private var sidewaysCanvas: some View {
        ZStack(alignment: .topLeading) {
            Color.clear
            if np?.onAir == true {
                HWOnAirLamp(playing: audio.isPlaying, beat: audio.beatClock).scaleEffect(1.2, anchor: .topLeading).offset(x: 69, y: 13)
            }
            DeskSleeve(image: audio.coverImage, size: 330).offset(x: 81, y: 30)

            ZStack(alignment: .topLeading) {
                HWLeather(tint: mode.leatherTint, corner: 18, stitch: true).frame(width: 380, height: 236)
                ForEach(0..<4, id: \.self) { i in HWScrew().offset(x: i % 2 == 0 ? 8 : 380 - 17, y: i < 2 ? 8 : 236 - 17) }
                VStack(alignment: .leading, spacing: 4) {
                    HWTitleLine(text: titleText, size: 52, height: 98)
                        .frame(maxWidth: .infinity, alignment: .bottomLeading)
                    Text(subText).font(BRFont.body(22, .medium)).foregroundStyle(Color(hex: "B1AA94")).lineLimit(1).minimumScaleFactor(0.7)
                    if let n = nextText {
                        Text(n).font(BRFont.body(14)).foregroundStyle(Color(hex: "B1AA94")).lineLimit(1).frame(width: 250, alignment: .leading)
                    }
                }
                .frame(width: 336, alignment: .leading).offset(x: 24, y: 20)
                HStack(spacing: 8) {
                    Text("React to the stream:").font(BRFont.body(12, .semibold)).foregroundStyle(Color.hwCream.opacity(0.78))
                    QRPlate(size: 46)
                }
                .frame(width: 380 - 48, alignment: .trailing).offset(x: 24, y: 236 - 20 - 46)
                if showClock {
                    BigClock(size: 44, alignment: .trailing, accent: glow, onDark: true).frame(width: 150).offset(x: 380 - 160, y: 14)
                }
            }
            .frame(width: 380, height: 236, alignment: .topLeading)
            .offset(x: 440, y: 52)

            ZStack(alignment: .topLeading) {
                HWLeather(tint: mode.leatherTint, corner: 16, stitch: true).frame(width: 380, height: 64)
                ReactionKeys(count: 4, keyW: 70, keyH: 44, glyph: 26, corner: 13).frame(width: 380, height: 64)
            }
            .frame(width: 380, height: 64, alignment: .topLeading)
            .offset(x: 440, y: 304)

            VerticalVolume().frame(width: 34, height: 126).offset(x: 12, y: 132)
        }
    }

    // MARK: Open foldable / iPad (1248 x 844)

    private var stackedCanvas: some View {
        ZStack(alignment: .topLeading) {
            Color.clear
            Text("Babson Radio").font(BRFont.body(13, .semibold)).tracking(5).foregroundStyle(Color.hwCream.opacity(0.55))
                .frame(width: 624).offset(x: 0, y: 40)
            if np?.onAir == true {
                HWOnAirLamp(playing: audio.isPlaying, beat: audio.beatClock).scaleEffect(1.2, anchor: .topLeading).offset(x: 28, y: 125)
            }
            DeskSleeve(image: audio.coverImage, size: 560).offset(x: 40, y: 142)

            ZStack(alignment: .topLeading) {
                HWLeather(tint: mode.leatherTint, corner: 22, stitch: true).frame(width: 500, height: 330)
                ForEach(0..<4, id: \.self) { i in HWScrew().offset(x: i % 2 == 0 ? 9 : 500 - 18, y: i < 2 ? 9 : 330 - 18) }
                VStack(alignment: .leading, spacing: 6) {
                    HWTitleLine(text: titleText, size: 68, height: 84)
                    Text(subText).font(BRFont.body(28, .medium)).foregroundStyle(Color(hex: "B1AA94")).lineLimit(1).minimumScaleFactor(0.7)
                    if let n = nextText {
                        Text(n).font(BRFont.body(16)).foregroundStyle(Color(hex: "B1AA94")).lineLimit(1).frame(width: 330, alignment: .leading)
                    }
                }
                .frame(width: 440, alignment: .leading).offset(x: 32, y: 62)
                VStack(alignment: .trailing, spacing: 6) {
                    QRPlate(size: 84)
                    Text("React to the stream:").font(BRFont.body(12, .semibold)).foregroundStyle(Color.hwCream.opacity(0.78))
                }
                .offset(x: 500 - 28 - 130, y: 330 - 24 - 112).frame(width: 130, alignment: .trailing)
                if showClock {
                    BigClock(size: 54, alignment: .trailing, accent: glow, onDark: true).frame(width: 190).offset(x: 500 - 214, y: 14)
                }
            }
            .frame(width: 500, height: 330, alignment: .topLeading)
            .offset(x: 706, y: 168)

            ZStack(alignment: .topLeading) {
                HWLeather(tint: mode.leatherTint, corner: 20, stitch: true).frame(width: 500, height: 84)
                ReactionKeys(count: 4, keyW: 106, keyH: 56, glyph: 32, corner: 13).frame(width: 500, height: 84)
            }
            .frame(width: 500, height: 84, alignment: .topLeading)
            .offset(x: 706, y: 534)

            Button { onExit?() } label: {
                Label("Exit full screen", systemImage: "arrow.down.right.and.arrow.up.left")
                    .font(BRFont.body(13, .bold)).padding(.horizontal, 12)
            }
            .buttonStyle(HWKeyStyle(corner: 22, lit: false, height: 44))
            .offset(x: 706, y: 640)
        }
    }

    // MARK: Transport (fades away)

    private var transport: some View {
        VStack {
            Spacer()
            HStack(spacing: 18) {
                Button { if canPlay { audio.toggle() } } label: {
                    Image(systemName: audio.isBuffering ? "ellipsis" : (audio.isPlaying ? "stop.fill" : "play.fill"))
                        .font(.system(size: 18, weight: .bold))
                }
                .buttonStyle(HWRoundKeyStyle(size: 44, lit: audio.isPlaying)).opacity(canPlay ? 1 : 0.4)
                .accessibilityLabel(audio.isPlaying ? "Stop" : "Play")
                SkipControl(size: 44).frame(width: 44, height: 44)
            }
            .padding(.horizontal, 20).padding(.vertical, 10)
            .background(Capsule().fill(Color.black.opacity(0.35)))
            .padding(.bottom, 6)
            .opacity(awake ? 1 : 0).allowsHitTesting(awake)
        }
    }
}
