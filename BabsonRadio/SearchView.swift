import SwiftUI

// MARK: - Browse / Search Tab

struct SearchView: View {
    @Environment(\.colorScheme) var scheme
    @State private var query = ""
    @State private var isSearching = false
    @ObservedObject private var lib = LibraryManager.shared
    @ObservedObject private var auth = AuthManager.shared

    private var canUse: Bool { auth.canAccessLibrary }

    var searchResults: [LibEpisode] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return [] }
        let q = query.lowercased()
        return lib.all.filter {
            $0.title.lowercased().contains(q) ||
            $0.showName.lowercased().contains(q) ||
            $0.category.lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        if query.trimmingCharacters(in: .whitespaces).isEmpty {
                            browseContent
                        } else {
                            resultsContent
                        }
                    }
                }
            }
            .hwPage()
            .navigationTitle("")
            .profileButton()
            .task(id: canUse) { if canUse { await lib.loadAll() } }
            .onChange(of: isSearching) { _, now in SearchState.shared.active = now }
            .onDisappear { SearchState.shared.active = false }
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: $query,
                isPresented: $isSearching,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Shows, episodes, categories…"
            )
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 0) {
                        Text("Babson ")
                            .font(BRFont.display(18))
                            .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                            .kerning(3)
                        Text("Radio")
                            .font(BRFont.display(18))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                            .kerning(3)
                    }
                }
            }
        }
    }

    // MARK: - Browse (no query)

    private var browseContent: some View {
        VStack(alignment: .leading, spacing: 32) {

            // ── Categories grid ──────────────────────────────────
            VStack(alignment: .leading, spacing: 14) {
                BRSectionHeader(title: "BROWSE CATEGORIES")
                    .padding(.horizontal, 20)

                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(ShowCategory.allCases, id: \.self) { cat in
                        CategoryTile(category: cat, onTap: { query = cat.rawValue })
                    }
                }
                .padding(.horizontal, 20)
            }

            // ── Recent episodes ──────────────────────────────────
            VStack(alignment: .leading, spacing: 14) {
                BRSectionHeader(title: "RECENT EPISODES")
                    .padding(.horizontal, 20)

                if !canUse {
                    Text(auth.isSignedIn ? "Ask a Babson student to sponsor you." : "Sign in with your Babson email to browse episodes.")
                        .font(BRFont.body(14, .regular)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .padding(.horizontal, 20)
                } else if lib.all.isEmpty {
                    Text(lib.loaded ? "No episodes yet." : "Loading…")
                        .font(BRFont.body(14, .regular)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .padding(.horizontal, 20)
                }
                LazyVStack(spacing: 10) {
                    ForEach(lib.all) { episode in
                        EpisodeListRow(ep: episode)
                            .padding(.horizontal, 20)
                    }
                }
            }

            Spacer(minLength: 40)
        }
        .padding(.top, 8)
    }

    // MARK: - Results

    private var resultsContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            if searchResults.isEmpty {
                emptyResults
            } else {
                Text("\(searchResults.count) result\(searchResults.count == 1 ? "" : "s")")
                    .font(BRFont.display(11))
                    .kerning(2)
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 14)

                LazyVStack(spacing: 10) {
                    ForEach(searchResults) { episode in
                        EpisodeListRow(ep: episode)
                            .padding(.horizontal, 20)
                    }
                }
                .padding(.bottom, 40)
            }
        }
        .padding(.top, 8)
    }

    private var emptyResults: some View {
        VStack(spacing: 16) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 40, weight: .light))
                .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                .padding(.top, 60)

            Text("No results for \"\(query)\"")
                .font(BRFont.display(20))
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                .kerning(1)
                .multilineTextAlignment(.center)

            Text("Try a show, episode or category.")
                .font(BRFont.body(14, .regular))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Category Tile

struct CategoryTile: View {
    let category: ShowCategory
    var onTap: () -> Void = {}
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomLeading) {
                // Background
                RoundedRectangle(cornerRadius: 14)
                    .fill(LinearGradient(
                        colors: gradientColors,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(height: 90)

                // Subtle grain
                Canvas { context, size in
                    for row in stride(from: 0, to: size.height, by: 2) {
                        for col in stride(from: 0, to: size.width, by: 2) {
                            let seed = Double(Int(row) &* 613 &+ Int(col) &* 317)
                            let n = sin(seed * 0.5831) * 0.5 + 0.5
                            if n > 0.78 {
                                context.fill(
                                    Path(CGRect(x: col, y: row, width: 2, height: 2)),
                                    with: .color(.white.opacity((n - 0.78) * 0.35))
                                )
                            }
                        }
                    }
                }
                .frame(height: 90)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .allowsHitTesting(false)

                // Icon + label
                VStack(alignment: .leading, spacing: 4) {
                    Image(systemName: iconName)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(.white.opacity(0.9))
                    Text(category.rawValue.uppercased())
                        .font(BRFont.display(16))
                        .kerning(1.5)
                        .foregroundColor(.white)
                }
                .padding(14)
            }
        }
        .buttonStyle(.plain)
    }

    var gradientColors: [Color] {
        switch category {
        case .music:     return [Color(hex: "003D27"), Color(hex: "006644")]
        case .interview: return [Color(hex: "1A2E4A"), Color(hex: "2E5C8A")]
        case .podcast:   return [Color(hex: "2A1A08"), Color(hex: "5C3A10")]
        case .talk:      return [Color(hex: "1A0A2E"), Color(hex: "4A1A7A")]
        case .news:      return [Color(hex: "2A0808"), Color(hex: "7A1A1A")]
        }
    }

    var iconName: String {
        switch category {
        case .music:     return "music.note"
        case .interview: return "person.2"
        case .podcast:   return "mic"
        case .talk:      return "bubble.left.and.bubble.right"
        case .news:      return "newspaper"
        }
    }
}

#Preview {
    SearchView()
}
