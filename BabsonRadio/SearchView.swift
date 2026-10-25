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
                BRSectionHeader(title: "Browse categories")
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
                BRSectionHeader(title: "Recent episodes")
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

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                Image(systemName: iconName).font(.system(size: 17))
                Text(category.rawValue).font(BRFont.body(16, .regular)).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .modifier(HWKeyInk())
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(HWKeyFace(corner: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(category.rawValue)
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
