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

    private var dark: Bool { scheme == .dark }

    var body: some View {
        Button(action: onTap) {
            ZStack {
                // Leather cabinet in the category's color
                RoundedRectangle(cornerRadius: 14)
                    .fill(LinearGradient(colors: [leather, leather.opacity(0.78)], startPoint: .top, endPoint: .bottom))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.14), lineWidth: 1))
                    .shadow(color: .black.opacity(0.35), radius: 4, y: 3)

                // Face plate
                RoundedRectangle(cornerRadius: 8)
                    .fill(LinearGradient(
                        colors: dark ? [Color(hex: "262622"), Color(hex: "121210")] : [Color(hex: "F6F0E0"), Color(hex: "E2D8C0")],
                        startPoint: .top, endPoint: .bottom))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(dark ? 0.6 : 0.28), lineWidth: 1))
                    .padding(7)

                HStack(spacing: 12) {
                    // Brushed steel knob with a ring in the category color
                    ZStack {
                        Circle().fill(AngularGradient(
                            colors: [Color(hex: "838281"), Color(hex: "D9D8D3"), Color(hex: "6B6A66"), Color(hex: "ECEBE6"), Color(hex: "7C7B77"), Color(hex: "D3D2CD"), Color(hex: "838281")],
                            center: .center))
                        Circle().stroke(led, lineWidth: 2.5).padding(-3)
                        Image(systemName: iconName)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(Color(hex: "1A1710"))
                    }
                    .frame(width: 38, height: 38)
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 2)

                    VStack(alignment: .leading, spacing: 7) {
                        Text(category.rawValue.uppercased())
                            .font(BRFont.display(16))
                            .kerning(1.5)
                            .foregroundColor(dark ? Color(hex: "EFE9D6") : Color(hex: "1A1710"))
                            .lineLimit(1).minimumScaleFactor(0.7)
                        // Level lights
                        HStack(spacing: 4) {
                            ForEach(0..<6, id: \.self) { n in
                                Capsule()
                                    .fill(n < lit ? led : Color.black.opacity(dark ? 0.55 : 0.18))
                                    .frame(width: 10, height: 5)
                                    .shadow(color: n < lit ? led.opacity(0.7) : .clear, radius: 2)
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 20)
            }
            .overlay(alignment: .topLeading) { screw }
            .overlay(alignment: .topTrailing) { screw }
            .overlay(alignment: .bottomLeading) { screw }
            .overlay(alignment: .bottomTrailing) { screw }
            .frame(height: 90)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(category.rawValue)
    }

    private var screw: some View {
        Circle().fill(Color(hex: "BDBBB3")).frame(width: 5, height: 5).padding(5)
            .overlay(Circle().stroke(Color.black.opacity(0.4), lineWidth: 0.5).padding(5))
    }

    /// Cabinet color for each category.
    private var leather: Color {
        switch category {
        case .music:     return Color(hex: "0B5B3C")
        case .interview: return Color(hex: "24476F")
        case .podcast:   return Color(hex: "7A4A18")
        case .talk:      return Color(hex: "5A2B8C")
        case .news:      return Color(hex: "8E2626")
        }
    }
    /// Light color (knob ring and level lights).
    private var led: Color {
        switch category {
        case .music:     return Color(hex: "2FD08A")
        case .interview: return Color(hex: "4FA3FF")
        case .podcast:   return Color(hex: "FFAE42")
        case .talk:      return Color(hex: "B97CFF")
        case .news:      return Color(hex: "FF5A4F")
        }
    }
    private var lit: Int {
        switch category {
        case .music: return 5
        case .interview: return 4
        case .podcast: return 3
        case .talk: return 4
        case .news: return 2
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
