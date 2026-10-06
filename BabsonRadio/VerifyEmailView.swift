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

            Text("VERIFY YOUR EMAIL")
                .font(BRFont.display(30))
                .kerning(3)
                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)

            Text("We sent a link to \(auth.pendingEmail). Open it, then come back here.")
                .font(.system(size: 14))
                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                .multilineTextAlignment(.center)

            Button { auth.checkVerification() } label: {
                Text("I'VE VERIFIED")
                    .font(BRFont.display(16))
                    .kerning(3)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(scheme == .dark ? Color.brGold : Color.brGreen)
                    .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .padding(.top, 8)

            if let info = auth.infoMessage {
                Text(info)
                    .font(.system(size: 13))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    .multilineTextAlignment(.center)
            }
            if let error = auth.errorMessage {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundColor(.brRed)
                    .multilineTextAlignment(.center)
            }

            HStack(spacing: 28) {
                Button("Resend email") { auth.resendVerification() }
                Button("Sign out") { auth.signOut() }
            }
            .font(.system(size: 13))
            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)

            Spacer()
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { auth.checkVerification() }   // back from the inbox
        }
    }
}
