import SwiftUI

// MARK: - "What would you like to hear": live votes for the next hour

nonisolated struct VoteState: Decodable {
    struct Option: Decodable, Identifiable {
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
    struct UpNext: Decodable { let blockStart: Double; let label: String }
    let upNext: UpNext?
    let canVote: Bool?
    let requestsOpen: Bool?
    let requestsShow: String?
}

/// The poll and song requests, without a sheet around it. Used inline on the open foldable, and inside VoteView on a phone.
struct VotePanel: View {
    @Environment(\.colorScheme) var scheme
    /// Compact: two columns, no request forms, for the open foldable where the poll shares the page with reactions.
    var compact = false
    @State private var state: VoteState?
    @State private var message: String?
    @State private var request = ""
    @State private var busy = false

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }
    private var card: Color { scheme == .dark ? .brDkSurface : .brLtSurface }

    private static let clock: DateFormatter = {
        let f = DateFormatter(); f.timeStyle = .short; f.dateStyle = .none; return f
    }()
    private func time(_ ms: Double) -> String { Self.clock.string(from: Date(timeIntervalSince1970: ms / 1000)) }

    var body: some View {
                VStack(alignment: .leading, spacing: 14) {
                    if let s = state {
                        Text("Vote closes at \(time(s.blockEnd - 600_000))")
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(sub)
                        if let u = s.upNext {
                            Text(u.label.isEmpty ? "\(time(u.blockStart)): no clear winner, so the auto DJ picks." : "\(u.label) won \(time(u.blockStart)).")
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
                        if s.canVote != false && !compact { PlaylistRequestForm() }
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    }
                    if let m = message { Text(m).font(.system(size: 13)).foregroundColor(sub) }
                }
        .task {
            // Near real time: refresh every 10 seconds while the sheet is open.
            while !Task.isCancelled {
                if let s: VoteState = try? await BackendAPI.get("/api/vote") { state = s }
                try? await Task.sleep(nanoseconds: 10_000_000_000)
            }
        }
    }

    private func vote(_ genre: String) {
        busy = true; message = nil
        Task {
            defer { busy = false }
            do { state = try await BackendAPI.post("/api/vote", ["genre": genre]) }
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

nonisolated struct PlaylistList: Decodable { let playlists: [String] }

/// Ask for a song to be added to a playlist: title, artist, and a playlist from the menu.
/// The request goes to the host panel if a host is on air, otherwise to the station admins.
struct PlaylistRequestForm: View {
    @Environment(\.colorScheme) private var scheme
    @State private var playlists: [String] = []
    @State private var title = ""
    @State private var artist = ""
    @State private var playlist = ""
    @State private var message: String?
    @State private var busy = false

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }
    private var ready: Bool {
        !playlist.isEmpty && title.trimmingCharacters(in: .whitespaces).count >= 2 && artist.trimmingCharacters(in: .whitespaces).count >= 2
    }

    var body: some View {
        Group {
            if !playlists.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("ADD A SONG TO A PLAYLIST").font(BRFont.display(18)).kerning(1.5).foregroundColor(text).padding(.top, 14)
                    BRTextField(placeholder: "Song title", text: $title, icon: "music.note")
                    BRTextField(placeholder: "Artist", text: $artist, icon: "person")
                    HStack {
                        Picker("Playlist", selection: $playlist) {
                            Text("Choose a playlist").tag("")
                            ForEach(playlists, id: \.self) { Text($0).tag($0) }
                        }
                        .pickerStyle(.menu).tint(accent)
                        Spacer()
                        Button("SEND") { send() }
                            .font(BRFont.display(14)).kerning(2).foregroundColor(accent)
                            .disabled(busy || !ready)
                    }
                    if let m = message { Text(m).font(.system(size: 13)).foregroundColor(sub) }
                }
            }
        }
        .task {
            if let r: PlaylistList = try? await BackendAPI.get("/api/playlist-request") { playlists = r.playlists }
        }
    }

    private func send() {
        busy = true; message = nil
        let body = ["title": title, "artist": artist, "playlist": playlist]
        Task {
            defer { busy = false }
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/playlist-request", body)
                title = ""; artist = ""; message = "Sent."
            } catch { message = (error as? BackendError)?.message ?? "Try again." }
        }
    }
}
