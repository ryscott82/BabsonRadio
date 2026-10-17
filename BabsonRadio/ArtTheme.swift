import SwiftUI
import Combine
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

    // MARK: When the cover colors are used
    // Light mode: plain cream with a hint of green. Only the On Air badge follows the cover.
    // Dark mode in the daytime: a darker cream with the green highlight, same idea.
    // Dark mode at night (7pm to 6am): the full cover colors everywhere.

    static var isNight: Bool {
        let h = Calendar.current.component(.hour, from: Date())
        return h >= 19 || h < 6
    }
    /// True when the whole UI should follow the cover.
    static func full(_ scheme: ColorScheme) -> Bool { enabled && scheme == .dark && isNight }

    /// The drawer lip: the cover's main color in every mode (Babson green until a cover has faded in), plus a deeper shade for its gradient.
    var lip: Color { main == .babson ? .brGreenMid : main.color }
    var lipDeep: Color { main == .babson ? .brGreen : main.mixed(with: ArtRGB(r: 0, g: 0, b: 0), 0.35).color }

    /// The On Air badge: the cover's color in every mode, station red until a cover has faded in.
    var badge: Color { second == .babson ? .brRed : second.color }

    /// Keeps a color colorful enough to read, but leaves a true gray gray.
    private static func sat(_ s: Double, _ lo: Double, _ hi: Double) -> Double { s < 0.08 ? s : min(max(s, lo), hi) }

    // MARK: Colors for each part of the UI (light and dark get different tones)

    /// Text accents, progress, stars, links: the paired green. Lifted in dark mode so it reads.
    func accent(_ scheme: ColorScheme) -> Color {
        guard Self.full(scheme) else { return scheme == .dark ? .brGold : .brGreen }
        let h = green.hsl; return ArtRGB.hsl(h.h, Self.sat(h.s, 0.45, 0.65), 0.64).color
    }
    /// Play button and filled buttons: second cover color in light mode, the green in dark.
    func button(_ scheme: ColorScheme) -> Color {
        guard Self.full(scheme) else { return scheme == .dark ? .brGold : .brGreen }
        let h = green.hsl; return ArtRGB.hsl(h.h, Self.sat(h.s, 0.45, 0.6), 0.42).color
    }
    /// The visualizer glow: the cover's main color, brightened in dark mode.
    func glow(_ scheme: ColorScheme) -> Color {
        guard Self.full(scheme) else { return scheme == .dark ? .brGold : .brGreen }
        return main.mixed(with: ArtRGB(r: 1, g: 1, b: 1), 0.3).color
    }
    /// A wash behind the page and a tint for glass cards: rich in light mode, deep and muted in dark mode.
    func wash(_ scheme: ColorScheme) -> Color {
        guard Self.full(scheme) else { return .clear }
        let h = main.hsl; return ArtRGB.hsl(h.h, min(h.s, 0.3), 0.06).color
    }
    func glassTint(_ scheme: ColorScheme) -> Color? {
        guard Self.full(scheme) else { return nil }
        let h = main.hsl; return ArtRGB.hsl(h.h, min(h.s, 0.3), 0.09).color.opacity(0.85)
    }

    // MARK: Palette from a cover
    // How the "dominant" color is chosen. A plain count of pixels picks the biggest area (usually a face, hair, a dark
    // background), which is rarely what a person would call the cover's color. A person picks the color that POPS:
    // saturated, different from the rest of the cover, often small (a title, a logo, a stripe). So:
    //   1. Group the pixels into 7 color clusters (k-means in Oklab, which matches how we see color differences).
    //   2. Score each cluster: area (square root, so small things can still win) x how colorful x how different it is
    //      from the average of the cover x a bonus when it hugs the edges (text, borders, logos).
    //   3. Pull the score down for skin and hair tones in the middle (the face is not the "color" of the cover).
    //   4. Ignore grays, near black and near white. A black and white cover gets a neutral gray, not a made-up hue.

    #if canImport(UIKit)
    private struct Lab { var l: Double, a: Double, b: Double }

    private static func oklab(_ r: Double, _ g: Double, _ b: Double) -> Lab {
        func lin(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        let R = lin(r), G = lin(g), B = lin(b)
        let l = cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
        let m = cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
        let s = cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
        return Lab(l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                   a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                   b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)
    }
    private static func dist(_ p: Lab, _ q: Lab) -> Double {
        let dl = p.l - q.l, da = p.a - q.a, db = p.b - q.b
        return (dl * dl + da * da + db * db).squareRoot()
    }

    /// [main color, accent, second color] from a cover.
    static func palette(from image: UIImage) -> (ArtRGB, ArtRGB, ArtRGB)? {
        let n = 48
        guard let cg = image.cgImage else { return nil }
        var px = [UInt8](repeating: 0, count: n * n * 4)
        guard let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))

        let count = n * n
        var rgb = [(Double, Double, Double)](), lab = [Lab]()
        rgb.reserveCapacity(count); lab.reserveCapacity(count)
        var mean = Lab(l: 0, a: 0, b: 0)
        for p in 0..<count {
            let c = (Double(px[p * 4]) / 255, Double(px[p * 4 + 1]) / 255, Double(px[p * 4 + 2]) / 255)
            let o = oklab(c.0, c.1, c.2)
            rgb.append(c); lab.append(o)
            mean.l += o.l; mean.a += o.a; mean.b += o.b
        }
        mean = Lab(l: mean.l / Double(count), a: mean.a / Double(count), b: mean.b / Double(count))

        // k-means, started from well spread colors so the result is the same every time.
        let k = 7
        var centers = [lab[0]]
        while centers.count < k {
            var best = 0, bestD = -1.0
            for i in stride(from: 0, to: count, by: 3) {
                let d = centers.map { dist($0, lab[i]) }.min() ?? 0
                if d > bestD { bestD = d; best = i }
            }
            centers.append(lab[best])
        }
        var assign = [Int](repeating: 0, count: count)
        for _ in 0..<10 {
            var sum = [Lab](repeating: Lab(l: 0, a: 0, b: 0), count: k), num = [Double](repeating: 0, count: k)
            for i in 0..<count {
                var bi = 0, bd = Double.infinity
                for c in 0..<k { let d = dist(centers[c], lab[i]); if d < bd { bd = d; bi = c } }
                assign[i] = bi
                sum[bi].l += lab[i].l; sum[bi].a += lab[i].a; sum[bi].b += lab[i].b; num[bi] += 1
            }
            for c in 0..<k where num[c] > 0 { centers[c] = Lab(l: sum[c].l / num[c], a: sum[c].a / num[c], b: sum[c].b / num[c]) }
        }

        // Score each cluster.
        struct Cand { var rgb: ArtRGB; var lab: Lab; var score: Double }
        var cands: [Cand] = []
        for c in 0..<k {
            var num = 0.0, edge = 0.0, middle = 0.0
            var r = 0.0, g = 0.0, b = 0.0
            for i in 0..<count where assign[i] == c {
                num += 1; r += rgb[i].0; g += rgb[i].1; b += rgb[i].2
                let x = Double(i % n) / Double(n), y = Double(i / n) / Double(n)
                if x < 0.18 || x > 0.82 || y < 0.18 || y > 0.82 { edge += 1 }
                if x > 0.25 && x < 0.75 && y > 0.2 && y < 0.8 { middle += 1 }
            }
            let share = num / Double(count)
            guard share >= 0.008 else { continue }
            let L = centers[c]
            let chroma = (L.a * L.a + L.b * L.b).squareRoot()
            if chroma < 0.04 || L.l < 0.14 || L.l > 0.96 { continue }       // gray, black, white
            var hue = atan2(L.b, L.a) * 180 / .pi; if hue < 0 { hue += 360 }
            let area = min(share, 0.35).squareRoot()
            let colorful = min(chroma / 0.15, 1.3)
            let pop = min(dist(L, mean) / 0.3, 1.2)
            var score = area * colorful * (0.6 + 0.6 * pop)
            if edge / num > 0.5 { score *= 1.2 }                              // text, borders, logos
            let skin = hue >= 25 && hue <= 78 && L.l >= 0.35 && L.l <= 0.88 && chroma <= 0.15
            if skin && middle / num >= 0.5 { score *= 0.4 }                   // faces and hair in the middle
            cands.append(Cand(rgb: ArtRGB(r: r / num, g: g / num, b: b / num), lab: L, score: score))
        }
        cands.sort { $0.score > $1.score }

        // A cover with no real color (black and white photo, plain gray): a neutral, never a made-up hue.
        guard let first = cands.first else {
            let gray = ArtRGB(r: 0.5, g: 0.5, b: 0.5)
            return (gray, gray, gray)
        }
        let second = cands.dropFirst().first { dist($0.lab, first.lab) >= 0.12 }

        func cover(_ c: ArtRGB) -> ArtRGB {
            let h = c.hsl
            return ArtRGB.hsl(h.h, min(max(h.s, 0.55), 0.9), min(max(h.l, 0.42), 0.58))
        }
        let main = cover(first.rgb)
        let h = main.hsl
        let accent = ArtRGB.hsl(h.h, min(max(h.s, 0.45), 0.75), 0.31)
        let sec = second.map { cover($0.rgb) } ?? ArtRGB.hsl((h.h + 35).truncatingRemainder(dividingBy: 360), h.s, h.l)
        return (main, accent, sec)
    }
    #endif
}
