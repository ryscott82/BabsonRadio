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
            FirebaseApp.configure()
        }
#endif
        // Boot audio session immediately so the system knows this is a playback app
        _ = AudioPlayerManager.shared
        PresenceManager.shared.start()
        Task { @MainActor in ReminderManager.shared.start() }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
