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
    let canVote: Bool?
    let requestsOpen: Bool?
    let requestsShow: String?
}

struct VoteView: View {
    @Environment(\.colorScheme) var scheme
    @Environment(\.dismiss) private var dismiss
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
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let s = state {
                        Text(s.winner.map { "\($0) is taking over \(time(s.blockStart)) – \(time(s.blockEnd))." }
                             ?? "Vote for \(time(s.blockStart)) – \(time(s.blockEnd)). At \(s.threshold) votes, a genre takes over the hour.")
                            .font(.system(size: 14)).foregroundColor(sub)
                        let top = max(s.threshold, s.options.map(\.count).max() ?? 1)
                        ForEach(s.options) { o in
                            Button { vote(o.label) } label: {
                                ZStack(alignment: .leading) {
                                    GeometryReader { g in
                                        Rectangle().fill(accent.opacity(0.2))
                                            .frame(width: g.size.width * CGFloat(min(1, Double(o.count) / Double(top))))
                                    }
                                    HStack {
                                        Text(o.label + (s.winner == o.label ? " ✓" : ""))
                                            .font(.system(size: 15, weight: s.myVote == o.label ? .bold : .regular))
                                            .foregroundColor(text)
                                        Spacer()
                                        Text("\(o.count)").font(.system(size: 14).monospacedDigit()).foregroundColor(sub)
                                    }
                                    .padding(.horizontal, 14)
                                }
                                .frame(height: 44)
                                .background(card)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(s.myVote == o.label ? accent : .clear, lineWidth: 1.5))
                            }
                            .buttonStyle(.plain)
                            .disabled(busy || s.canVote == false)
                        }
                        if s.canVote == false {
                            Text("Voting opens once a Babson student sponsors you or has you in their contacts.")
                                .font(.system(size: 12)).foregroundColor(sub)
                        } else if s.requestsOpen == true {
                            Text(s.requestsShow.map { "Request a song for \($0)" } ?? "Request a song")
                                .font(.system(size: 13, weight: .semibold)).foregroundColor(text).padding(.top, 8)
                            HStack {
                                BRTextField(placeholder: "Artist or song", text: $request, icon: "music.note")
                                Button("SEND") { sendRequest() }
                                    .font(BRFont.display(14)).kerning(2).foregroundColor(accent)
                                    .disabled(busy || request.trimmingCharacters(in: .whitespaces).count < 2)
                            }
                        }
                        if s.canVote != false { PlaylistRequestForm() }
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    }
                    if let m = message { Text(m).font(.system(size: 13)).foregroundColor(sub) }
                }
                .padding(20)
            }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
            .navigationTitle("What would you like to hear?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
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
                title = ""; artist = ""; message = "Sent. The station will take a look."
            } catch { message = (error as? BackendError)?.message ?? "Try again." }
        }
    }
}
