import Combine
import SwiftUI

// MARK: - Bebas Neue Font
// ─────────────────────────────────────────────────────────────
// TO SET UP THE FONT:
// 1. Download BebasNeue-Regular.ttf from fonts.google.com/specimen/Bebas+Neue
// 2. Drag it into the BabsonRadio folder in Xcode — check "Add to target: BabsonRadio"
// 3. In Info.plist add key "Fonts provided by application" with value "BebasNeue-Regular.ttf"
// The app will fall back to a system heavy font until the file is added.
// ─────────────────────────────────────────────────────────────

struct BRFont {
    /// Test switch: true sets titles and headings in Apple's own SF Pro, Black weight, Expanded width (the Apple Music look) instead of
    /// Barlow Condensed. It is wide, so sizes are scaled by `expandedScale`. Set to false to go back to Barlow Condensed.
    static let expanded = false
    static let expandedScale: CGFloat = 0.68
    /// SF Pro Expanded Black. SF is a variable font on Apple platforms, so weight and width are just settings.
    static func sfExpanded(_ size: CGFloat, _ weight: Font.Weight = .black) -> Font {
        Font.system(size: size * expandedScale, weight: weight).width(.expanded)
    }
    /// Track titles, ON AIR sign, big headings: Barlow Condensed (sentence case, not all caps), or SF Expanded Black (see `expanded`).
    static func display(_ size: CGFloat) -> Font {
        expanded ? sfExpanded(size) : Font.custom("BarlowCondensed-Bold", size: size)
    }
    static func displaySemi(_ size: CGFloat) -> Font {
        expanded ? sfExpanded(size, .heavy) : Font.custom("BarlowCondensed-SemiBold", size: size)
    }
    /// Everything else: Barlow 400/500/600/700/800.
    static func body(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        let name: String
        switch weight {
        case .regular, .light, .thin, .ultraLight: name = "Barlow-Regular"
        case .medium: name = "Barlow-Medium"
        case .semibold: name = "Barlow-SemiBold"
        case .heavy, .black: name = "Barlow-ExtraBold"
        default: name = "Barlow-Bold"
        }
        return Font.custom(name, size: size)
    }
}

// MARK: - Brand Colors

extension Color {
    /// Colors that flip with light / dark on their own (for views that read no color scheme). All clear 4.5:1 on the ivory face (light)
    /// and on black leather (dark).
    static let brPlaceholder = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.659, green: 0.620, blue: 0.549, alpha: 1) : UIColor(red: 0.416, green: 0.384, blue: 0.325, alpha: 1) })
    static let brSecondary = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.812, green: 0.769, blue: 0.682, alpha: 1) : UIColor(red: 0.341, green: 0.314, blue: 0.278, alpha: 1) })
    /// Green text: deep green on the light face, bright green on black.
    static let brAccentText = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.184, green: 0.714, blue: 0.486, alpha: 1) : UIColor(red: 0, green: 0.4, blue: 0.267, alpha: 1) })
    /// Red for error TEXT: light red on dark surfaces (the plain red is only 3:1 on black), deep red on the ivory face. Both clear 4.5:1.
    static let brErrorText = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 1.0, green: 0.541, blue: 0.502, alpha: 1) : UIColor(red: 0.702, green: 0.149, blue: 0.122, alpha: 1) })
    static let brGreen      = Color(hex: "006644")
    static let brGreenMid   = Color(hex: "007A50")
    static let brGold       = Color(hex: "2FB67C") // bright green accent (replaces the old yellow)
    static let brRed        = Color(hex: "C8302A")

    // Dark Mode. At night (7pm to 6am) it's near black so the cover colors pop; in the daytime it's a
    // darker version of the cream, with the same green highlight as light mode.
    private static var dkNight: Bool { ArtTheme.isNight }
    static var brDkBg: Color       { Color(hex: dkNight ? "080808" : "2B261F") }
    static var brDkSurface: Color  { Color(hex: dkNight ? "111111" : "36302A") }
    static var brDkSurface2: Color { Color(hex: dkNight ? "1A1A1A" : "423B33") }
    static var brDkBorder: Color   { Color(hex: dkNight ? "252525" : "524A3E") }
    static var brDkBorder2: Color  { Color(hex: dkNight ? "303030" : "5F5648") }
    static var brDkText: Color     { Color(hex: dkNight ? "E8E8E8" : "F4ECDA") }
    static var brDkSub: Color      { Color(hex: dkNight ? "ABABAB" : "CFC4AE") }
    static var brDkMuted: Color    { Color(hex: dkNight ? "8C8C8C" : "A89E8C") }

    // Light Mode
    static let brLtBg       = Color(hex: "F5F0E8")
    static let brLtSurface  = Color(hex: "FDFAF4")
    static let brLtSurface2 = Color(hex: "EDE8DC")
    static let brLtBorder   = Color(hex: "D8D0BE")
    static let brLtText     = Color(hex: "1A1710")
    static let brLtSub      = Color(hex: "575047")
    static let brLtMuted    = Color(hex: "6A6253")

    // Adaptive (auto dark/light)
    static let brBackground  = Color("BRBackground")
    static let brSurface     = Color("BRSurface")
    static let brBorder      = Color("BRBorder")
    static let brPrimaryText = Color("BRPrimaryText")
    static let brSubText     = Color("BRSubText")
    static let brActiveAccent = Color("BRActiveAccent") // bright green in dark, Babson green in light

    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:  (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:  (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:  (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 200, 200, 200)
        }
        self.init(.sRGB,
                  red:     Double(r) / 255,
                  green:   Double(g) / 255,
                  blue:    Double(b) / 255,
                  opacity: Double(a) / 255)
    }
}

