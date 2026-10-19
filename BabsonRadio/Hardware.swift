import SwiftUI
import UIKit

// MARK: - Hardware design system
// Real surfaces only: oak desk, leather panels, brushed steel keys, scratched glass, ceramic.
// Textures live in Assets.xcassets/HW (hw_*.imageset). Everything here is pure SwiftUI so it
// composes with the existing views.

enum HWTex {
    static let steel = "hw_steel"
    static let leatherBlack = "hw_leather_black"
    static let leatherGreen = "hw_leather_green"
    static let glass = "hw_glass"
    static let navGlass = "hw_navglass"
    static let ceramic = "hw_ceramic"
    static let scratch = "hw_scratch"
    static let dust = "hw_dust"
    static let wear = "hw_wear"
    static let oakLight = "hw_oak_light"
    static let oakDark = "hw_oak_dark"
    static let oakBlack = "hw_oak_black"
    static let kface = "hw_kface"
    static let cface = "hw_cface"
}

extension Color {
    static let hwCream = Color(hex: "F6F2E7")
    static let hwKeyShadow = Color(hex: "0F0F0D")
    static let hwInk = Color(hex: "181A12")
    static let hwKnobInk = Color(hex: "1A1710")
    static let hwSlot = Color(hex: "05080B")
    static let hwLamp = Color(hex: "FF5A48")
    static let hwLED = Color(hex: "6FCF93")
}

/// Tiled texture. `scale` is how many points one texture tile covers (0 = native size).
struct HWTile: View {
    let name: String
    var opacity: Double = 1
    var blend: BlendMode = .normal
    var body: some View {
        Image(name)
            .resizable(resizingMode: .tile)
            .opacity(opacity)
            .blendMode(blend)
            .allowsHitTesting(false)
    }
}

// MARK: Environment

enum HWMode: Equatable {
    case light
    case dark
    /// Playing with a cover, system dark: near-black leather with a hint of the cover's hue.
    case album(Color)
    /// Playing with a cover, system light: the light amp (ivory face) with a rim in the cover's color. Never flips to dark.
    case albumLight(Color)
}

private struct HWModeKey: EnvironmentKey { static let defaultValue: HWMode = .dark }
/// On a wide window (open Duo, iPad) ContentView draws the oak desk once, behind everything, so it never changes between tabs.
/// Pages in the main window then skip their own desk. Sheets and covers (which do not sit on that desk) still draw one.
private struct HWGlobalDeskKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var hwGlobalDesk: Bool {
        get { self[HWGlobalDeskKey.self] }
        set { self[HWGlobalDeskKey.self] = newValue }
    }
    var hwMode: HWMode {
        get { self[HWModeKey.self] }
        set { self[HWModeKey.self] = newValue }
    }
}

extension HWMode {
    /// Leather panel base color.
    var leatherTint: Color? {
        switch self {
        case .light: return Color(hex: "007A50")
        case .dark: return nil
        case .album(let c), .albumLight(let c): return c
        }
    }
    /// The mode for a page: the cover's hue when one is playing, in the same light or dark as the rest of the app.
    static func resolve(album: Color?, scheme: ColorScheme) -> HWMode {
        if let a = album { return scheme == .light ? .albumLight(a) : .album(a) }
        return scheme == .light ? .light : .dark
    }
    /// Text on a panel: cream on leather, dark ink on the light amp's ivory face.
    var onPanelText: Color { isLight ? Color(hex: "1A1710") : .hwCream }
    var onPanelSub: Color { isLight ? Color(hex: "5B5444") : Color(hex: "B1AA94") }
    var isLight: Bool {
        switch self { case .light, .albumLight: return true; default: return false }
    }
}

// MARK: Desk (page background)

