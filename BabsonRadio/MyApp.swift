import SwiftUI
import AVFoundation
import UIKit
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

/// Passes the phone's push token to Firebase (only matters once an admin turns notifications on).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
#if canImport(FirebaseMessaging)
        Messaging.messaging().apnsToken = deviceToken
#endif
    }
}

@main struct MyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    init() {
#if canImport(FirebaseCore)
        // Needs GoogleService-Info.plist in the app target (see SETUP_IOS.md).
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            BRAppCheck.install() // must come before configure()
            FirebaseApp.configure()
        }
#endif
        Self.styleNavigationBars()
        // Boot audio session immediately so the system knows this is a playback app
        _ = AudioPlayerManager.shared
        PresenceManager.shared.start()
        Task { @MainActor in ReminderManager.shared.start() }
    }

    /// Hardware look for every navigation bar: scratched glass (dark) or ceramic (light) once content scrolls under it,
    /// nothing at all at the top, Barlow Condensed titles.
    private static func styleNavigationBars() {
        let ink = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.957, green: 0.925, blue: 0.855, alpha: 1) : UIColor(red: 0.102, green: 0.09, blue: 0.063, alpha: 1) }
        let title = UIFont(name: "BarlowCondensed-Bold", size: 20) ?? .systemFont(ofSize: 18, weight: .bold)
        let large = UIFont(name: "BarlowCondensed-Bold", size: 34) ?? .systemFont(ofSize: 32, weight: .bold)

        let standard = UINavigationBarAppearance()
        standard.configureWithDefaultBackground()
        standard.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        standard.backgroundColor = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.094, green: 0.094, blue: 0.082, alpha: 0.74) : UIColor(red: 0.937, green: 0.918, blue: 0.851, alpha: 0.82) }
        standard.titleTextAttributes = [.font: title, .foregroundColor: ink]
        standard.largeTitleTextAttributes = [.font: large, .foregroundColor: ink]

        let edge = UINavigationBarAppearance()
        edge.configureWithTransparentBackground()
        edge.titleTextAttributes = [.font: title, .foregroundColor: ink]
        edge.largeTitleTextAttributes = [.font: large, .foregroundColor: ink]

        let bar = UINavigationBar.appearance()
        bar.standardAppearance = standard
        bar.compactAppearance = standard
        bar.scrollEdgeAppearance = edge

        // Barlow on bar buttons ("Done", "Sign Out") and tab labels, so no system font is left in the chrome.
        let button = UIFont(name: "Barlow-SemiBold", size: 16) ?? .systemFont(ofSize: 16, weight: .semibold)
        for state in [UIControl.State.normal, .highlighted, .disabled] {
            UIBarButtonItem.appearance().setTitleTextAttributes([.font: button], for: state)
        }
        let tabLabel = UIFont(name: "Barlow-SemiBold", size: 10) ?? .systemFont(ofSize: 10, weight: .semibold)
        UITabBarItem.appearance().setTitleTextAttributes([.font: tabLabel], for: .normal)
        UITabBarItem.appearance().setTitleTextAttributes([.font: tabLabel], for: .selected)
    }

    @State private var doorMessage: String?

    var body: some Scene {
        WindowGroup {
            ContentView()
                // The QR code on the studio door (babsonradio.com/booth/door): ask the studio PC to sign this person in.
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL, url.path == "/booth/door" else { return }
                    Task { @MainActor in doorMessage = await DoorSignIn.run() }
                }
                .alert("Studio sign-in", isPresented: Binding(get: { doorMessage != nil }, set: { if !$0 { doorMessage = nil } })) {
                    Button("OK", role: .cancel) {}
                } message: { Text(doorMessage ?? "") }
        }
    }
}
