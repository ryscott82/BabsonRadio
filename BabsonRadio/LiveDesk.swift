import Combine
import SwiftUI
import UIKit
import MediaPlayer
import AVFoundation

// MARK: - Live desk: the iPhone Live screen, drawn as one 390 x 844 desk and scaled to fit.
// Geometry comes from the design board (design/IosFD): sleeve and record on the oak, the ON AIR sign top left,
// one leather amp panel (title, LED display, volume knob, play key, skip knob, reaction keys) and a drawer lip underneath.

// MARK: System volume (the real device volume, same level as the hardware buttons)

@MainActor
final class SystemVolume: ObservableObject {
    static let shared = SystemVolume()
    @Published var level: Double = Double(AVAudioSession.sharedInstance().outputVolume)
    let volumeView = MPVolumeView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
    private var observation: NSKeyValueObservation?

    private init() {
        observation = AVAudioSession.sharedInstance().observe(\.outputVolume, options: [.new]) { [weak self] _, change in
            let v = Double(change.newValue ?? 0)
            Task { @MainActor in self?.level = v }
        }
    }

    func set(_ v: Double) {
        let c = min(max(v, 0), 1)
        level = c
        (volumeView.subviews.first { $0 is UISlider } as? UISlider)?.setValue(Float(c), animated: false)
    }
}

/// An invisible MPVolumeView. It has to be in the window for the system to let us set the volume.
struct VolumeHost: UIViewRepresentable {
    func makeUIView(context: Context) -> MPVolumeView {
        let v = SystemVolume.shared.volumeView
        v.alpha = 0.01
        v.isUserInteractionEnabled = false
        return v
    }
    func updateUIView(_ uiView: MPVolumeView, context: Context) {}
}

// MARK: - Round steel key and knob

/// The steel play and skip knobs: machined concentric rings on a brushed silver face, with a dark halo. Pushed in while "on".
struct HWRoundKeyFace: View {
    var size: CGFloat
    var pressed = false
    var body: some View {
        let cols = ["838281", "D9D8D3", "6B6A66", "ECEBE6", "7C7B77", "D3D2CD", "838281"].map { Color(hex: $0) }
        ZStack {
            Circle().fill(Color.black.opacity(pressed ? 0.34 : 0.28))
                .frame(width: size + 12, height: size + 12)
                .overlay(Circle().strokeBorder(Color.white.opacity(0.08), lineWidth: 1))
            ZStack {
                Circle().fill(AngularGradient(colors: cols, center: .center, angle: .degrees(30)))
                Canvas { ctx, sz in
                    let c = CGPoint(x: sz.width / 2, y: sz.height / 2)
                    var r = sz.width / 2 - 0.5
                    var light = false
                    while r > 1 {
                        ctx.stroke(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)),
                                   with: .color(light ? Color.white.opacity(0.07) : Color.black.opacity(0.07)), lineWidth: 1)
                        r -= 1; light.toggle()
                    }
                    let ir = sz.width * 0.37
                    ctx.stroke(Path(ellipseIn: CGRect(x: c.x - ir, y: c.y - ir, width: ir * 2, height: ir * 2)),
                               with: .color(Color.black.opacity(0.22)), lineWidth: 1)
                }
                Circle().strokeBorder(LinearGradient(colors: [Color.white.opacity(pressed ? 0 : 0.65), .clear], startPoint: .top, endPoint: .center), lineWidth: 2)
                Circle().strokeBorder(LinearGradient(colors: [.clear, Color.black.opacity(pressed ? 0.5 : 0.35)], startPoint: .center, endPoint: .bottom), lineWidth: 3)
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .brightness(pressed ? -0.07 : 0)
            .shadow(color: .black.opacity(0.5), radius: pressed ? 3 : 8, x: 0, y: pressed ? 3 : 10)
            .offset(y: pressed ? 2 : 0)
        }
        .frame(width: size, height: size)
    }
}

