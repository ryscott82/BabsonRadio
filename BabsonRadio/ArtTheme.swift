import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// The album-color theme, same idea as the website (components/ArtTheme.tsx):
// everything starts on official Babson Green, then about 6 seconds in fades (12 s) to the current cover:
//   main   = the cover's main color: visualizer glow and the washes behind cards
//   green  = a green that pairs with it: accents, progress, stars, links
//   second = the cover's second color: buttons in light mode
// To turn it off, set ArtTheme.enabled to false.

struct ArtRGB: Equatable {
    var r: Double, g: Double, b: Double
    static let babson = ArtRGB(r: 0, g: 102.0 / 255, b: 68.0 / 255) // #006644, Pantone 3425 C

    var color: Color { Color(.sRGB, red: r, green: g, blue: b, opacity: 1) }

    var hsl: (h: Double, s: Double, l: Double) {
        let mx = max(r, g, b), mn = min(r, g, b), l = (mx + mn) / 2, d = mx - mn
        if d == 0 { return (0, 0, l) }
        let s = d / (1 - abs(2 * l - 1))
        var h: Double
        if mx == r { h = ((g - b) / d).truncatingRemainder(dividingBy: 6) }
        else if mx == g { h = (b - r) / d + 2 }
        else { h = (r - g) / d + 4 }
        h *= 60; if h < 0 { h += 360 }
        return (h, s, l)
    }

    static func hsl(_ h: Double, _ s: Double, _ l: Double) -> ArtRGB {
        let c = (1 - abs(2 * l - 1)) * s
        let x = c * (1 - abs((h / 60).truncatingRemainder(dividingBy: 2) - 1))
        let m = l - c / 2
        let rgb: (Double, Double, Double)
        switch h {
        case ..<60: rgb = (c, x, 0)
        case ..<120: rgb = (x, c, 0)
        case ..<180: rgb = (0, c, x)
        case ..<240: rgb = (0, x, c)
        case ..<300: rgb = (x, 0, c)
        default: rgb = (c, 0, x)
        }
        return ArtRGB(r: rgb.0 + m, g: rgb.1 + m, b: rgb.2 + m)
    }

    func mixed(with o: ArtRGB, _ t: Double) -> ArtRGB {
        ArtRGB(r: r + (o.r - r) * t, g: g + (o.g - g) * t, b: b + (o.b - b) * t)
    }
}

@MainActor
final class ArtTheme: ObservableObject {
    static let shared = ArtTheme()
    /// One switch for the whole theme.
    static let enabled = true

    @Published private(set) var main = ArtRGB.babson
    @Published private(set) var green = ArtRGB.babson
    @Published private(set) var second = ArtRGB.babson

    private var pending: (ArtRGB, ArtRGB, ArtRGB)?
    private var ready = false
    private var started = false

