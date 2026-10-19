import SwiftUI

// MARK: - Verify email
// Shown after sign-up (or sign-in) until the babson.edu address is verified.

struct VerifyEmailView: View {
    @StateObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) var scheme
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            Image(systemName: "envelope.badge")
                .font(.system(size: 40))
                .foregroundColor(scheme == .dark ? .brGold : .brGreen)

            Text("Verify your email")
                .font(BRFont.display(30))
                .kerning(3)
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)

            Text("We sent a link to \(auth.pendingEmail).")
                .font(BRFont.body(14, .regular))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                .multilineTextAlignment(.center)

            Button { auth.checkVerification() } label: {
                Text("I've verified")
                    .font(BRFont.display(16))
                    .kerning(3)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
            }
            .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
            .padding(.top, 8)

            if let info = auth.infoMessage {
                Text(info)
                    .font(BRFont.body(13, .regular))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    .multilineTextAlignment(.center)
            }
            if let error = auth.errorMessage {
                Text(error)
                    .font(BRFont.body(13, .regular))
                    .foregroundColor(.brRed)
                    .multilineTextAlignment(.center)
            }

            HStack(spacing: 28) {
                Button("Resend email") { auth.resendVerification() }
                Button("Sign out") { auth.signOut() }
            }
            .font(BRFont.body(13, .regular))
            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)

            Spacer()
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .hwPage()
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { auth.checkVerification() }   // back from the inbox
        }
    }
}