// MARK: - View Modifiers

/// Card surface, a small amp: black leather with cream stitching in dark mode; in light mode an ivory ceramic face inside a
/// green leather rim with stitching. Raised, with a highlight edge and a drop shadow.
struct HWCardSurface: View {
    var dark: Bool
    var corner: CGFloat = 12
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: corner, style: .continuous)
        let rimW: CGFloat = 4
        ZStack {
            if dark {
                Color(hex: "0C0C0A")
                HWTile(name: HWTex.leatherBlack)
                Color.black.opacity(0.42)
                LinearGradient(colors: [.white.opacity(0.09), .clear, .black.opacity(0.25)], startPoint: .top, endPoint: .bottom)
                shape.inset(by: 5).stroke(Color(hex: "F6F2E7").opacity(0.30), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            } else {
                // Green leather rim, then the ivory face.
                Color(hex: "0C0C0A")
                HWTile(name: HWTex.leatherGreen)
                LinearGradient(colors: [.black.opacity(0.16), .black.opacity(0.30)], startPoint: .top, endPoint: .bottom)
                let face = RoundedRectangle(cornerRadius: max(4, corner - rimW + 1), style: .continuous)
                ZStack {
                    Color(hex: "F2F4F2")
                    HWTile(name: HWTex.cface, opacity: 0.24, blend: .multiply)
                    LinearGradient(colors: [.white.opacity(0.45), .clear], startPoint: .top, endPoint: .center)
                }
                .clipShape(face)
                .overlay(face.strokeBorder(Color(hex: "232823").opacity(0.25), lineWidth: 1))
                .background(face.inset(by: -1.5).fill(Color.black.opacity(0.5)))
                .padding(rimW)
                shape.inset(by: 2).stroke(Color(hex: "F6F2E7").opacity(0.5), style: StrokeStyle(lineWidth: 0.8, dash: [3, 2.5]))
            }
        }
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.black.opacity(dark ? 0.6 : 0.4), lineWidth: 1))
        .shadow(color: .black.opacity(dark ? 0.5 : 0.28), radius: dark ? 8 : 6, x: 0, y: dark ? 5 : 3)
    }
}

struct BRCardModifier: ViewModifier {
    @Environment(\.colorScheme) var scheme

    func body(content: Content) -> some View {
        content.background(HWCardSurface(dark: scheme == .dark)).textRenderer(HWInscribedText(light: scheme != .dark))
    }
}

extension View {
    func brCard() -> some View {
        modifier(BRCardModifier())
    }
}

