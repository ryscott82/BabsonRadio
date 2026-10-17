import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct ContentView: View {
    /// The blur under the status bar is for a phone. On the open foldable and iPad the status bar sits at the side, and the blur just washes out the top of the page.
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(\.colorScheme) var scheme
    @ObservedObject private var auth = AuthManager.shared
    @ObservedObject private var profile = ProfileStore.shared
    @ObservedObject private var theme = ArtTheme.shared
    @State private var tab = 0
    @ObservedObject private var board = BoardState.shared
    @State private var paneSize: CGSize = .zero
    /// Bumped each time you come back to Live, so the player loads fresh like at launch (the tab bar went missing on a plain return).
    @State private var liveLoad = 0
    @State private var splashDone = false
    @State private var welcomeSkipped = false
    @State private var askSchoolEmail = false
    @State private var showSchoolEmailSheet = false

    var body: some View {
        // An open foldable in landscape, on any tab but Live: the player stays on the left half, the tab fills the right half.
        let customBar = hSize == .regular && paneSize.width > paneSize.height
        let sideW: CGFloat = (customBar && tab != 0) ? paneSize.width / 2 : 0
        // One explicit answer, recomputed on every tab switch as well as when the board opens or closes:
        // hidden only while you are on Live with the full screen board up, shown in every other case.
        let hideBar = tab == 0 && board.open
        TabView(selection: $tab) {
            LivePlayerView()
                .id(liveLoad)
                .toolbar(hideBar ? .hidden : .visible, for: .tabBar)
                .tag(0)
                .tabItem {
                    BRTabIcon(systemName: "radio", label: "Live")
                }

            ScheduleView()
                .toolbar(hideBar ? .hidden : .visible, for: .tabBar)
                .tag(1)
                .tabItem {
                    BRTabIcon(systemName: "calendar", label: "Schedule")
                }

            LibraryView()
                .toolbar(hideBar ? .hidden : .visible, for: .tabBar)
                .tag(2)
                .tabItem {
                    BRTabIcon(systemName: "books.vertical", label: "Library")
                }

            if profile.hosting {
                NavigationStack { HostPanelView() }
                    .toolbar(hideBar ? .hidden : .visible, for: .tabBar)
                        .tag(3)
                    .tabItem { BRTabIcon(systemName: "mic.fill", label: "Host") }
            }

            // Search is the right-most tab; Profile is the circle button in the top corner of every page.
            SearchView()
                .toolbar(hideBar ? .hidden : .visible, for: .tabBar)
                .tag(4)
                .tabItem {
                    BRTabIcon(systemName: "magnifyingglass", label: "Search")
                }
        }
        // Measured on the full-size TabView (before the padding); the pane appears and disappears with no animation.
        .background { Color.clear.onGeometryChange(for: CGSize.self, of: { $0.size }) { paneSize = $0 } }
        .padding(.leading, sideW)
        .overlay(alignment: .leading) {
            if sideW > 0 { LivePlayerView(sidePane: true).frame(width: sideW) }
        }
        .onChange(of: tab) { old, new in if new == 0 && old != 0 { liveLoad += 1 } }
        .tint(ArtTheme.full(scheme) ? theme.accent(scheme) : (scheme == .dark ? .brGold : .brGreen))
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
        .overlay(alignment: .top) { if hSize != .regular && tab != 0 { StatusBarBlur() } }
        .task(id: auth.isSignedIn) { ContactsManager.shared.promptOnFirstOpen() }
        .task(id: auth.isSignedIn) {
            // Host tab appears while the host window is open; re-check every minute.
            while auth.isSignedIn && !Task.isCancelled {
                await ProfileStore.shared.loadHosting()
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
        .alert("Are you a Babson student?", isPresented: $askSchoolEmail) {
            Button("Add my school email") { showSchoolEmailSheet = true }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("Add your school email to unlock the rest.")
        }
        .sheet(isPresented: $showSchoolEmailSheet) { AddSchoolEmailView() }
        .onChange(of: splashDone) { _, done in maybeAskSchoolEmail(done) }
        .onChange(of: auth.currentUser?.id) { _, _ in maybeAskSchoolEmail(splashDone) }
        .overlay {
            // After the launch splash: the sign-in splash, or the step an Apple / unverified account is stuck on.
            if splashDone && auth.hasResolvedAuth {
                if auth.needsSchoolEmail {
                    AppleSchoolEmailView().transition(.opacity).zIndex(2)
                } else if auth.needsEmailVerification {
                    VerifyEmailView().transition(.opacity).zIndex(2)
                } else if !auth.isSignedIn && !welcomeSkipped {
                    WelcomeView(onSkip: { withAnimation { welcomeSkipped = true } }).transition(.opacity).zIndex(2)
                }
            }
        }
        .overlay {
            if !splashDone {
                SplashView()
                    .transition(.opacity)
                    .zIndex(3)
            }
        }
        .fullScreenCover(isPresented: Binding(get: { splashDone && auth.isSignedIn && auth.needsOnboarding }, set: { _ in })) {
            OnboardingView()
        }
        .onChange(of: auth.isSignedIn) { _, now in if !now { welcomeSkipped = false } }
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


/// Frosted glass over the status bar, like Messages: content scrolls behind it and the clock and battery stay readable.
struct StatusBarBlur: View {
    #if canImport(UIKit)
    private static var inset: CGFloat {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows).first(where: \.isKeyWindow)?.safeAreaInsets.top ?? 0
    }
    #endif

    var body: some View {
        GeometryReader { geo in
            // Read from the window: a GeometryReader that ignores the safe area always reports 0 for it.
            let top = Self.inset
            let _ = geo.size // redraw on rotation
            if top > 0 {
                Rectangle()
                    .fill(.regularMaterial)
                    .frame(height: top + 10)
                    .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.8), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
                    .overlay(alignment: .bottom) { Rectangle().fill(Color.primary.opacity(0.05)).frame(height: 0.5) }
            }
        }
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
}