struct HWRoundKeyStyle: ButtonStyle {
    var size: CGFloat
    var lit = false
    func makeBody(configuration: Configuration) -> some View {
        let down = configuration.isPressed || lit
        ZStack {
            HWRoundKeyFace(size: size, pressed: down)
            configuration.label
                .foregroundStyle(Color.hwKnobInk)
                .offset(y: down ? 2 : 0)
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

/// The knurled volume knob with its ring of dots. Drag up and down to turn it.
struct HWDial: View {
    @Environment(\.hwMode) private var mode
    var size: CGFloat = 52
    @Binding var value: Double          // 0...1
    var onChange: (Double) -> Void
    @State private var startValue: Double? = nil
    private let dots = 11

    var body: some View {
        let lit = Int((value * Double(dots)).rounded())
        let angle = -90 + 180 * value
        ZStack {
            // The ring of dots: west, over the top, to east. Lit ones are cream, the rest dim.
            ForEach(0..<dots, id: \.self) { i in
                let th = Double.pi - Double(i) * Double.pi / Double(dots - 1)
                let r = size * 0.73
                Circle()
                    .fill(i < lit ? mode.onPanelText : mode.onPanelText.opacity(0.35))
                    .frame(width: 4, height: 4)
                    .offset(x: CGFloat(cos(th)) * r, y: -CGFloat(sin(th)) * r)
            }
            // The well the knob sits in.
            Circle()
                .fill(Color.black.opacity(0.4))
                .overlay(Circle().fill(RadialGradient(colors: [.black.opacity(0.38), .black.opacity(0.05)], center: .center, startRadius: size * 0.2, endRadius: size * 0.65)))
                .frame(width: size * 1.3, height: size * 1.3)
            ZStack {
                Circle().fill(AngularGradient(colors: (0..<9).map { $0 % 2 == 0 ? Color(hex: "838281") : Color(hex: "373938") }, center: .center))
                Circle().fill(RadialGradient(colors: [.white.opacity(0.4), .clear], center: UnitPoint(x: 0.35, y: 0.25), startRadius: 0, endRadius: size * 0.55))
                Circle().strokeBorder(Color.white.opacity(0.22), lineWidth: 0.7)
                Circle().inset(by: size * 0.17)
                    .fill(Color.clear)
                    .overlay(Circle().inset(by: size * 0.17).fill(Color(hex: "14140F").opacity(0.55)))
                    .overlay(HWTile(name: HWTex.kface, opacity: 0.8).clipShape(Circle().inset(by: size * 0.17)))
                Capsule()
                    .fill(LinearGradient(colors: [Color(hex: "F6EFE0"), Color(hex: "BDB397")], startPoint: .top, endPoint: .bottom))
                    .frame(width: 3.6, height: size * 0.25)
                    .offset(y: -size * 0.33)
                    .rotationEffect(.degrees(angle))
            }
            .frame(width: size, height: size)
            .shadow(color: .black.opacity(0.5), radius: 4, x: 0, y: 4)
        }
        .frame(width: size, height: size)
        .contentShape(Circle().inset(by: -10))
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { g in
                    if startValue == nil { startValue = value }
                    let v = min(max((startValue ?? value) - Double(g.translation.height) / 140 + Double(g.translation.width) / 280, 0), 1)
                    value = v
                    onChange(v)
                }
                .onEnded { _ in startValue = nil }
        )
        .accessibilityElement()
        .accessibilityLabel("Volume")
        .accessibilityValue("\(Int(value * 100)) percent")
        .accessibilityAdjustableAction { dir in
            let v = min(max(value + (dir == .increment ? 0.0625 : -0.0625), 0), 1)
            value = v; onChange(v)
        }
    }
}

// MARK: - LED display

/// A spectrum on black glass. The columns follow the real audio (AudioSpectrum), or the song's beat when no audio is available,
/// and fall away slowly when you pause, like a real display.
/// Smoothed 0...1 "how loud is the show" value. Stepped once per frame, so a missed state change can never leave the bars stuck.
final class EQEnergy: @unchecked Sendable {
    private var value = 0.0
    private var last = Date.distantPast
    func step(playing: Bool, at date: Date) -> Double {
        let dt = last == .distantPast ? 0.04 : min(0.25, max(0, date.timeIntervalSince(last)))
        last = date
        let target = playing ? 1.0 : 0.0
        let rate = playing ? 7.0 : 2.2            // rise in about 0.3 s, fall in about 1.4 s
        value += (target - value) * min(1, rate * dt)
        if abs(target - value) < 0.002 { value = target }
        return value
    }
}

struct HWEQ: View {
    var color: Color
    var playing: Bool
    var beat: BeatClock?
    @State private var energy = EQEnergy()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObservedObject private var power = PowerState.shared

    var body: some View {
        // Low Power Mode: the meter stops (all segments unlit) instead of animating.
        TimelineView(.animation(minimumInterval: 1.0 / 24.0, paused: (reduceMotion && !playing) || power.lowPower)) { tl in
            let still = power.lowPower
            let e = still ? 0 : energy.step(playing: playing, at: tl.date)
            let c = color, bc = beat, d = tl.date
            let z = HWEQ.zones(base: color)
            let live = playing && !still ? AudioSpectrum.shared.snapshot(at: d) : nil     // real bands from the audio; nil falls back to the beat motion
            Canvas { ctx, size in HWEQ.draw(&ctx, size, d, z, e, bc, live) }
        }
        .accessibilityHidden(true)
    }

    /// Meter colors: saturated station green, yellow near the top, red at the peak, like a real level meter. In album-color mode
    /// yellow and red appear only when the cover itself has them; otherwise the whole meter stays in the cover's color.
    struct Zones: Sendable { var green: Color; var yellow: Color; var red: Color }
    @MainActor static func zones(base: Color) -> Zones {
        let t = ArtTheme.shared
        guard t.albumOn else { return Zones(green: Color(hex: "00B86F"), yellow: Color(hex: "F5C400"), red: Color(hex: "FF4A2E")) }
        func pick(_ ok: (Double) -> Bool) -> Color? {
            t.palette.first { let h = $0.hsl; return h.s > 0.4 && h.l > 0.2 && ok(h.h) }?.color
        }
        let y = pick { $0 >= 40 && $0 <= 70 }, r = pick { $0 <= 15 || $0 >= 345 }
        return Zones(green: base, yellow: y ?? base, red: r ?? y ?? base)
    }

    nonisolated private static func draw(_ ctx: inout GraphicsContext, _ size: CGSize, _ date: Date,
                                         _ zones: Zones, _ energy: Double, _ clock: BeatClock?, _ live: [Float]?) {
        let t = date.timeIntervalSinceReferenceDate
        var pulse = pow(max(0, sin(t * 2 * .pi * 118 / 60)), 4)
        if let clock { let v = pow(max(0, cos(2 * .pi * clock.phase(at: date))), 4); if v.isFinite { pulse = v } }

        let cols = 28, segs = 11
        let gap: CGFloat = 2
        let cw = (size.width - gap * CGFloat(cols - 1)) / CGFloat(cols)
        let sh = (size.height - gap * CGFloat(segs - 1)) / CGFloat(segs)
        guard cw > 0, sh > 0 else { return }
        for c in 0..<cols {
            let fc = Double(c)
            let tilt = 1 - 0.45 * fc / Double(cols)                       // lows hit harder than highs
            let wob = 0.5 + 0.5 * sin(t * (1.1 + fc * 0.19) + fc * 1.7)
            let raw = (0.16 + 0.42 * wob) * tilt + 0.5 * pulse * tilt * (0.5 + 0.5 * sin(fc * 0.9 + 1))
            let level: Double
            if let live, c < live.count { level = energy * Double(live[c]) }
            else { level = energy * min(1, max(0, raw)) }
            let on = Int((level * Double(segs)).rounded())
            for s in 0..<segs {
                let lit = s < on
                let y = size.height - CGFloat(s + 1) * sh - CGFloat(s) * gap
                let rect = CGRect(x: CGFloat(c) * (cw + gap), y: y, width: cw, height: sh)
                let hot = Double(s) / Double(segs - 1)
                let col: Color = lit ? (hot > 0.9 ? zones.red : hot > 0.55 ? zones.yellow : zones.green) : Color.white
                ctx.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(col.opacity(lit ? 0.95 : 0.09)))
            }
        }
    }
}

/// The EQ well: black glass.
struct HWEQWell: View {
    var color: Color
    var playing: Bool
    var beat: BeatClock?
    var body: some View {
        ZStack {
            HWGlass(corner: 12)
            HWEQ(color: color, playing: playing, beat: beat).padding(.horizontal, 12).padding(.vertical, 9)
            LinearGradient(colors: [.white.opacity(0.08), .clear], startPoint: .top, endPoint: .bottom).frame(height: 18)
                .frame(maxHeight: .infinity, alignment: .top).allowsHitTesting(false)
        }
    }
}

// MARK: - ON AIR lamp (only while a live show is on, or the admin switch is on)

/// Smooths the lamp's brightness a little: quick to light on a hit, quick-ish to fall, so it flickers instead of buzzing.
final class LampLevel: @unchecked Sendable {
    private var value = 0.0
    private var last = Date.distantPast
    func step(target: Double, at date: Date) -> Double {
        let dt = last == .distantPast ? 0.03 : min(0.2, max(0, date.timeIntervalSince(last)))
        last = date
        let rate = target > value ? 40.0 : 11.0      // up in about 25 ms, down in about 90 ms
        value += (target - value) * min(1, rate * dt)
        return value
    }
}

struct HWOnAirLamp: View {
    var playing: Bool
    var beat: BeatClock?
    @State private var level = LampLevel()
    @ObservedObject private var power = PowerState.shared
    @ObservedObject private var theme = ArtTheme.shared
    var body: some View {
        // Follows the music live: the same real bass and level readings the equalizer uses. If the audio tap is not up yet,
        // it falls back to the song's tempo, then to a steady 118 bpm, so it is never dead while music plays.
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: power.lowPower)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            let target: Double = {
                guard playing, !power.lowPower else { return 0 }
                if let bands = AudioSpectrum.shared.snapshotFixed(at: tl.date), bands.count >= 8 {
                    let bass = Double(bands[0..<8].reduce(0, +)) / 8
                    let all = Double(bands.reduce(0, +)) / Double(bands.count)
                    let v = 0.65 * bass + 0.35 * all
                    return pow(min(1, max(0, (v - 0.12) / 0.6)), 1.2)
                }
                if let beat { return pow(max(0, cos(2 * .pi * beat.phase(at: tl.date))), 3) }
                return pow(max(0, sin(t * 2 * .pi * 118 / 60)), 3)
            }()
            let pulse = level.step(target: target, at: tl.date)
            // Deep enough to read as a flicker: dim between beats, full on the beat.
            // Only in album-color mode does it flicker properly; otherwise it just breathes a little. Low Power Mode holds it steady.
            let album = theme.albumOn
            let lamp = power.lowPower ? 0.9 : (album ? 0.55 + 0.45 * pulse : 0.86 + 0.14 * pulse)       // outside album mode: bright, with only a small beat
            let glow = power.lowPower ? 0.5 : (album ? 0.7 * pulse : 0.55 + 0.15 * pulse)
            let radius: CGFloat = power.lowPower ? 5 : (album ? 2 + 4 * pulse : 5 + 1.5 * pulse)
            let shape = RoundedRectangle(cornerRadius: 4, style: .continuous)
            Text("ON AIR")
                .font(.custom("BarlowCondensed-Bold", size: 28))
                .tracking(0.8)
                .foregroundStyle(Color(hex: "EE3A22").opacity(lamp))
                .shadow(color: Color(hex: "EE3A22").opacity(glow), radius: radius)
                .frame(width: 94, height: 33)
                .background(
                    ZStack {
                        LinearGradient(colors: [Color(hex: "0B0B0A"), Color(hex: "030303")], startPoint: .top, endPoint: .bottom)
                        HWTile(name: HWTex.glass, opacity: 0.55)
                        LinearGradient(stops: [.init(color: .white.opacity(0.12), location: 0), .init(color: .white.opacity(0.12), location: 0.3), .init(color: .clear, location: 0.3)],
                                       startPoint: UnitPoint(x: 0, y: 0.3), endPoint: UnitPoint(x: 1, y: 0.7))
                    }.clipShape(shape)
                )
                .overlay(shape.strokeBorder(Color.black, lineWidth: 1.5))
                .shadow(color: .black.opacity(0.5), radius: 4, x: 0, y: 3)
        }
        .accessibilityLabel("On air")
    }
}

