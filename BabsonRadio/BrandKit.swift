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
    static func display(_ size: CGFloat) -> Font {
        Font.custom("BebasNeue-Regular", size: size)
    }
}

// MARK: - Brand Colors

extension Color {
    static let brGreen      = Color(hex: "006644")
    static let brGreenMid   = Color(hex: "007A50")
    static let brGold       = Color(hex: "DDD055")
    static let brRed        = Color(hex: "C8302A")

    // Dark Mode
    static let brDkBg       = Color(hex: "080808")
    static let brDkSurface  = Color(hex: "111111")
    static let brDkSurface2 = Color(hex: "1A1A1A")
    static let brDkBorder   = Color(hex: "252525")
    static let brDkBorder2  = Color(hex: "303030")
    static let brDkText     = Color(hex: "E8E8E8")
    static let brDkSub      = Color(hex: "888888")
    static let brDkMuted    = Color(hex: "444444")

    // Light Mode
    static let brLtBg       = Color(hex: "F5F0E8")
    static let brLtSurface  = Color(hex: "FDFAF4")
    static let brLtSurface2 = Color(hex: "EDE8DC")
    static let brLtBorder   = Color(hex: "D8D0BE")
    static let brLtText     = Color(hex: "1A1710")
    static let brLtSub      = Color(hex: "6A6258")
    static let brLtMuted    = Color(hex: "A09888")

    // Adaptive (auto dark/light)
    static let brBackground  = Color("BRBackground")
    static let brSurface     = Color("BRSurface")
    static let brBorder      = Color("BRBorder")
    static let brPrimaryText = Color("BRPrimaryText")
    static let brSubText     = Color("BRSubText")
    static let brActiveAccent = Color("BRActiveAccent") // gold in dark, green in light

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

/// Card surface — adapts to dark/light mode
struct BRCardModifier: ViewModifier {
    @Environment(\.colorScheme) var scheme

    func body(content: Content) -> some View {
        content
            .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(scheme == .dark ? Color.brDkBorder2 : Color.brLtBorder, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(
                color: Color.black.opacity(scheme == .dark ? 0.55 : 0.07),
                radius: scheme == .dark ? 10 : 8,
                x: 0, y: 3
            )
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
    var action: String = "See All"
    var onTap: (() -> Void)? = nil
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(spacing: 10) {
            Text(title)
                .font(BRFont.display(20))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                .kerning(1.5)

            Rectangle()
                .frame(height: 1)
                .foregroundColor(scheme == .dark ? .brDkBorder : .brLtBorder)

            Button(action: { onTap?() }) {
                Text(action)
                    .font(BRFont.display(12))
                    .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                    .kerning(1.5)
            }
        }
    }
}

// MARK: - ON AIR Badge

struct OnAirBadge: View {
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .frame(width: 5, height: 5)
                .foregroundColor(.white.opacity(0.75))
            Text("On Air")
                .font(BRFont.display(12))
                .foregroundColor(.white)
                .kerning(2.5)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 3)
        .background(Color.brRed)
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .shadow(color: Color.brRed.opacity(0.35), radius: 6, x: 0, y: 2)
    }
}

// MARK: - Tag Chips

struct BRTagChip: View {
    let text: String
    let style: ChipStyle

    enum ChipStyle { case gold, green, subtle }

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
        case .gold:   return .brGold
        case .green:  return .brGreen
        case .subtle: return Color.gray.opacity(0.15)
        }
    }

    var fg: Color {
        switch style {
        case .gold:   return Color(hex: "080808")
        case .green:  return .white
        case .subtle: return .gray
        }
    }
}
