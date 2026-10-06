import SwiftUI

// MARK: - Feed / Shows Tab
// Replaces the placeholder FeedView in ContentView

struct FeedView: View {
    @Environment(\.colorScheme) var scheme

    // Filter state
    @State private var selectedCategory: ShowCategory? = nil

    var filteredEpisodes: [Episode] {
        guard let cat = selectedCategory else { return Episode.sampleEpisodes }
        return Episode.sampleEpisodes.filter { $0.category == cat }
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {

                    // ── Featured horizontal strip ──────────────────
                    featuredStrip
                        .padding(.top, 8)

                    // ── Category filter pills ──────────────────────
                    categoryFilter
                        .padding(.top, 28)
                        .padding(.bottom, 20)

                    // ── Episode list ───────────────────────────────
                    BRSectionHeader(
                        title: selectedCategory == nil ? "ALL EPISODES" : selectedCategory!.rawValue.uppercased()
                    )
                    .padding(.horizontal, 20)
                    .padding(.bottom, 14)

                    LazyVStack(spacing: 10) {
                        ForEach(filteredEpisodes) { episode in
                            EpisodeCard(episode: episode)
                                .padding(.horizontal, 20)
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 0) {
                        Text("BABSON ")
                            .font(BRFont.display(18))
                            .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            .kerning(3)
                        Text("RADIO")
                            .font(BRFont.display(18))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                            .kerning(3)
                    }
                }
            }
        }
    }

    // MARK: - Featured Strip (horizontal compact cards)

    private var featuredStrip: some View {
        VStack(alignment: .leading, spacing: 14) {
            BRSectionHeader(title: "FEATURED")
                .padding(.horizontal, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    Spacer(minLength: 6)
                    ForEach(Episode.sampleEpisodes) { episode in
                        EpisodeCardCompact(episode: episode)
                    }
                    Spacer(minLength: 6)
                }
            }
        }
    }

    // MARK: - Category Filter

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                Spacer(minLength: 10)

                // "All" pill
                FilterPill(label: "All", isSelected: selectedCategory == nil) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedCategory = nil
                    }
                }

                ForEach(ShowCategory.allCases, id: \.self) { cat in
                    FilterPill(label: cat.rawValue, isSelected: selectedCategory == cat) {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedCategory = selectedCategory == cat ? nil : cat
                        }
                    }
                }

                Spacer(minLength: 10)
            }
        }
    }
}

// MARK: - Filter Pill

struct FilterPill: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(BRFont.display(13))
                .kerning(1)
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .background(
                    isSelected
                        ? (scheme == .dark ? Color.brGold : Color.brGreen)
                        : (scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
                )
                .foregroundColor(
                    isSelected
                        ? (scheme == .dark ? Color.brDkBg : .white)
                        : (scheme == .dark ? Color.brDkSub : Color.brLtSub)
                )
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(
                            isSelected ? Color.clear : (scheme == .dark ? Color.brDkBorder : Color.brLtBorder),
                            lineWidth: 1
                        )
                )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    FeedView()
}
