import SwiftUI

// MARK: - Episode Card (horizontal list item)
// 90×90 thumbnail + text stack, used in horizontal scroll rows

struct EpisodeCard: View {
    let episode: Episode
    var onTap: (() -> Void)? = nil
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Button(action: { onTap?() }) {
            HStack(spacing: 14) {
                // ── Thumbnail ─────────────────────────────────────
                EpisodeThumbnail(episode: episode)

                // ── Text ─────────────────────────────────────────
                VStack(alignment: .leading, spacing: 5) {
                    // NEW badge + category
                    HStack(spacing: 6) {
                        if episode.isNew {
                            BRTagChip(text: "NEW", style: .gold)
                        }
                        BRTagChip(text: episode.category.rawValue.uppercased(), style: .subtle)
                    }

                    Text(episode.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(episode.showName)
                        .font(.system(size: 12))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)

                    HStack(spacing: 8) {
                        Image(systemName: "clock")
                            .font(.system(size: 10))
                            .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                        Text(episode.duration)
                            .font(.system(size: 12))
                            .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                        Text("·")
                            .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                        Text(episode.dateLabel)
                            .font(.system(size: 12))
                            .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                    }
                }

                Spacer(minLength: 0)

                // ── Play chevron ─────────────────────────────────
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
            }
            .padding(14)
            .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Compact card (for horizontal scroll strips)

struct EpisodeCardCompact: View {
    let episode: Episode
    var onTap: (() -> Void)? = nil
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Button(action: { onTap?() }) {
            VStack(alignment: .leading, spacing: 10) {
                // Square thumbnail
                EpisodeThumbnail(episode: episode, size: 160)
                    .frame(width: 160, height: 160)

                VStack(alignment: .leading, spacing: 4) {
                    if episode.isNew {
                        BRTagChip(text: "NEW", style: .gold)
                    }
                    Text(episode.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        .lineLimit(2)
                        .frame(width: 160, alignment: .leading)

                    Text(episode.showName)
                        .font(.system(size: 11))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .lineLimit(1)
                        .frame(width: 160, alignment: .leading)

                    Text(episode.duration)
                        .font(.system(size: 11))
                        .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                }
            }
            .frame(width: 160)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Thumbnail

struct EpisodeThumbnail: View {
    let episode: Episode
    var size: CGFloat = 90
    @Environment(\.colorScheme) var scheme

    var gradientColors: [Color] {
        switch episode.thumbnailColor {
        case .green:
            return [Color(hex: "003D27"), Color(hex: "006644")]
        case .dark:
            return [Color(hex: "111111"), Color(hex: "1E1E1E")]
        case .warm:
            return [Color(hex: "2A1A08"), Color(hex: "3D2810")]
        }
    }

    var accentColor: Color {
        switch episode.thumbnailColor {
        case .green: return .brGold
        case .dark:  return Color(hex: "888888")
        case .warm:  return Color(hex: "DDB050")
        }
    }

    var body: some View {
        ZStack {
            // Gradient base
            RoundedRectangle(cornerRadius: 10)
                .fill(LinearGradient(
                    colors: gradientColors,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: size, height: size)

            // Subtle grain
            Canvas { context, sz in
                for row in stride(from: 0, to: sz.height, by: 1.5) {
                    for col in stride(from: 0, to: sz.width, by: 1.5) {
                        let seed = Double(Int(row) &* 997 &+ Int(col) &* 311)
                        let n = (sin(seed * 0.6173) * 0.5 + 0.5)
                        if n > 0.75 {
                            context.fill(
                                Path(CGRect(x: col, y: row, width: 1.5, height: 1.5)),
                                with: .color(.white.opacity((n - 0.75) * 0.4))
                            )
                        }
                    }
                }
            }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .allowsHitTesting(false)

            // Episode number or mic icon
            VStack(spacing: 2) {
                if let epNum = episode.episodeNumber {
                    Text("EP")
                        .font(BRFont.display(9))
                        .foregroundColor(accentColor.opacity(0.7))
                        .kerning(2)
                    Text("\(epNum)")
                        .font(BRFont.display(28))
                        .foregroundColor(accentColor)
                } else {
                    Image(systemName: categoryIcon)
                        .font(.system(size: size * 0.28, weight: .medium))
                        .foregroundColor(accentColor.opacity(0.8))
                }
            }

            // Gold bottom stripe
            VStack {
                Spacer()
                Rectangle()
                    .fill(accentColor.opacity(0.45))
                    .frame(height: 2)
            }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .frame(width: size, height: size)
    }

    private var categoryIcon: String {
        switch episode.category {
        case .music:     return "music.note"
        case .interview: return "person.2"
        case .podcast:   return "mic"
        case .talk:      return "bubble.left.and.bubble.right"
        case .news:      return "newspaper"
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        ForEach(Episode.sampleEpisodes) { ep in
            EpisodeCard(episode: ep)
        }
    }
    .padding()
    .background(Color.brDkBg)
}
