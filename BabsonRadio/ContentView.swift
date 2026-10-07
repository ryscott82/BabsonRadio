import SwiftUI

struct ContentView: View {
    @Environment(\.colorScheme) var scheme

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

            FeedView()
                .tabItem {
                    BRTabIcon(systemName: "rectangle.stack", label: "Shows")
                }

            SearchView()
                .tabItem {
                    BRTabIcon(systemName: "magnifyingglass", label: "Browse")
                }

            ProfileView()
                .tabItem {
                    BRTabIcon(systemName: "person", label: "Profile")
                }
        }
        .tint(scheme == .dark ? .brGold : .brGreen)
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
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
