import SwiftUI
import MessageUI

// MARK: - SMS Composer (UIViewControllerRepresentable)
// Wraps MFMessageComposeViewController so SwiftUI can present it.

struct MessageComposer: UIViewControllerRepresentable {
    let recipients: [String]   // phone numbers
    let body: String
    @Binding var isPresented: Bool

    func makeUIViewController(context: Context) -> MFMessageComposeViewController {
        let vc = MFMessageComposeViewController()
        vc.recipients = recipients
        vc.body = body
        vc.messageComposeDelegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: MFMessageComposeViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, MFMessageComposeViewControllerDelegate {
        let parent: MessageComposer
        init(_ parent: MessageComposer) { self.parent = parent }

        func messageComposeViewController(
            _ controller: MFMessageComposeViewController,
            didFinishWith result: MessageComposeResult
        ) {
            parent.isPresented = false
        }
    }
}

// MARK: - Invite message body

enum InviteMessage {
    static func body(from senderName: String) -> String {
        """
        You should listen to Babson Radio! https://babsonradio.com
        """
    }
}

// MARK: - Can-send check

extension MFMessageComposeViewController {
    static var isAvailable: Bool { canSendText() }
}
