import Foundation
#if canImport(FirebaseAppCheck)
import FirebaseAppCheck
import FirebaseCore

/// Real devices prove themselves with App Attest. Debug builds and the simulator use the debug provider
/// (register the debug token printed in the Xcode console under Firebase Console → App Check → Apps → Manage debug tokens).
final class BRAppCheckFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
#if DEBUG || targetEnvironment(simulator)
        return AppCheckDebugProvider(app: app)
#else
        return AppAttestProvider(app: app)
#endif
    }
}
#endif

/// Firebase App Check: proves a request comes from the real Babson Radio app on a real device.
/// The server checks the token on sign-up and contacts calls (APPCHECK_ENFORCE=1 on the server turns the check on).
/// Needs the FirebaseAppCheck package product added to the app target, plus the App Attest capability. Without them this does nothing.
enum BRAppCheck {
    /// Call once, before FirebaseApp.configure().
    static func install() {
#if canImport(FirebaseAppCheck)
        AppCheck.setAppCheckProviderFactory(BRAppCheckFactory())
#endif
    }

    /// A fresh-enough token, or nil when App Check is not set up or the device can't produce one.
    static func token() async -> String? {
#if canImport(FirebaseAppCheck)
        return try? await AppCheck.appCheck().token(forcingRefresh: false).token
#else
        return nil
#endif
    }
}