// MARK: - Sleeve and record

struct DeskSleeve: View {
    var image: UIImage?
    var size: CGFloat
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 7, style: .continuous)
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFill().frame(width: size, height: size).clipped()
            } else {
                ZStack {
                    LinearGradient(colors: [Color(hex: "27302B"), Color(hex: "0E1210")], startPoint: .topLeading, endPoint: .bottomTrailing)
                    VStack(spacing: -2) {
                        Text("BABSON").font(.custom("BarlowCondensed-SemiBold", size: size * 0.075)).tracking(size * 0.025).foregroundStyle(Color.hwCream.opacity(0.7))
                        Text("RADIO").font(.custom("BarlowCondensed-Bold", size: size * 0.22)).tracking(size * 0.02).foregroundStyle(Color.hwCream.opacity(0.92))
                    }
                }
                .frame(width: size, height: size)
            }
            LinearGradient(colors: [Color.hwCream.opacity(0.14), .clear], startPoint: .topLeading, endPoint: UnitPoint(x: 0.4, y: 0.4))
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.black.opacity(0.35), lineWidth: 1))
        .shadow(color: .black.opacity(0.5), radius: 10, x: 0, y: 8)
    }
}

struct DeskRecord: View {
    var size: CGFloat
    var label: Color
    var body: some View {
        ZStack {
            Canvas { ctx, sz in
                let c = CGPoint(x: sz.width / 2, y: sz.height / 2)
                var r = sz.width / 2
                var dark = true
                while r > 0 {
                    ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)), with: .color(dark ? Color(hex: "171717") : Color(hex: "2C2C2C")))
                    r -= 1.5; dark.toggle()
                }
            }
            Circle().fill(AngularGradient(stops: [
                .init(color: .clear, location: 0), .init(color: .clear, location: 0.14),
                .init(color: Color.hwCream.opacity(0.42), location: 0.25), .init(color: .clear, location: 0.36),
                .init(color: .clear, location: 0.64), .init(color: Color.hwCream.opacity(0.34), location: 0.75),
                .init(color: .clear, location: 0.86), .init(color: .clear, location: 1)], center: .center))
            Circle().strokeBorder(LinearGradient(colors: [Color.hwCream.opacity(0.28), Color.hwCream.opacity(0.04)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1.5)
            Circle().fill(label).frame(width: size * 0.325, height: size * 0.325)
                .overlay(Circle().fill(Color(hex: "2A1A10")).frame(width: size * 0.04, height: size * 0.04))
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .shadow(color: .black.opacity(0.45), radius: 8, x: 0, y: 6)
    }
}