/// Section header row: "TITLE ——— See All"
struct BRSectionHeader: View {
    let title: String
    var action: String = "See all"
    var onTap: (() -> Void)? = nil
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(spacing: 10) {
            Text(title)
                .font(BRFont.body(20, .regular))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                .lineLimit(1).fixedSize(horizontal: true, vertical: false)

            Rectangle()
                .frame(height: 1)
                .foregroundColor(scheme == .dark ? .brDkBorder : .brLtBorder)

            // Only when there is somewhere to go.
            if let onTap {
                Button(action: onTap) {
                    Text(action)
                        .font(BRFont.body(14, .regular))
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                }
            }
        }
    }
}

// MARK: - ON AIR Badge

struct OnAirBadge: View {
    var body: some View { HWOnAirSign() }
}

// MARK: - Tag Chips

struct BRTagChip: View {
    let text: String
    let style: ChipStyle
    @ObservedObject private var theme = ArtTheme.shared
    @Environment(\.colorScheme) private var scheme

    enum ChipStyle { case gold, green, subtle, live }

    var body: some View {
        Text(text)
            .font(BRFont.display(10))
            .kerning(1.5)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(bg)
            .foregroundColor(fg)
            .clipShape(RoundedRectangle(cornerRadius: 3))
    }

    var bg: Color {
        switch style {
        case .gold:   return ArtTheme.full(scheme) ? theme.button(scheme) : .brGold
        case .green:  return ArtTheme.full(scheme) ? theme.button(scheme) : .brGreen
        case .subtle: return Color.black.opacity(0.28)
        case .live:   return .brRed
        }
    }

    var fg: Color {
        switch style {
        case .gold:   return Color(hex: "080808")
        case .green:  return .white
        case .subtle: return Color.hwCream.opacity(0.8)
        case .live:   return .white
        }
    }
}

// MARK: - Babson Sound links (keep in sync with babsonsound-web/lib/links.ts)

enum BabsonLinks {
    /// Babson Sound on Belong (the campus groups site).
    static let about  = URL(string: "https://belong.babson.edu/BCR")!
    static let events = URL(string: "https://belong.babson.edu/bcr/events/")!
    /// Same page the "Join Now" button on our Belong page opens.
    static let join   = URL(string: "https://belong.babson.edu/bcr/club_signup")!
    static let privacy = URL(string: "https://babsonradio.com/privacy")!

    /// Instagram handle without the @ (e.g. "babsonsound"). Leave "" to hide the Instagram links.
    static let instagramHandle = "babson.sound"
    static var instagram: URL? {
        instagramHandle.isEmpty ? nil : URL(string: "https://www.instagram.com/\(instagramHandle)/")
    }
}


// MARK: - Profile button (top-right corner of every page; same look as the website)

/// True while the search field is active, so the profile circle can get out of its way on every device.
@MainActor
final class SearchState: ObservableObject {
    static let shared = SearchState()
    @Published var active = false
}