struct HWDesk: View {
    @Environment(\.colorScheme) private var scheme
    var album: Color? = nil
    var body: some View {
        ZStack {
            if let a = album, scheme == .dark {
                Color(hex: "14130F")
                HWTile(name: HWTex.oakBlack, opacity: 0.9)
                a.opacity(0.22).blendMode(.color)
            } else if let a = album {
                // Light mode with a cover playing: the light oak, washed with the cover's hue.
                Color(hex: "D9D2C2")
                HWTile(name: HWTex.oakLight)
                a.opacity(0.26).blendMode(.color)
            } else if scheme == .dark {
                Color(hex: "14130F")
                HWTile(name: HWTex.oakDark)
            } else {
                Color(hex: "D9D2C2")
                HWTile(name: HWTex.oakLight)
            }
            LinearGradient(colors: [.black.opacity(0.0), .black.opacity(scheme == .dark ? 0.35 : 0.12)],
                           startPoint: .top, endPoint: .bottom)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

// MARK: Leather panel

struct HWLeather: View {
    var tint: Color? = nil
    var corner: CGFloat = 22
    var stitch: Bool = true
    @Environment(\.hwMode) private var mode
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: corner, style: .continuous)
        // The light amp: green leather rim, an ivory ceramic face set 15 pt in, and black glass caps on the corners.
        let face = mode.isLight && tint != nil
        let ringColor: Color = { if case .albumLight(let c) = mode { return c }; return Color(hex: "006644") }()
        ZStack {
            shape.fill(Color(hex: "0C0C0A"))
            if let t = tint {
                HWTile(name: HWTex.leatherGreen, opacity: 0.55)
                t.opacity(0.78).blendMode(.color)
                // Album mode: still black leather, with only a hint of the cover's hue.
                if case .album = mode { Color.black.opacity(0.74) } else { Color.black.opacity(0.24) }
            } else {
                HWTile(name: HWTex.leatherBlack)
                Color.black.opacity(0.6)
            }
            LinearGradient(colors: [.white.opacity(0.10), .clear, .black.opacity(0.28)],
                           startPoint: .top, endPoint: .bottom)
            if stitch {
                shape.inset(by: 7)
                    .stroke(Color(hex: face ? "F6F2E7" : "F6F2E7").opacity(face ? 0.6 : 0.32), style: StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
            }
            if face {
                let inner = RoundedRectangle(cornerRadius: 12, style: .continuous)
                ZStack {
                    Color(hex: "F7F5F0")
                    HWTile(name: HWTex.cface, opacity: 0.55, blend: .multiply)
                    inner.strokeBorder(Color(hex: "232823").opacity(0.28), lineWidth: 5).blur(radius: 3)
                }
                .clipShape(inner)
                .overlay(inner.strokeBorder(ringColor.opacity(0.75), lineWidth: 1.5))
                .padding(15)
                // Corner caps.
                GeometryReader { g in
                    ForEach(0..<4, id: \.self) { i in
                        let right = i % 2 == 1, bottom = i >= 2
                        Circle().fill(Color(hex: "161614"))
                            .frame(width: 48, height: 48)
                            .position(x: right ? g.size.width : 0, y: bottom ? g.size.height : 0)
                    }
                }
                .allowsHitTesting(false)
            }
        }
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.black.opacity(0.55), lineWidth: 1))
        .overlay(shape.inset(by: 1).strokeBorder(Color.white.opacity(0.10), lineWidth: 1))
        .shadow(color: .black.opacity(0.45), radius: 10, x: 0, y: 8)
        .shadow(color: .black.opacity(0.5), radius: 0, x: 0, y: 3)
    }
}

struct HWPanelModifier: ViewModifier {
    @Environment(\.hwMode) private var mode
    var corner: CGFloat
    var padding: CGFloat
    var tintOverride: Color?
    func body(content: Content) -> some View {
        content
            .padding(mode.isLight && tintOverride == nil ? padding + 14 : padding)
            .background(HWLeather(tint: tintOverride ?? mode.leatherTint, corner: corner))
            .foregroundStyle(mode.onPanelText)
    }
}

extension View {
    /// Leather panel with stitching. Text inside defaults to cream.
    func hwPanel(corner: CGFloat = 22, padding: CGFloat = 16, tint: Color? = nil) -> some View {
        modifier(HWPanelModifier(corner: corner, padding: padding, tintOverride: tint))
    }
    func hwMode(_ m: HWMode) -> some View { environment(\.hwMode, m) }
}

// MARK: Steel key

struct HWKeyFace: View {
    var corner: CGFloat = 10
    var pressed: Bool = false
    var lit: Bool = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let dark = scheme == .dark
        let shape = RoundedRectangle(cornerRadius: corner, style: .continuous)
        let edge = dark ? Color(hex: "0F0F0D") : Color(hex: "6F6D65")
        ZStack {
            HWTile(name: HWTex.steel)
            if pressed {
                Color(hex: "1E1E1C").opacity(0.78)
                LinearGradient(colors: [.black.opacity(0.38), .black.opacity(0.08)], startPoint: .top, endPoint: .bottom)
            } else {
                (dark ? Color(hex: "1E1E1C").opacity(0.55) : Color(hex: "ECECE6").opacity(0.30))
                LinearGradient(stops: [.init(color: Color(hex: "FAF6EC").opacity(0.13), location: 0),
                                       .init(color: Color(hex: "FAF6EC").opacity(0.03), location: 0.46),
                                       .init(color: .clear, location: 0.54)],
                               startPoint: .top, endPoint: .bottom)
            }
            if pressed {
                shape.strokeBorder(Color.black.opacity(0.6), lineWidth: 4).blur(radius: 3)
            }
        }
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color(hex: "181A12").opacity(0.12), lineWidth: 1))
        .overlay(shape.inset(by: 1).strokeBorder(Color(hex: "FAF6EC").opacity(pressed ? 0 : 0.3), lineWidth: 1).mask(
            LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center)))
        .background(
            shape.fill(edge).offset(y: pressed ? 1 : 4)
        )
        .shadow(color: Color(hex: "181A12").opacity(pressed ? 0.2 : 0.38), radius: pressed ? 2 : 5, x: 0, y: pressed ? 1 : 8)
        .offset(y: pressed ? 3 : 0)
    }
}

