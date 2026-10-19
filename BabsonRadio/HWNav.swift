import SwiftUI

// MARK: - Navigation bars
// Dark: scratched black glass. Light: warm white ceramic. Selected item takes the green (or the cover's color in album mode).
// Phone: a full-width bar at the bottom (83 pt with the home indicator). Open foldable / iPad: a floating vertical bar on the left edge.

struct HWTabItem: Identifiable {
    let id: Int
    let icon: String
    let label: String
}

private func hwTabItems(hosting: Bool) -> [HWTabItem] {
    var items = [
        HWTabItem(id: 0, icon: "dot.radiowaves.left.and.right", label: "Live"),
        HWTabItem(id: 1, icon: "calendar", label: "Schedule"),
        HWTabItem(id: 2, icon: "books.vertical", label: "Library"),
    ]
    if hosting { items.append(HWTabItem(id: 3, icon: "mic.fill", label: "Host")) }
    items.append(HWTabItem(id: 4, icon: "magnifyingglass", label: "Search"))
    return items
}

/// Glass or ceramic, whichever the mode wants.
struct HWNavSurface: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ZStack {
            if scheme == .dark {
                Rectangle().fill(.ultraThinMaterial)
                Color(hex: "181815").opacity(0.74)
                HWTile(name: HWTex.navGlass, opacity: 0.35)
                LinearGradient(colors: [.white.opacity(0.06), .clear], startPoint: .top, endPoint: .center)
            } else {
                Color(hex: "EFEAD9")
                HWTile(name: HWTex.ceramic, opacity: 0.9)
                LinearGradient(colors: [.white.opacity(0.5), .clear], startPoint: .top, endPoint: .center)
            }
        }
    }
}

private struct HWTabButton: View {
    let item: HWTabItem
    let selected: Bool
    let action: () -> Void
    @Environment(\.colorScheme) private var scheme
    @ObservedObject private var theme = ArtTheme.shared

    private var selColor: Color {
        if theme.albumOn { return scheme == .dark ? theme.main.mixed(with: .init(r: 1, g: 1, b: 1), 0.35).color : theme.main.mixed(with: .init(r: 0, g: 0, b: 0), 0.4).color }
        return scheme == .dark ? Color(hex: "6FCF93") : Color(hex: "24653B")
    }
    private var unselColor: Color { scheme == .dark ? Color(hex: "B1AA94") : Color(hex: "6E6858") }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: item.icon)
                    .font(.system(size: 21, weight: selected ? .bold : .medium))
                    .frame(height: 24)
                Text(item.label)
                    .font(BRFont.body(10, selected ? .bold : .medium))
            }
            .foregroundStyle(selected ? selColor : unselColor)
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

struct HWTabBar: View {
    @Binding var tab: Int
    var hosting: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        // 49 pt of buttons; the surface runs on down through the home indicator area to the very bottom edge of the screen.
        HStack(spacing: 0) {
            ForEach(hwTabItems(hosting: hosting)) { it in
                HWTabButton(item: it, selected: tab == it.id) { tab = it.id }
            }
        }
        .padding(.top, 7)
        .padding(.horizontal, 4)
        .frame(height: 49, alignment: .top)
        .frame(maxWidth: .infinity)
        .background(alignment: .top) { HWNavSurface().ignoresSafeArea(edges: .bottom) }
        .overlay(alignment: .top) {
            Rectangle().fill(scheme == .dark ? Color(hex: "3A3A34") : Color.black.opacity(0.14)).frame(height: 1)
        }
    }
}

/// The vertical floating bar for wide screens: bottom right corner, like the design board.
struct HWSideBar: View {
    @Binding var tab: Int
    var hosting: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
        VStack(spacing: 4) {
            ForEach(hwTabItems(hosting: hosting)) { it in
                HWTabButton(item: it, selected: tab == it.id) { tab = it.id }
                    .frame(width: 48, height: 52)
            }
        }
        .padding(.vertical, 6).padding(.horizontal, 4)
        .background(HWNavSurface().clipShape(shape))
        .overlay(shape.strokeBorder(scheme == .dark ? Color(hex: "3A3A34") : Color.black.opacity(0.14), lineWidth: 1))
        .shadow(color: .black.opacity(0.4), radius: 10, x: 0, y: 6)
        .padding(.trailing, 10).padding(.bottom, 22)
    }
}

/// How far from the left edge pages must keep clear of the floating vertical bar (0 on a phone).
private struct HWBarInsetKey: EnvironmentKey { static let defaultValue: CGFloat = 0 }
extension EnvironmentValues {
    var hwBarInset: CGFloat {
        get { self[HWBarInsetKey.self] }
        set { self[HWBarInsetKey.self] = newValue }
    }
}