// MARK: - The phone Live screen

struct PhoneLiveDesk<Drawer: View>: View {
    let canPlay: Bool
    @Binding var drawerOpen: Bool
    var lockedNote: String?
    @ViewBuilder var drawer: () -> Drawer

    @ObservedObject private var audio = AudioPlayerManager.shared
    @ObservedObject private var theme = ArtTheme.shared
    @ObservedObject private var vol = SystemVolume.shared
    @Environment(\.colorScheme) private var scheme

    private var np: NowPlayingInfo? { audio.nowPlaying }
    private var onAir: Bool { np?.onAir ?? false }
    /// Canvas y of the closed drawer lip: always about 56 pt clear of the tab bar, whatever the phone's height.
    @State private var lipY: CGFloat = 700
    private var album: Bool { theme.albumOn }
    private var mode: HWMode { HWMode.resolve(album: album ? theme.main.color : nil, scheme: scheme) }
    private var led: Color { album ? theme.palette.first.map { $0.mixed(with: .init(r: 1, g: 1, b: 1), 0.15).color } ?? .hwLED : .hwLED }
    private var subColor: Color { mode.onPanelSub }

    private var titleText: String {
        guard let np, !np.title.isEmpty else { return "Babson Radio" }
        return np.title
    }
    /// A one-line title does not need the two-line slot: everything below moves up and the spare room ends up at the bottom.
    private var panelUp: CGFloat {
        let f = UIFont(name: "BarlowCondensed-Bold", size: 40) ?? UIFont.systemFont(ofSize: 40, weight: .bold)
        // Same width as the title frame (310): if it fits on one line, close the empty second line.
        let w = (titleText as NSString).size(withAttributes: [.font: f]).width
        return w <= 310 ? 38 : 0
    }
    private var panelBottom: CGFloat { 340 + 380 - panelUp }
    /// "Show name with Host" for live shows, else the artist.
    private var subText: String {
        guard let np, !np.title.isEmpty else { return "Live from campus" }
        if np.onAir, let show = np.showTitle, !show.isEmpty, np.showOnly != true {
            return np.streamer.isEmpty ? show : "\(show) with \(np.streamer)"
        }
        return np.artist.isEmpty ? "Babson Radio" : np.artist
    }

