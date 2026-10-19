import SwiftUI
import Combine

// MARK: - "What would you like to hear": live votes for the next hour

nonisolated struct VoteState: Codable {
    struct Option: Codable, Identifiable {
        let label: String
        let count: Int
        var id: String { label }
    }
    let blockStart: Double
    let blockEnd: Double
    let threshold: Int
    let options: [Option]
    let myVote: String?
    let winner: String?
    struct UpNext: Codable { let blockStart: Double; let label: String }
    let upNext: UpNext?
    let canVote: Bool?
    let requestsOpen: Bool?
    let requestsShow: String?
}

/// Keeps the last poll on the phone, so the options are on screen the instant the panel opens. The options only change on the hour,
/// so a saved poll is good until its block ends; the counts and your vote refresh quietly in the background.
@MainActor final class VoteStore: ObservableObject {
    static let shared = VoteStore()
    @Published var state: VoteState?
    private let key = "br.vote.cache"

    init() {
        if let d = UserDefaults.standard.data(forKey: key), let s = try? JSONDecoder().decode(VoteState.self, from: d), Self.isCurrent(s) {
            state = s
        }
    }

    private static func isCurrent(_ s: VoteState) -> Bool { s.blockEnd / 1000 > Date().timeIntervalSince1970 }

    func set(_ s: VoteState) {
        state = s
        if let d = try? JSONEncoder().encode(s) { UserDefaults.standard.set(d, forKey: key) }
    }

    /// The saved poll if its hour is still running, otherwise nothing (the options may have changed).
    var current: VoteState? { state.flatMap { Self.isCurrent($0) ? $0 : nil } }

    func refresh() async {
        if let s: VoteState = try? await BackendAPI.get("/api/vote") { set(s) }
    }
}

/// The poll and song requests, without a sheet around it. Used inline on the open foldable, in the phone's drawer, and inside VoteView.
/// Each option is a steel key with a fill that shows its share; your vote is the key that stays pressed.
struct VotePanel: View {
    /// Compact: two columns, no request forms, for the open foldable where the poll shares the page with reactions.
    var compact = false
    var title = "Select the next hour of music"
    /// A big heading (the open foldable) instead of the small one in the drawer.
    var large = false
    @ObservedObject private var store = VoteStore.shared
    private var state: VoteState? { store.current }
    @State private var message: String?
    @State private var request = ""
    @State private var busy = false

    @Environment(\.hwMode) private var hwm
    @Environment(\.hwLightKeys) private var lightKeys
    private var keyInk: Color { lightKeys ? Color(hex: "1A1710") : text }
    private var text: Color { hwm.onPanelText }
    private var sub: Color { hwm.onPanelSub }
    @ObservedObject private var theme = ArtTheme.shared
    private var win: Color { Color(hex: "6FCF93") }

    private static let clock: DateFormatter = {
        let f = DateFormatter(); f.timeStyle = .short; f.dateStyle = .none; return f
    }()
    private func time(_ ms: Double) -> String { Self.clock.string(from: Date(timeIntervalSince1970: ms / 1000)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let s = state {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(BRFont.body(large ? 19 : 14, large ? .bold : .semibold)).foregroundColor(large ? text : text.opacity(0.78))
                    if let u = s.upNext, !u.label.isEmpty {
                        Text("\(u.label) won \(time(u.blockStart)).")
                            .font(BRFont.body(13, .semibold)).foregroundColor(win)
                    }
                }
                let top = max(1, s.options.map(\.count).max() ?? 1)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
                    ForEach(s.options) { o in
                        let mine = s.myVote == o.label
                        Button { vote(o.label) } label: {
                            ZStack(alignment: .leading) {
                                GeometryReader { g in
                                    Rectangle().fill(keyInk.opacity(0.3))
                                        .frame(width: g.size.width * CGFloat(mine ? 1 : min(1, Double(o.count) / Double(top))))
                                }
                                HStack {
                                    Text(o.label).font(BRFont.body(14, mine ? .bold : .regular)).foregroundColor(keyInk).lineLimit(1)
                                    Spacer(minLength: 4)
                                    Text("\(o.count)").font(BRFont.body(14, .regular).monospacedDigit()).foregroundColor(keyInk.opacity(0.78))
                                }
                                .padding(.horizontal, 12)
                            }
                            .frame(height: 38)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .background(HWKeyFace(corner: 10, pressed: mine, lit: mine))
                        }
                        .buttonStyle(.plain)
                        .disabled(busy || s.canVote == false)
                    }
                }
                .padding(.bottom, 4)
                if s.canVote == false {
                    Text("Voting opens once a Babson student sponsors you.")
                        .font(BRFont.body(12)).foregroundColor(sub)
                } else if !compact, s.requestsOpen == true {
                    Text(s.requestsShow.map { "Request a song for \($0)" } ?? "Request a song")
                        .font(BRFont.body(13, .semibold)).foregroundColor(text).padding(.top, 8)
                    HStack {
                        BRTextField(placeholder: "Artist or song", text: $request, icon: "music.note")
                        Button("Send") { sendRequest() }
                            .buttonStyle(HWKeyStyle())
                            .disabled(busy || request.trimmingCharacters(in: .whitespaces).count < 2)
                    }
                }
            } else {
                ProgressView().tint(Color.hwCream).frame(maxWidth: .infinity).padding(.top, 40)
            }
            if let m = message { Text(m).font(BRFont.body(13)).foregroundColor(sub) }
        }
        .task {
            // Near real time: refresh every 10 seconds while the sheet is open.
            while !Task.isCancelled {
                await store.refresh()
                try? await Task.sleep(nanoseconds: 10_000_000_000)
            }
        }
    }

    private func vote(_ genre: String) {
        busy = true; message = nil
        Task {
            defer { busy = false }
            do { store.set(try await BackendAPI.post("/api/vote", ["genre": genre])) }
            catch { message = (error as? BackendError)?.message ?? "Try again." }
        }
    }

    private func sendRequest() {
        busy = true; message = nil
        let t = request
        Task {
            defer { busy = false }
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/vote/request", ["text": t])
                request = ""; message = "Sent to the station. Thanks!"
            } catch { message = (error as? BackendError)?.message ?? "Try again." }
        }
    }
}


struct VoteView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView { VotePanel().padding(20) }
                .hwPage()
                .navigationTitle("What would you like to hear?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
    }
}
