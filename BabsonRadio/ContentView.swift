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
    @ObservedObject private var listen = ListenGuard.shared
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var theme = ArtTheme.shared
    @State private var tab = 0
    @ObservedObject private var board = BoardState.shared
    @State private var paneSize: CGSize = .zero
    /// Bumped each time you come back to Live, so the player loads fresh like at launch (the tab bar went missing on a plain return).
    @State private var liveLoad = 0
    @State private var splashDone = false
    /// Day the host welcome was last dismissed. Lives only in memory, so a fully closed app shows it again.
    @State private var hostWelcomeDay = HostWelcome.shownDay
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
        return chrome(tabs(hideBar: hideBar, sideW: sideW))
    }

    private func tabs(hideBar: Bool, sideW: CGFloat) -> some View {
        TabView(selection: $tab) {
            LivePlayerView()
                .id(liveLoad)
                .modifier(TabBarStyle(hidden: hideBar))
                .tag(0)
                .tabItem {
                    BRTabIcon(systemName: "radio", label: "Live")
                }

            ScheduleView()
                .padding(.leading, sideW)
                .modifier(TabBarStyle(hidden: hideBar))
                .tag(1)
                .tabItem {
                    BRTabIcon(systemName: "calendar", label: "Schedule")
                }

            LibraryView()
                .padding(.leading, sideW)
                .modifier(TabBarStyle(hidden: hideBar))
                .tag(2)
                .tabItem {
                    BRTabIcon(systemName: "books.vertical", label: "Library")
                }

            if profile.hosting {
                NavigationStack { HostPanelView() }
                    .padding(.leading, sideW)
                    .modifier(TabBarStyle(hidden: hideBar))
                    .tag(3)
                    .tabItem { BRTabIcon(systemName: "mic.fill", label: "Host") }
            }

            // Search is the right-most tab; Profile is the circle button in the top corner of every page.
            SearchView()
                .padding(.leading, sideW)
                .modifier(TabBarStyle(hidden: hideBar))
                .tag(4)
                .tabItem {
                    BRTabIcon(systemName: "magnifyingglass", label: "Search")
                }
        }
        // Measured on the full-size TabView (before the padding); the pane appears and disappears with no animation.
        .environment(\.globalProfile, hSize == .regular)
        .background { Color.clear.onGeometryChange(for: CGSize.self, of: { $0.size }) { paneSize = $0 } }
        // One profile button for every tab on a wide window, so it stays put when you switch.
        .overlay(alignment: .topTrailing) {
            if hSize == .regular { ProfileCircleButton().padding(.trailing, 20).padding(.top, 12) }
        }
        .overlay(alignment: .leading) {
            if sideW > 0 { LivePlayerView(sidePane: true, paneWidth: sideW) }
        }
    }

    fileprivate func chrome<V: View>(_ content: V) -> some View {
        overlays(alerts(lifecycle(content)))
    }

    private var tintColor: Color {
        if ArtTheme.full(scheme) { return theme.accent(scheme) }
        return scheme == .dark ? Color.brGold : Color.brGreen
    }
    private var pageBackground: Color { scheme == .dark ? Color.brDkBg : Color.brLtBg }
    private var noticeShown: Binding<Bool> {
        Binding(get: { listen.notice != nil }, set: { if !$0 { listen.notice = nil } })
    }
    private var onboardingShown: Binding<Bool> {
        Binding(get: { splashDone && auth.isSignedIn && auth.needsOnboarding }, set: { _ in })
    }

    private func lifecycle<V: View>(_ content: V) -> some View {
        content
            .onChange(of: tab) { old, new in if new == 0 && old != 0 { liveLoad += 1 } }
            .tint(tintColor)
            .background(pageBackground)
            .overlay(alignment: .top) { statusBlur }
            .task(id: auth.isSignedIn) { ContactsManager.shared.promptOnFirstOpen() }
            .onAppear { ActivityMonitor.install() }
            .onChange(of: scenePhase) { _, p in if p == .active { listen.markActive() } }
            // The profile circle in the corner needs the chosen color from the start.
            .task(id: auth.isSignedIn) { if auth.isSignedIn { await ProfileStore.shared.load() } }
            .task(id: auth.isSignedIn) { await keepHostingFresh() }
            .onChange(of: splashDone) { _, done in maybeAskSchoolEmail(done) }
            .onChange(of: auth.currentUser?.id) { _, _ in maybeAskSchoolEmail(splashDone) }
            .onChange(of: auth.isSignedIn) { _, now in if !now { welcomeSkipped = false } }
            .task { await runSplash() }
    }

    private func alerts<V: View>(_ content: V) -> some View {
        content
            .alert("Still listening?", isPresented: $listen.asking) {
                Button("Keep listening") { listen.markActive() }
            } message: { Text("The music stops in a couple of minutes unless you tap.") }
            .alert("Listening stopped", isPresented: noticeShown) {
                Button("OK", role: .cancel) {}
            } message: { Text(listen.notice ?? "") }
            .alert("Are you a Babson student?", isPresented: $askSchoolEmail) {
                Button("Add my school email") { showSchoolEmailSheet = true }
                Button("Not now", role: .cancel) {}
            } message: {
                Text("Add your school email to unlock the rest.")
            }
            .sheet(isPresented: $showSchoolEmailSheet) { AddSchoolEmailView() }
            .fullScreenCover(isPresented: onboardingShown) { OnboardingView() }
    }

    private func overlays<V: View>(_ content: V) -> some View {
        content
            .overlay { gateOverlay }
            .overlay { hostWelcome }
            .overlay { splashOverlay }
    }

    @ViewBuilder private var statusBlur: some View {
        if hSize != .regular && tab != 0 { StatusBarBlur() }
    }

    /// After the launch splash: the sign-in splash, or the step an Apple / unverified account is stuck on.
    @ViewBuilder private var gateOverlay: some View {
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

    @ViewBuilder private var splashOverlay: some View {
        if !splashDone { SplashView().transition(.opacity).zIndex(3) }
    }

    /// Host tab appears while the host window is open; re-check every minute.
    private func keepHostingFresh() async {
        while auth.isSignedIn && !Task.isCancelled {
            await ProfileStore.shared.loadHosting()
            try? await Task.sleep(nanoseconds: 60_000_000_000)
        }
    }

    /// Hold the splash until the sign-in check is done (at most 6 seconds), and at least long enough to see it.
    private func runSplash() async {
        let start = Date()
        while !auth.hasResolvedAuth, Date().timeIntervalSince(start) < 6 {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        let rest = 1.4 - Date().timeIntervalSince(start)
        if rest > 0 { try? await Task.sleep(nanoseconds: UInt64(rest * 1_000_000_000)) }
        withAnimation(.easeOut(duration: 0.5)) { splashDone = true }
    }
}

extension ContentView {
    private var showHostWelcome: Bool {
        guard splashDone, auth.isSignedIn, profile.hosting else { return false }
        guard !auth.needsOnboarding, !auth.needsSchoolEmail, !auth.needsEmailVerification else { return false }
        return hostWelcomeDay != HostWelcome.todayKey
    }

    /// Hosts get a welcome once a day (and again after the app was closed completely), then land on the Host tab.
    @ViewBuilder private var hostWelcome: some View {
        if showHostWelcome {
            HostWelcomeView {
                HostWelcome.shownDay = HostWelcome.todayKey
                withAnimation(.easeInOut(duration: 0.4)) { hostWelcomeDay = HostWelcome.todayKey; tab = 3 }
            }
            .transition(.opacity).zIndex(2)
        }
    }

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



// MARK: - Host welcome

enum HostWelcome {
    /// Process-lifetime memory: reset when the app is swiped away and reopened.
    static var shownDay = ""
    static var todayKey: String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return "\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0)"
    }
}

struct HostWelcomeView: View {
    let onContinue: () -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var shown = false

    var body: some View {
        ZStack {
            (scheme == .dark ? Color.brDkBg : Color.brLtBg).ignoresSafeArea()
            VStack(spacing: 16) {
                Spacer()
                Image(systemName: "mic.fill").font(.system(size: 44)).foregroundColor(scheme == .dark ? .brGold : .brGreen)
                Text("Welcome, Host").font(BRFont.display(34)).foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text("Your Host tab is ready.").font(.system(size: 15)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                Spacer()
                Button(action: onContinue) {
                    Text("CONTINUE").font(BRFont.display(15)).kerning(2)
                        .frame(maxWidth: .infinity).padding(.vertical, 16)
                        .background(scheme == .dark ? Color.brGold : Color.brGreen)
                        .foregroundColor(scheme == .dark ? .brDkBg : .white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 32).padding(.bottom, 40)
            }
            .opacity(shown ? 1 : 0)
        }
        .onAppear { withAnimation(.easeIn(duration: 0.5)) { shown = true } }
    }
}


/// The tab bar always sits on a soft blur, and is hidden only while the full screen board is up.
struct TabBarStyle: ViewModifier {
    let hidden: Bool
    func body(content: Content) -> some View {
        content
            .toolbar(hidden ? .hidden : .visible, for: .tabBar)
            .toolbarBackground(.ultraThinMaterial, for: .tabBar)
            .toolbarBackgroundVisibility(.visible, for: .tabBar)
    }
}