    /// A wide, nearly square screen (the iPhone Duo): no bar along the bottom and no notch to clear at the top.
    private func isWide(_ size: CGSize) -> Bool { size.height > 0 && (0.62...1.3).contains(size.width / size.height) }
    private func topInset() -> CGFloat {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first?.keyWindow?.safeAreaInsets.top ?? 0
    }
    /// How much of the desk's 56 pt top margin a wide screen can give back.
    private func topShift(_ size: CGSize) -> CGFloat { isWide(size) ? max(0, 56 - topInset()) : 0 }
    /// Strip on the right kept clear for the system tab bar that floats in the corner of a wide screen.
    private let wideRightReserve: CGFloat = 84
    private func rightReserve(_ size: CGSize) -> CGFloat { isWide(size) ? wideRightReserve : 0 }
    /// Canvas height actually needed: a wide screen's drawer sits lower, so less spare room is kept under the amp.
    private func canvasH(_ size: CGSize) -> CGFloat { isWide(size) ? 790 : 844 }

    var body: some View {
        GeometryReader { geo in
            // Closed foldable: the room above the art and the room between the amp and the drawer are the same (`gap`),
            // and the amp is a little taller so the reaction keys have air below them.
            let wide = isWide(geo.size)
            let ex: CGFloat = wide ? 18 : 0
            let gap: CGFloat = wide ? 40 + panelUp / 2 : 0
            let ampBottom: CGFloat = 340 + 380 + ex - panelUp
            let shift: CGFloat = wide ? max(0, 60 - gap) : 0
            let W: CGFloat = 390, H: CGFloat = wide ? ampBottom + gap + 34 : 844, full: CGFloat = 844
            let availW = geo.size.width - rightReserve(geo.size)
            let k = min(availW / W, geo.size.height / (H - shift))
            ZStack(alignment: .topLeading) {
                HWDesk(album: album ? theme.main.color : nil)
                canvas(extra: ex, wideLip: wide ? ampBottom + gap : nil)
                    .frame(width: W, height: full, alignment: .topLeading)
                    .offset(y: -shift)
                    .scaleEffect(k, anchor: .topLeading)
                    .frame(width: W * k, height: (H - shift) * k, alignment: .topLeading)
                    .offset(x: max(0, (availW - W * k) / 2))
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
            .animation(.easeInOut(duration: 0.2), value: panelUp)
            .background(VolumeHost().frame(width: 1, height: 1).allowsHitTesting(false), alignment: .topLeading)
            .onAppear { updateLip(k: k, shift: shift, geo: geo) }
            .onChange(of: geo.size) { _, _ in updateLip(k: k, shift: shift, geo: geo) }
            .onChange(of: panelUp) { _, _ in updateLip(k: k, shift: shift, geo: geo) }
        }
        .ignoresSafeArea()
        .environment(\.hwMode, mode)
    }

    private func updateLip(k: CGFloat, shift: CGFloat, geo: GeometryProxy) {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let screenH = scene?.screen.bounds.height ?? geo.size.height
        let originY = geo.frame(in: .global).minY
        let bottomInset = scene?.keyWindow?.safeAreaInsets.bottom ?? 34
        // A phone has a bar along the bottom; a wide screen has only the small floating bar in the corner.
        let wide = isWide(geo.size)
        let barHeight: CGFloat = wide ? 0 : 49 + bottomInset
        let margin: CGFloat = wide ? 22 : 56
        let y = (screenH - barHeight - margin - originY) / k + shift
        lipY = min(wide ? canvasH(geo.size) - 36 : 722, max(panelBottom + 10, y))
    }

    // The 390 x 844 desk.
    private func canvas(extra: CGFloat, wideLip: CGFloat?) -> some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(width: 390, height: 844)

            // Record peeking out from behind the sleeve, then the sleeve itself.
            DeskRecord(size: 246, label: album ? theme.main.color : Color(hex: "3A3A36"))
                .offset(x: 118, y: 74)
            DeskSleeve(image: audio.coverImage, size: 266)
                .rotationEffect(.degrees(-2))
                .offset(x: 26, y: 60)

            ProfileCircleButton()
                .offset(x: 390 - 16 - 38, y: 60)

            if onAir {
                HWOnAirLamp(playing: audio.isPlaying, beat: audio.beatClock)
                    .offset(x: 14, y: 45)
                    .transition(.opacity)
            }

            if let a = np?.announcement, !a.text.isEmpty {
                Text(a.text)
                    .font(BRFont.body(13, .semibold))
                    .foregroundStyle(Color.hwInk)
                    .multilineTextAlignment(.center).lineLimit(2)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .frame(width: 330)
                    .background(HWPlate(color: Color(hex: "C5E7D1")))
                    .offset(x: 30, y: 292)
            } else if let note = lockedNote {
                Text(note)
                    .font(BRFont.body(13, .semibold))
                    .foregroundStyle(Color.hwInk)
                    .multilineTextAlignment(.center).lineLimit(2)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .frame(width: 330)
                    .background(HWPlate(color: Color(hex: "F7F5F0")))
                    .offset(x: 30, y: 292)
            }

            panel(extra: extra)

            // Drawer lip and sheet.
            HWDrawerSheet(open: $drawerOpen, tint: album ? theme.main.color : Color(hex: "2F7A49"), closedY: wideLip ?? lipY) { drawer() }
        }
        .animation(.easeInOut(duration: 0.25), value: onAir)
    }

    private func panel(extra: CGFloat) -> some View {
        let up = panelUp
        let ph = 380 - up + extra
        return ZStack(alignment: .topLeading) {
            HWLeather(tint: mode.leatherTint, corner: 18, stitch: true)
                .frame(width: 366, height: ph)
            ForEach(0..<4, id: \.self) { i in
                HWScrew().offset(x: i % 2 == 0 ? 10 : 366 - 19, y: i < 2 ? 10 : ph - 19)
            }

            // Title (two lines at most, shrinks to fit) and the line under it.
            VStack(alignment: .leading, spacing: 4) {
                Text(titleText)
                    .font(BRFont.display(40))
                    .foregroundStyle(mode.onPanelText)
                    .lineLimit(2).minimumScaleFactor(0.5)
                    .lineSpacing(-2)
                    .frame(maxWidth: .infinity, minHeight: 86 - up, maxHeight: 86 - up, alignment: .bottomLeading)
                    .shadow(color: .black.opacity(0.45), radius: 0, x: 0, y: 1)
                Text(subText)
                    .font(BRFont.body(18, .medium))
                    .foregroundStyle(subColor)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(width: 310, alignment: .leading)
            .offset(x: 28, y: 20)

            HWEQWell(color: led, playing: audio.isPlaying, beat: audio.beatClock)
                .frame(width: 322, height: 58)
                .offset(x: 22, y: 138 - up)

            // Volume knob
            HWDial(size: 52, value: Binding(get: { vol.level }, set: { vol.level = $0 }), onChange: { vol.set($0) })
                .offset(x: 46, y: 224 - up)
            knobLabel("Volume").offset(x: 42, y: 288 - up)

            // Play key
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
            .offset(x: 141, y: 208 - up)
            .accessibilityLabel(audio.isPlaying ? "Stop" : "Play")

            // Skip knob
            SkipControl()
                .frame(width: 52, height: 52)
                .offset(x: 366 - 46 - 52, y: 224 - up)
            knobLabel("Skip").offset(x: 366 - 42 - 60, y: 288 - up)

            // Reaction keys
            LiveExtrasView(mode: .reactions)
                .frame(width: 366)
                .offset(x: 0, y: 312 - up)
        }
        .frame(width: 366, height: ph, alignment: .topLeading)
        .offset(x: 12, y: 340)
        .animation(.easeInOut(duration: 0.2), value: up)
    }

    private func knobLabel(_ text: String) -> some View {
        Text(text)
            .font(BRFont.body(12, .semibold))
            .tracking(0.2)
            .foregroundStyle(subColor)
            .frame(width: 60)
    }
}

