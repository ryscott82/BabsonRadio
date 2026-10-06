import SwiftUI
import AVFoundation

@main struct MyApp: App {

    init() {
        // Boot audio session immediately so the system knows this is a playback app
        _ = AudioPlayerManager.shared
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