struct HWKeyStyle: ButtonStyle {
    var corner: CGFloat = 10
    var lit: Bool = false
    var height: CGFloat? = 38
    @Environment(\.colorScheme) private var scheme
    func makeBody(configuration: Configuration) -> some View {
        let down = configuration.isPressed || lit
        let ink = scheme == .dark ? Color(hex: "EFE9D6") : Color(hex: "1A1710")
        configuration.label
            .font(BRFont.body(14, .semibold))
            .foregroundStyle(down ? Color.hwLED : ink)
            .padding(.horizontal, 12)
            .frame(minHeight: height)
            .background(HWKeyFace(corner: corner, pressed: down, lit: lit))
            .offset(y: down ? 3 : 0)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

extension ButtonStyle where Self == HWKeyStyle {
    static var hwKey: HWKeyStyle { HWKeyStyle() }
    static func hwKey(lit: Bool = false, corner: CGFloat = 10, height: CGFloat? = 38) -> HWKeyStyle {
        HWKeyStyle(corner: corner, lit: lit, height: height)
    }
}

/// Non-interactive raised key (for polls / chips that handle their own taps).
struct HWKey<Content: View>: View {
    var lit: Bool = false
    var corner: CGFloat = 10
    var height: CGFloat = 38
    @ViewBuilder var content: () -> Content
    var body: some View {
        content()
            .foregroundStyle(Color.hwCream)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(HWKeyFace(corner: corner, pressed: lit, lit: lit))
    }
}

// MARK: Glass display (EQ / clock well)

struct HWGlass: View {
    var corner: CGFloat = 12
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: corner, style: .continuous)
        ZStack {
            Color.hwSlot
            HWTile(name: HWTex.glass, opacity: 0.55)
            LinearGradient(colors: [.white.opacity(0.07), .clear], startPoint: .top, endPoint: .center)
        }
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.black, lineWidth: 2))
        .overlay(shape.inset(by: 2).strokeBorder(Color.white.opacity(0.08), lineWidth: 1))
    }
}

extension View {
    func hwGlassWell(corner: CGFloat = 12) -> some View {
        background(HWGlass(corner: corner))
    }
}

// MARK: Inset slot (progress, non-interactive)

struct HWSlot: View {
    var progress: Double
    var fill: Color = .hwCream
    var height: CGFloat = 8
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.black.opacity(0.55))
                    .overlay(Capsule().strokeBorder(Color.black.opacity(0.6), lineWidth: 1))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(0.10), lineWidth: 1).offset(y: 1).mask(Capsule()))
                Capsule().fill(fill.opacity(0.9))
                    .frame(width: max(height, geo.size.width * CGFloat(min(max(progress, 0), 1))))
                    .padding(1)
            }
        }
        .frame(height: height)
    }
}

// MARK: Knob

struct HWKnob: View {
    var size: CGFloat = 54
    /// -1...1 mapped to -135°...135°
    var value: Double = 0
    var body: some View {
        ZStack {
            Circle().fill(Color.black.opacity(0.65))
                .overlay(Circle().strokeBorder(Color.white.opacity(0.10), lineWidth: 1))
                .frame(width: size + 10, height: size + 10)
            Circle()
                .fill(Color.clear)
                .overlay(HWTile(name: HWTex.steel).clipShape(Circle()))
                .overlay(Circle().fill(Color(hex: "1E1E1C").opacity(0.35)))
                .overlay(Circle().fill(RadialGradient(colors: [.white.opacity(0.35), .clear],
                                                      center: UnitPoint(x: 0.34, y: 0.22), startRadius: 0, endRadius: size * 0.6)))
                .overlay(Circle().strokeBorder(Color.black.opacity(0.4), lineWidth: 1))
                .frame(width: size, height: size)
                .shadow(color: .black.opacity(0.5), radius: 4, x: 0, y: 4)
            Capsule().fill(Color.hwCream)
                .frame(width: 3, height: size * 0.28)
                .offset(y: -size * 0.3)
                .rotationEffect(.degrees(value * 135))
        }
    }
}