    /// Call when the player screen appears. The first fade starts a few seconds later.
    func start() {
        guard Self.enabled, !started else { return }
        started = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
            self?.ready = true
            self?.applyPending()
        }
    }

    #if canImport(UIKit)
    func update(from image: UIImage?) {
        guard Self.enabled else { return }
        if let image, let p = Self.palette(from: image) { pending = p } else { pending = (.babson, .babson, .babson) }
        applyPending()
    }
    #endif

    private func applyPending() {
        guard ready, let p = pending else { return }
        withAnimation(.easeInOut(duration: 12)) { main = p.0; green = p.1; second = p.2 }
    }

    // MARK: Colors for each part of the UI (light and dark get different tones)

    /// Text accents, progress, stars, links: the paired green. Lifted in dark mode so it reads.
    func accent(_ scheme: ColorScheme) -> Color {
        guard Self.enabled else { return scheme == .dark ? .brGold : .brGreen }
        if scheme == .dark { let h = green.hsl; return ArtRGB.hsl(h.h, min(max(h.s, 0.45), 0.65), 0.64).color }
        return green.color
    }
    /// Play button and filled buttons: second cover color in light mode, the green in dark.
    func button(_ scheme: ColorScheme) -> Color {
        guard Self.enabled else { return scheme == .dark ? .brGold : .brGreen }
        if scheme == .dark { let h = green.hsl; return ArtRGB.hsl(h.h, min(max(h.s, 0.45), 0.6), 0.42).color }
        return second.color
    }
    /// The visualizer glow: the cover's main color, brightened in dark mode.
    func glow(_ scheme: ColorScheme) -> Color {
        guard Self.enabled else { return scheme == .dark ? .brGold : .brGreen }
        return (scheme == .dark ? main.mixed(with: ArtRGB(r: 1, g: 1, b: 1), 0.3) : main).color
    }
    /// A wash behind the page and a tint for glass cards: rich in light mode, deep and muted in dark mode.
    func wash(_ scheme: ColorScheme) -> Color {
        guard Self.enabled else { return .clear }
        if scheme == .dark { let h = main.hsl; return ArtRGB.hsl(h.h, min(h.s, 0.4), 0.16).color }
        return main.color.opacity(0.30)
    }
    func glassTint(_ scheme: ColorScheme) -> Color? {
        guard Self.enabled else { return nil }
        if scheme == .dark { let h = main.hsl; return ArtRGB.hsl(h.h, min(h.s, 0.4), 0.22).color.opacity(0.7) }
        return main.color.opacity(0.35)
    }

    // MARK: Palette from a cover

    #if canImport(UIKit)
    private static func skinLike(_ h: Double, _ s: Double, _ l: Double) -> Bool {
        h >= 5 && h <= 45 && s >= 0.15 && s <= 0.7 && l >= 0.2 && l <= 0.8
    }
    private static func hueGap(_ a: Double, _ b: Double) -> Double {
        let d = abs(a - b).truncatingRemainder(dividingBy: 360)
        return d > 180 ? 360 - d : d
    }
    /// A green that sits well next to a hue: warm covers get emerald, yellows leaf green, greens a deep green, blues sea green, purples a fresher green.
    private static func pairedGreen(_ h: Double) -> ArtRGB {
        let g: Double = (h >= 345 || h < 45) ? 152 : h < 75 ? 125 : h < 165 ? 158 : h < 255 ? 150 : 138
        return ArtRGB.hsl(g, 0.72, 0.31)
    }

    /// [main color, paired green, second color] from a cover. Skips grays, near black/white and face-colored pixels in the middle.
    static func palette(from image: UIImage) -> (ArtRGB, ArtRGB, ArtRGB)? {
        let n = 40
        guard let cg = image.cgImage else { return nil }
        var px = [UInt8](repeating: 0, count: n * n * 4)
        guard let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))

        let bins = 12
        var w = [Double](repeating: 0, count: bins), x = w, y = w, sat = w, lit = w
        for p in 0..<(n * n) {
            let col = p % n, row = p / n
            let rgb = ArtRGB(r: Double(px[p * 4]) / 255, g: Double(px[p * 4 + 1]) / 255, b: Double(px[p * 4 + 2]) / 255)
            let (h, s, l) = rgb.hsl
            if s < 0.2 || l < 0.12 || l > 0.9 { continue }
            let center = col >= n / 4 && col < n * 3 / 4 && row >= n / 5 && row < n * 4 / 5
            if center && skinLike(h, s, l) { continue }
            let weight = s * (1 - abs(2 * l - 1)) + 0.01
            let b = min(bins - 1, Int(h / (360 / Double(bins))))
            w[b] += weight; x[b] += cos(h * .pi / 180) * weight; y[b] += sin(h * .pi / 180) * weight
            sat[b] += s * weight; lit[b] += l * weight
        }
        let ranked = (0..<bins).filter { w[$0] > 0 }.sorted { w[$0] > w[$1] }.map { i -> (h: Double, s: Double, l: Double) in
            var h = atan2(y[i], x[i]) * 180 / .pi; if h < 0 { h += 360 }
            return (h, sat[i] / w[i], lit[i] / w[i])
        }
        var picked: [(h: Double, s: Double, l: Double)] = []
        for r in ranked where picked.count < 2 {
            if picked.allSatisfy({ hueGap($0.h, r.h) >= 40 }) { picked.append(r) }
        }
        guard let first = picked.first else { return nil }
        if picked.count < 2 { picked.append(((first.h + 35).truncatingRemainder(dividingBy: 360), first.s, first.l)) }
        func cover(_ p: (h: Double, s: Double, l: Double)) -> ArtRGB {
            ArtRGB.hsl(p.h, min(max(p.s, 0.55), 0.9), min(max(p.l, 0.42), 0.58))
        }
        return (cover(picked[0]), pairedGreen(first.h), cover(picked[1]))
    }
    #endif
}