struct ProfileCircleButton: View {
    @ObservedObject private var searchState = SearchState.shared
    @StateObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) var scheme
    @ObservedObject private var profile = ProfileStore.shared
    @State private var showProfile = false

    var body: some View {
        // Gone while someone is searching, on the phone's navigation bar and on the open foldable's corner alike.
        if !searchState.active { button }
    }

    private var button: some View {
        Button { showProfile = true } label: {
            HWAvatar(text: auth.currentUser?.initials ?? "", color: AvatarPalette.color(profile.avatarColor), size: 38)
                .overlay {
                    if auth.currentUser == nil {
                        Image(systemName: "person.fill").font(.system(size: 15))
                            .foregroundColor(HWAvatar.darkInk(on: AvatarPalette.color(profile.avatarColor)) ? Color(hex: "22221F").opacity(0.82) : Color(hex: "FAF6EC"))
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Profile")
        .sheet(isPresented: $showProfile) { ProfileView() }
    }
}

/// True on a wide window (open Duo, iPad), where ContentView draws one profile button for every tab so it never moves.
private struct GlobalProfileKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var globalProfile: Bool {
        get { self[GlobalProfileKey.self] }
        set { self[GlobalProfileKey.self] = newValue }
    }
}

private struct ProfileButtonModifier: ViewModifier {
    @Environment(\.globalProfile) private var global
    func body(content: Content) -> some View {
        if global { content } else {
            content.toolbar {
                ToolbarItem(placement: .topBarLeading) { HostShowButton() }
                ToolbarItem(placement: .topBarTrailing) { ProfileCircleButton() }
            }
        }
    }
}

/// "Host a show" in the top bar: opens the same request form as the website's button. Students only.
struct HostShowButton: View {
    @ObservedObject private var auth = AuthManager.shared
    @StateObject private var slots = SlotsManager()
    @State private var showForm = false
    var body: some View {
        if auth.isSignedIn, auth.currentUser?.isGuest != true {
            Button { showForm = true } label: {
                Text("Host a show").font(BRFont.body(13, .semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 12).frame(height: 30)
                    .background(HWKeyFace(corner: 15))
            }
            .buttonStyle(.plain)
            .sheet(isPresented: $showForm) { RequestSlotForm(slots: slots) }
        }
    }
}

extension View {
    /// Adds the profile circle to the top-right of a page that has a navigation bar (narrow windows only).
    func profileButton() -> some View { modifier(ProfileButtonModifier()) }
}


// MARK: - Terms and sign-up details (mirrors lib/terms.ts on the website)

enum Terms {
    /// Bump when the terms or privacy policy change in a way people should re-accept.
    static let version = "2026-10-07"

    /// Graduation year choices: this year through six years out, then alumni and staff.
    /// Paste the official list here (same as CONCENTRATIONS in lib/terms.ts). Empty = free-text box.
    static let concentrations: [String] = []

    static func gradYearOptions() -> [(value: String, label: String)] {
        let y = Calendar.current.component(.year, from: Date())
        return (0..<7).map { (String(y + $0), "Class of \(y + $0)") }
            + [("alumni", "Alumni"), ("staff", "Faculty or staff")]
    }
}

/// "I agree to the Terms of Use and Privacy Policy" (required to create an account).
struct AgreeToggle: View {
    @Binding var agreed: Bool
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Toggle(isOn: $agreed) {
            Text("I agree to the [Terms of Use](https://babsonradio.com/terms) and [Privacy Policy](https://babsonradio.com/privacy).")
                .font(BRFont.body(13, .regular))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
        }
        .toggleStyle(.switch)
        .tint(scheme == .dark ? .brGold : .brGreen)
    }
}

// MARK: - Liquid Glass with a fallback for iOS 25 and earlier

@available(iOS 26.0, *)
private func brGlassStyle(tint: Color?, interactive: Bool) -> Glass {
    var g = Glass.regular
    if let tint { g = g.tint(tint) }
    if interactive { g = g.interactive() }
    return g
}

extension View {
    /// Liquid Glass on iOS 26 and newer. Older iOS gets a flat fill in `fallback`, or a frosted material when none is given.
    @ViewBuilder
    func brGlass<S: Shape>(in shape: S, tint: Color? = nil, interactive: Bool = false, fallback: Color? = nil) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(brGlassStyle(tint: tint, interactive: interactive), in: shape)
        } else if let fallback {
            self.background(fallback, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }
}

/// Groups glass pieces so they blend on iOS 26 and newer; just lays them out on older iOS.
struct BRGlassGroup<Content: View>: View {
    var spacing: CGFloat = 10
    @ViewBuilder var content: () -> Content

    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { content() }
        } else {
            content()
        }
    }
}


/// "Ryan Edward Media Group" credit at the bottom of the profile pages; tapping it opens the site.
struct DesignedByCredit: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Link(destination: URL(string: "https://ryanedwardmediagroup.com")!) { Text("Ryan Edward Media Group").underline() }
            .font(BRFont.body(12, .medium))
            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
    }
}


/// Instagram glyph: rounded square, lens, flash dot. Takes the surrounding text color.
struct InstagramGlyph: View {
    var size: CGFloat = 16
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                .stroke(lineWidth: size * 0.11)
            Circle().stroke(lineWidth: size * 0.11).frame(width: size * 0.46, height: size * 0.46)
            Circle().frame(width: size * 0.1, height: size * 0.1).offset(x: size * 0.26, y: -size * 0.26)
        }
        .frame(width: size * 0.92, height: size * 0.92)
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}


extension Color {
    /// Dark or white text, whichever reads better on this solid color.
    static func brInk(on color: Color) -> Color {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        func lin(_ v: CGFloat) -> Double { let x = Double(v); return x <= 0.03928 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
        let L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        return (L + 0.05) / 0.0662 >= 1.05 / (L + 0.05) ? Color(hex: "1A1710") : .white
    }
}