// MARK: Avatar (steel disc)

struct HWAvatar: View {
    var text: String
    var color: Color? = nil
    var size: CGFloat = 24
    /// The condensed display face (profile page) instead of the system bold used on tiny discs.
    var display = false

    /// True when dark letters read better on this disc. Works on roughly what the disc looks like after the metal and the tint
    /// are blended (the tint over steel), so a dark pick like navy gets light letters and a pale pick gets dark ones.
    static func darkInk(on color: Color?) -> Bool {
        guard let color else { return true }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        func lin(_ v: CGFloat) -> Double { let x = Double(v); return x <= 0.03928 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
        let steel: CGFloat = 0.66
        let L = 0.2126 * lin(0.35 * steel + 0.65 * r) + 0.7152 * lin(0.35 * steel + 0.65 * g) + 0.0722 * lin(0.35 * steel + 0.65 * b)
        // Contrast with the dark ink (about 0.066 under the 0.05 offset) against contrast with the cream ink.
        return (L + 0.05) * (L + 0.05) >= 0.064
    }

    var body: some View {
        let dark = Self.darkInk(on: color)
        let rim = max(1.5, size * 0.055)
        ZStack {
            // Always brushed steel underneath, so a dark pick still looks like metal.
            Circle().fill(Color(hex: "8F8E88"))
                .overlay(HWTile(name: HWTex.steel).clipShape(Circle()))
            if let c = color {
                Circle().fill(c).blendMode(.color)
                Circle().fill(c).opacity(0.40).blendMode(.multiply)
                Circle().fill(c).opacity(0.20)
            }
            // Brushed sheen: a light and a dark band that turn around the disc.
            Circle().fill(AngularGradient(colors: [.white.opacity(0.0), .white.opacity(0.30), .white.opacity(0.0), .black.opacity(0.16),
                                                   .white.opacity(0.0), .white.opacity(0.24), .white.opacity(0.0), .black.opacity(0.14), .white.opacity(0.0)],
                                          center: .center, angle: .degrees(-25)))
            // Highlight up and left, shade at the bottom.
            Circle().fill(RadialGradient(colors: [.white.opacity(0.5), .clear],
                                         center: UnitPoint(x: 0.32, y: 0.2), startRadius: 0, endRadius: size * 0.62))
            Circle().fill(LinearGradient(colors: [.clear, .black.opacity(0.24)], startPoint: .center, endPoint: .bottom))
            Text(text)
                .font(display ? BRFont.display(size * (text.count > 1 ? 0.4 : 0.5)) : .system(size: size * 0.42, weight: .bold))
                .foregroundStyle(dark ? Color(hex: "22221F").opacity(0.88) : Color(hex: "FAF6EC"))
                .shadow(color: dark ? .white.opacity(0.5) : .black.opacity(0.55), radius: 0, x: 0, y: 1)
        }
        .frame(width: size, height: size)
        // Machined rim: bright on the upper left, dark on the lower right.
        .overlay(Circle().strokeBorder(LinearGradient(colors: [.white.opacity(0.9), Color(hex: "B9B8B0"), Color(hex: "4E4D47")],
                                                      startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: rim))
        .overlay(Circle().inset(by: rim).strokeBorder(Color.black.opacity(0.28), lineWidth: 0.6))
        .shadow(color: .black.opacity(0.42), radius: 3, x: 0, y: 3)
    }
}

// MARK: Engraved star (rating)

struct HWStar: View {
    var filled: Bool
    var size: CGFloat = 24
    var body: some View {
        StarShape()
            .fill(filled
                  ? AnyShapeStyle(LinearGradient(colors: [Color(hex: "FBFAF6"), Color(hex: "C4C3BC"), Color(hex: "8E8D86")],
                                                 startPoint: .top, endPoint: .bottom))
                  : AnyShapeStyle(Color.black.opacity(0.5)))
            .overlay(StarShape().stroke(filled ? Color(hex: "6E6D67") : Color.black.opacity(0.65), lineWidth: 0.9))
            .frame(width: size, height: size)
            .shadow(color: .black.opacity(filled ? 0.5 : 0), radius: 0.5, x: 0, y: 1.5)
            .shadow(color: .black.opacity(filled ? 0.25 : 0), radius: 3, x: 0, y: 3)
    }
}

struct StarShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        let c = CGPoint(x: r.midX, y: r.midY + r.height * 0.04)
        let R = min(r.width, r.height) / 2
        for i in 0..<10 {
            let a = -Double.pi / 2 + Double(i) * Double.pi / 5
            let rad = i % 2 == 0 ? R : R * 0.46
            let pt = CGPoint(x: c.x + CGFloat(cos(a)) * rad, y: c.y + CGFloat(sin(a)) * rad)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        p.closeSubpath()
        return p
    }
}

// MARK: ON AIR sign (only rendered for live shows or the admin manual toggle)

struct HWOnAirSign: View {
    var beat: Double = 0   // 0...1, brightens on the beat
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6, style: .continuous)
        Text("ON AIR")
            .font(.custom("BarlowCondensed-Bold", size: 15, relativeTo: .caption))
            .tracking(2)
            .foregroundStyle(Color.hwLamp.opacity(0.78 + 0.22 * beat))
            .shadow(color: .black.opacity(0.6), radius: 0, x: 0, y: 1)
            .padding(.horizontal, 10)
            .frame(height: 24)
            .background(
                ZStack {
                    Color(hex: "260A08")
                    HWTile(name: HWTex.glass, opacity: 0.4)
                    Color.hwLamp.opacity(0.10 + 0.14 * beat)
                }.clipShape(shape)
            )
            .overlay(shape.strokeBorder(Color.black, lineWidth: 2))
            .overlay(shape.inset(by: 2).strokeBorder(Color.white.opacity(0.10), lineWidth: 1))
            .accessibilityLabel("On air")
    }
}

