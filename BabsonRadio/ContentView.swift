import SwiftUI

struct ContentView: View {
    @Environment(\.colorScheme) var scheme
    @ObservedObject private var auth = AuthManager.shared
    @State private var splashDone = false
    @State private var askSchoolEmail = false
    @State private var showSchoolEmailSheet = false

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
        .overlay(alignment: .top) { StatusBarBlur() }
        .task(id: auth.isSignedIn) { ContactsManager.shared.promptOnFirstOpen() }
        .alert("Are you a Babson student?", isPresented: $askSchoolEmail) {
            Button("Add my school email") { showSchoolEmailSheet = true }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("Add your Babson, Olin or Wellesley email to unlock the Library, ratings, reactions and friends.")
        }
        .sheet(isPresented: $showSchoolEmailSheet) { AddSchoolEmailView() }
        .onChange(of: splashDone) { _, done in maybeAskSchoolEmail(done) }
        .onChange(of: auth.currentUser?.id) { _, _ in maybeAskSchoolEmail(splashDone) }
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

extension ContentView {
    /// Guests get a gentle reminder about once a week to add their school email.
    fileprivate func maybeAskSchoolEmail(_ ready: Bool) {
        guard ready, auth.currentUser?.isGuest == true, SchoolEmailPrompt.due() else { return }
        SchoolEmailPrompt.markShown()
        Task { try? await Task.sleep(nanoseconds: 4_000_000_000); askSchoolEmail = true }
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


/// A soft blur over the very top of every tab, so the clock and battery stay readable when content scrolls under them.
struct StatusBarBlur: View {
    var body: some View {
        GeometryReader { geo in
            Rectangle()
                .fill(.ultraThinMaterial.opacity(0.55))
                .frame(height: geo.safeAreaInsets.top)
                .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black.opacity(0.6), location: 0.55), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
        }
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
}
