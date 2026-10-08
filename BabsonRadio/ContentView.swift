import SwiftUI

struct ContentView: View {
    @Environment(\.colorScheme) var scheme
    @ObservedObject private var auth = AuthManager.shared

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
