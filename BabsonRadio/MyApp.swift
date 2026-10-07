import SwiftUI
import AVFoundation
#if canImport(FirebaseCore)
import FirebaseCore
#endif

@main struct MyApp: App {

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