// MARK: Section label for panels

struct HWPanelTitle: View {
    var text: String
    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Color.hwCream.opacity(0.78))
    }
}

// MARK: Recessed fields (text inputs, pickers, settings rows)
// Dark: a dark pocket cut into the panel. Light: a pale ceramic inset. Both get a faint inner shadow along the top edge.

extension Color {
    /// Flat color for places that need a Color (cards, chips): the recessed field tone.
    static func hwField(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "1B1B17") : Color(hex: "F6F4EF")
    }
}

struct HWFieldFill: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ZStack {
            Color.hwField(scheme)
            HWTile(name: scheme == .dark ? HWTex.glass : HWTex.cface, opacity: scheme == .dark ? 0.3 : 0.45,
                   blend: scheme == .dark ? .normal : .multiply)
            LinearGradient(colors: [Color.black.opacity(scheme == .dark ? 0.35 : 0.10), .clear],
                           startPoint: .top, endPoint: .init(x: 0.5, y: 0.35))
        }
    }
}


// MARK: Pages (Schedule, Library, Search, Profile, sign-in ...)
// Like the website: the page itself is one big panel on the oak desk. Black leather in dark mode; green leather rim with an ivory
// ceramic face in light mode. Text always sits on the panel, never straight on the wood.

private struct HWFlushBottomKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    /// True for the pages beside the player on an open foldable: the panel runs down to the bottom edge, like the player's amp.
    var hwFlushBottom: Bool { get { self[HWFlushBottomKey.self] } set { self[HWFlushBottomKey.self] = newValue } }
}

struct HWPageModifier: ViewModifier {
    @Environment(\.hwFlushBottom) private var flushBottom
    @Environment(\.colorScheme) private var scheme
    @Environment(\.hwGlobalDesk) private var globalDesk
    @Environment(\.isPresented) private var isPresented
    @ObservedObject private var theme = ArtTheme.shared
    func body(content: Content) -> some View {
        let m = HWMode.resolve(album: theme.albumOn ? theme.main.color : nil, scheme: scheme)
        let light = m.isLight
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        ZStack {
            if !(globalDesk && !isPresented) { HWDesk(album: theme.albumOn ? theme.main.color : nil) }
            HWLeather(tint: m.leatherTint, corner: 22, stitch: true)
                .padding(.horizontal, 10).padding(.top, 8).padding(.bottom, flushBottom ? 0 : 8)
            content
                .scrollContentBackground(.hidden)
                .safeAreaPadding(EdgeInsets(top: light ? 14 : 4, leading: light ? 14 : 4, bottom: light ? 14 : 4, trailing: light ? 14 : 4))
                .environment(\.hwMode, m)
                .clipShape(shape)
                .padding(.horizontal, 10).padding(.top, 8).padding(.bottom, flushBottom ? 0 : 8)
        }
    }
}

extension View {
    /// Puts the whole page on a leather / ceramic panel over the oak desk.
    func hwPage() -> some View { modifier(HWPageModifier()) }
}
