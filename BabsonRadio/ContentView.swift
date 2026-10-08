import SwiftUI

struct ContentView: View {
    @Environment(\.colorScheme) var scheme
    @ObservedObject private var auth = AuthManager.shared
    @State private var splashDone = false

    var body: some View {
        TabView {
            LivePlayerView()
                .tabItem {
                    BRTabIcon(systemName: "radio", label: "Live")
                }

            ScheduleView()
                .tabItem {
                    BRTabIcon(systemName: "calendar", label: "Schedule")
                }

            LibraryView()
                .tabItem {
                    BRTabIcon(systemName: "books.vertical", label: "Library")
                }

            // Search is the right-most tab; Profile is the circle button in the top corner of every page.
            SearchView()
                .tabItem {
                    BRTabIcon(systemName: "magnifyingglass", label: "Search")
                }
        }
        .tint(scheme == .dark ? .brGold : .brGreen)
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
        .task(id: auth.isSignedIn) { ContactsManager.shared.promptOnFirstOpen() }
        .overlay {
            if !splashDone {
                SplashView()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .task {
            // Hold the splash until the sign-in check is done (at most 6 seconds), and at least long enough to see it.
            let start = Date()
            while !auth.hasResolvedAuth, Date().timeIntervalSince(start) < 6 {
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
            let rest = 1.4 - Date().timeIntervalSince(start)
            if rest > 0 { try? await Task.sleep(nanoseconds: UInt64(rest * 1_000_000_000)) }
            withAnimation(.easeOut(duration: 0.5)) { splashDone = true }
        }
    }
}

// MARK: - Tab bar icon helper

private struct BRTabIcon: View {
    let systemName: String
    let label: String

    var body: some View {
        Label(label, systemImage: systemName)
    }
}

// MARK: - Placeholder screens (will be replaced)



#Preview {
    ContentView()
}