/// A small cream plate for messages (station message, listening locked).
struct HWPlate: View {
    var color: Color
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
        ZStack {
            color
            HWTile(name: HWTex.cface, opacity: 0.24, blend: .multiply)
            LinearGradient(colors: [.white.opacity(0.35), .clear], startPoint: .top, endPoint: .center)
        }
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.black.opacity(0.18), lineWidth: 1))
        .shadow(color: .black.opacity(0.4), radius: 5, x: 0, y: 4)
    }
}

struct HWScrew: View {
    @Environment(\.hwMode) private var mode
    var body: some View {
        // The light amp has black glass corner caps instead of screws.
        if mode.isLight { Color.clear.frame(width: 9, height: 9) } else {
        Circle()
            .fill(RadialGradient(colors: [Color(hex: "55554C"), Color(hex: "1E1F1A")], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 8))
            .frame(width: 9, height: 9)
            .overlay(Rectangle().fill(Color.black.opacity(0.55)).frame(width: 6, height: 1).rotationEffect(.degrees(35)))
            .shadow(color: .black.opacity(0.4), radius: 0.5, x: 0, y: 1)
        }
    }
}

// MARK: - Drawer (canvas coordinates: lip at y 722, open at y 232)

struct HWDrawerSheet<Content: View>: View {
    @Binding var open: Bool
    var tint: Color
    var closedY: CGFloat = 722
    @ViewBuilder var content: () -> Content
    @GestureState private var drag: CGFloat = 0
    @Environment(\.hwMode) private var mode
    private let openY: CGFloat = 232

