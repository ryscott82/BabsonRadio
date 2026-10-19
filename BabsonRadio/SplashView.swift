import SwiftUI

/// Shown while the app starts, so it is never a blank screen.
/// Light mode: cream with the beaver. Dark mode: pure black, with sweeping club lights only after 7pm (until 4am).
/// It matches the system launch screen (same colors, same logo size and spot), so nothing jumps when it takes over.
struct SplashView: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    private var night: Bool { scheme == .dark }
    /// The party: dark mode and between 7pm and 4am on the phone's clock. Decided once when the splash appears.
    private let evening: Bool = {
        let h = Calendar.current.component(.hour, from: Date())
        return h >= 19 || h < 4
    }()
    private var party: Bool { night && evening }
    /// Same cream as the system launch screen (LaunchBackground in the asset catalog).
    private static let cream = Color(red: 0.953, green: 0.914, blue: 0.824)

    var body: some View {
        ZStack {
            (night ? Color.black : Self.cream).ignoresSafeArea()

            if party {
                ClubLights(animated: !reduceMotion).ignoresSafeArea()
            }

            // Same size and spot as the launch screen image, so the hand-off is seamless.
            Image("LaunchLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 167.67)
                .scaleEffect(appeared && !reduceMotion ? 1.0 : 0.98)
                .shadow(color: party ? Color.white.opacity(0.18) : Color.clear, radius: 30)
                .overlay(alignment: .top) {
                    VStack(spacing: 0) {
                        Text("Babson")
                            .font(BRFont.display(14))
                            .foregroundColor(night ? .brGold : .brGreen)
                            .kerning(5)
                        Text("Radio")
                            .font(BRFont.display(30))
                            .foregroundColor(night ? .white : .brLtText)
                            .kerning(5)
                    }
                    .offset(y: 190)
                    .opacity(appeared ? 1 : 0)
                }
        }
        .accessibilityHidden(true)
        .onAppear { withAnimation(.easeOut(duration: 0.9)) { appeared = true } }
    }
}

/// Slow-sweeping colored beams from above, pulsing gently at about 120 beats per minute.
private struct ClubLights: View {
    let animated: Bool

    var body: some View {
        if animated {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
                Canvas { ctx, size in ClubLights.draw(&ctx, size, tl.date.timeIntervalSinceReferenceDate) }
            }
        } else {
            Canvas { ctx, size in ClubLights.draw(&ctx, size, 3) }
        }
    }

    nonisolated private static func draw(_ ctx: inout GraphicsContext, _ size: CGSize, _ t: Double) {
        let w = size.width, h = size.height
        let palette: [Color] = [
            Color(red: 0.18, green: 0.71, blue: 0.49),  // Babson green
            Color(red: 0.24, green: 0.84, blue: 0.96),  // cyan
            Color(red: 1.00, green: 0.24, blue: 0.80),  // magenta
            Color(red: 1.00, green: 0.69, blue: 0.13),  // amber
            Color(red: 0.55, green: 0.36, blue: 1.00),  // violet
        ]
        let pulse = 0.72 + 0.28 * pow(max(0, sin(t * 2 * .pi * 2)), 4)   // 2 Hz = 120 bpm
        ctx.blendMode = .plusLighter

        // Beams from the top edge, swinging back and forth.
        for i in 0..<5 {
            let fi = Double(i)
            let origin = CGPoint(x: w * (0.1 + 0.2 * fi), y: -10)
            let swing = sin(t * (0.45 + fi * 0.11) + fi * 1.9) * 0.62
            drawBeam(&ctx, from: origin, angle: .pi / 2 + swing, length: h * 1.25, spread: 0.075,
                     color: palette[i % palette.count], alpha: 0.5 * pulse)
        }
        // Two lower beams from the bottom corners, crossing the middle.
        for (j, x) in [w * 0.04, w * 0.96].enumerated() {
            let fj = Double(j)
            let swing = sin(t * 0.38 + fj * 2.6) * 0.5
            drawBeam(&ctx, from: CGPoint(x: x, y: h + 10), angle: -.pi / 2 + (j == 0 ? 0.35 : -0.35) + swing,
                     length: h * 0.95, spread: 0.06, color: palette[(j * 2 + 1) % palette.count], alpha: 0.3 * pulse)
        }
        // A soft wash so the whole screen glows a little.
        let wash = CGRect(x: -w * 0.2, y: -h * 0.15, width: w * 1.4, height: h * 0.5)
        ctx.fill(Path(ellipseIn: wash),
                 with: .radialGradient(Gradient(colors: [palette[Int(t / 3) % palette.count].opacity(0.16 * pulse), .clear]),
                                       center: CGPoint(x: w / 2, y: 0), startRadius: 0, endRadius: w * 0.8))
    }

    nonisolated private static func drawBeam(_ ctx: inout GraphicsContext, from o: CGPoint, angle: Double, length: Double,
                                              spread: Double, color: Color, alpha: Double) {
        let a1 = angle - spread, a2 = angle + spread
        let p1 = CGPoint(x: o.x + cos(a1) * length, y: o.y + sin(a1) * length)
        let p2 = CGPoint(x: o.x + cos(a2) * length, y: o.y + sin(a2) * length)
        var path = Path()
        path.move(to: o); path.addLine(to: p1); path.addLine(to: p2); path.closeSubpath()
        let end = CGPoint(x: o.x + cos(angle) * length, y: o.y + sin(angle) * length)
        ctx.fill(path, with: .linearGradient(Gradient(colors: [color.opacity(alpha), color.opacity(0)]), startPoint: o, endPoint: end))
    }
}
