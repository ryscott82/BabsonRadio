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

/// The poll and song requests, without a sheet around it. Used inline on the open foldable, and inside VoteView on a phone.
struct VotePanel: View {
    @Environment(\.colorScheme) var scheme
    /// Compact: two columns, no request forms, for the open foldable where the poll shares the page with reactions.
    var compact = false
    @ObservedObject private var store = VoteStore.shared
    private var state: VoteState? { store.current }
    @State private var message: String?
    @State private var request = ""
    @State private var busy = false

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    @ObservedObject private var theme = ArtTheme.shared
    private var accent: Color { ArtTheme.full(scheme) ? theme.accent(scheme) : (scheme == .dark ? .brGold : .brGreen) }
    private var card: Color { theme.glassTint(scheme) ?? (scheme == .dark ? .brDkSurface : .brLtSurface) }

    private static let clock: DateFormatter = {
        let f = DateFormatter(); f.timeStyle = .short; f.dateStyle = .none; return f
    }()
    private func time(_ ms: Double) -> String { Self.clock.string(from: Date(timeIntervalSince1970: ms / 1000)) }

    var body: some View {
                VStack(alignment: .leading, spacing: 14) {
                    if let s = state {
                        Text("Select the next hour of music")
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(sub)
                        if let u = s.upNext, !u.label.isEmpty {
                            Text("\(u.label) won \(time(u.blockStart)).")
                                .font(.system(size: 13)).foregroundColor(accent)
                        }
                        let top = max(1, s.options.map(\.count).max() ?? 1)
                        LazyVGrid(columns: compact ? [GridItem(.flexible(), spacing: 8), GridItem(.flexible())] : [GridItem(.flexible())], spacing: compact ? 8 : 10) {
                        ForEach(s.options) { o in
                            Button { vote(o.label) } label: {
                                ZStack(alignment: .leading) {
                                    GeometryReader { g in
                                        Rectangle().fill(accent.opacity(0.2))
                                            .frame(width: g.size.width * CGFloat(min(1, Double(o.count) / Double(top))))
                                    }
                                    HStack {
                                        Text(o.label)
                                            .font(.system(size: 15, weight: s.myVote == o.label ? .bold : .regular))
                                            .foregroundColor(text)
                                        Spacer()
                                        Text("\(o.count)").font(.system(size: 14).monospacedDigit()).foregroundColor(sub)
                                    }
                                    .padding(.horizontal, 14)
                                }
                                .frame(height: compact ? 38 : 44)
                                .background(card)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(s.myVote == o.label ? accent : .clear, lineWidth: 1.5))
                            }
                            .buttonStyle(.plain)
                            .disabled(busy || s.canVote == false)
                        }
                        }
                        if s.canVote == false {
                            Text("Voting opens once a Babson student sponsors you.")
                                .font(.system(size: 12)).foregroundColor(sub)
                        } else if !compact, s.requestsOpen == true {
                            Text(s.requestsShow.map { "Request a song for \($0)" } ?? "Request a song")
                                .font(.system(size: 13, weight: .semibold)).foregroundColor(text).padding(.top, 8)
                            HStack {
                                BRTextField(placeholder: "Artist or song", text: $request, icon: "music.note")
                                Button("SEND") { sendRequest() }
                                    .font(BRFont.display(14)).kerning(2).foregroundColor(accent)
                                    .disabled(busy || request.trimmingCharacters(in: .whitespaces).count < 2)
                            }
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    }
                    if let m = message { Text(m).font(.system(size: 13)).foregroundColor(sub) }
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
    @Environment(\.colorScheme) var scheme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView { VotePanel().padding(20) }
                .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
                .navigationTitle("What would you like to hear?")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
    }
}