    var body: some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: open ? 22 : 20, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: open ? 22 : 20, style: .continuous)
        let y = min(max((open ? openY : closedY) + drag, openY), closedY)
        ZStack(alignment: .top) {
            ZStack {
                Color(hex: "0C0C0A")
                if case .dark = mode {
                    // Standard dark mode: black leather, like every other amp.
                    HWTile(name: HWTex.leatherBlack)
                    Color.black.opacity(0.6)
                } else if case .album = mode {
                    HWTile(name: HWTex.leatherGreen, opacity: 0.55)
                    tint.opacity(0.78).blendMode(.color)
                    Color.black.opacity(0.74)
                } else {
                    HWTile(name: HWTex.leatherGreen)
                    tint.opacity(0.5).blendMode(.color)
                    LinearGradient(colors: [.black.opacity(0.16), .black.opacity(0.30)], startPoint: .top, endPoint: .bottom)
                }
                LinearGradient(colors: [.white.opacity(0.10), .clear, .black.opacity(0.25)], startPoint: .top, endPoint: .bottom)
            }
            .clipShape(shape)
            .overlay(shape.strokeBorder(Color.black.opacity(0.5), lineWidth: 1))
            .shadow(color: .black.opacity(0.5), radius: 10, x: 0, y: -2)

            VStack(spacing: 0) {
                Capsule().fill(Color.hwCream).frame(width: 40, height: 4).padding(.top, 6)
                Image(systemName: open ? "chevron.down" : "chevron.up")
                    .font(.system(size: 12, weight: .bold)).foregroundStyle(Color.hwCream.opacity(0.8)).padding(.top, 3)
                // Content only exists once opened enough to read; it never takes touches while closed.
                ScrollView {
                    content()
                        .environment(\.colorScheme, .dark)
                        .environment(\.hwMode, .dark)
                        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 120)
                }
                .scrollIndicators(.hidden)
                .opacity(open ? 1 : 0)
                .allowsHitTesting(open)
            }
            .foregroundStyle(Color.hwCream)

            // Grab area: the lip while closed, the handle strip while open.
            Color.clear
                .frame(height: open ? 40 : 96)
                .contentShape(Rectangle())
                .onTapGesture { withAnimation(.spring(duration: 0.35)) { open.toggle() } }
                .gesture(
                    DragGesture(minimumDistance: 6, coordinateSpace: .global)
                        .updating($drag) { v, state, _ in state = v.translation.height }
                        .onEnded { v in
                            withAnimation(.spring(duration: 0.35)) {
                                if v.translation.height < -30 { open = true } else if v.translation.height > 30 { open = false }
                            }
                        }
                )
                .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(width: 338, height: 844 - openY, alignment: .top)
        .offset(x: 26, y: y)
        .animation(.spring(duration: 0.35), value: open)
    }
}
