import SwiftUI

// MARK: - E-board screens (E-board and Admin): strikes and the studio / guest list
// The server checks the role again on every request. Both screens load when they open and on pull to refresh. No polling.

nonisolated struct StrikeRow: Decodable, Identifiable {
    let id: String
    let uid: String
    let status: String          // pending | confirmed | excused
    let note: String
    let at: Date
    let name: String
    let reason: String
}
nonisolated private struct StrikesReply: Decodable { let strikes: [StrikeRow] }
nonisolated private struct SuggestOut: Decodable { let results: [GuestSuggestion] }

struct StrikesView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var rows: [StrikeRow] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var notes: [String: String] = [:]
    @State private var busyId: String?
    // manual add
    @State private var query = ""
    @State private var suggestions: [GuestSuggestion] = []
    @State private var who: GuestSuggestion?
    @State private var addNote = ""

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }
    private var pending: [StrikeRow] { rows.filter { $0.status == "pending" } }
    private var decided: [StrikeRow] { rows.filter { $0.status != "pending" } }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                Text("Strikes").font(BRFont.display(28)).foregroundColor(text)
                Text("Missed shows are flagged here. Confirm a flag to count it, or excuse it. Nothing counts until you decide.").font(BRFont.body(16, .regular)).foregroundColor(sub)
                if let e = error { Text(e).font(BRFont.body(16, .regular)).foregroundColor(.brRed) }

                BRSectionHeader(title: "Waiting for you")
                if pending.isEmpty { Text(loaded ? "Nothing to decide." : "Loading…").font(BRFont.body(16, .regular)).foregroundColor(sub) }
                ForEach(pending) { r in pendingCard(r) }

                manualAdd

                if !decided.isEmpty {
                    BRSectionHeader(title: "Decided")
                    ForEach(decided) { r in decidedCard(r) }
                }
            }
            .padding(20)
        }
        .hwPage()
        .navigationTitle("Strikes")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .task(id: query) {
            let q = query.trimmingCharacters(in: .whitespaces)
            guard q.count >= 2, who == nil else { suggestions = []; return }
            try? await Task.sleep(for: .milliseconds(300))
            if Task.isCancelled { return }
            let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
            if let r: SuggestOut = try? await BackendAPI.get("/api/people/suggest?q=\(enc)") { suggestions = r.results.filter { $0.id.hasPrefix("u:") } }
        }
    }

    private func pendingCard(_ r: StrikeRow) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(r.name).font(BRFont.body(18, .semibold)).foregroundColor(text)
            Text("\(r.reason), \(StationTime.day(r.at))").font(BRFont.body(16, .regular)).foregroundColor(text)
            if !r.note.isEmpty { Text(r.note).font(BRFont.body(14, .regular)).foregroundColor(sub) }
            TextField("", text: Binding(get: { notes[r.id] ?? "" }, set: { notes[r.id] = $0 }), prompt: Text("Note (optional)").foregroundColor(.brPlaceholder))
                .font(BRFont.body(16, .regular)).padding(12).background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 10))
            HStack(spacing: 10) {
                action("Confirm", on: r) { await decide(r, "confirm") }
                action("Excuse", on: r) { await decide(r, "excuse") }
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private func decidedCard(_ r: StrikeRow) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(r.name): \(r.reason), \(StationTime.day(r.at))").font(BRFont.body(16, .semibold)).foregroundColor(text)
            Text(r.status == "confirmed" ? "Counts as a strike" : "Excused").font(BRFont.body(14, .regular)).foregroundColor(sub)
            if r.status == "confirmed" { action("Take back", on: r) { await decide(r, "excuse") } }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private func action(_ label: String, on r: StrikeRow, _ run: @escaping () async -> Void) -> some View {
        Button { Task { await run() } } label: {
            Text(label).font(BRFont.body(16, .semibold)).foregroundColor(accent).frame(maxWidth: .infinity, minHeight: 44)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(accent.opacity(0.5), lineWidth: 1))
        }
        .buttonStyle(.plain).disabled(busyId == r.id)
    }

    private var manualAdd: some View {
        VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "Add a strike by hand")
            if let w = who {
                HStack { Text(w.name).font(BRFont.body(16, .semibold)).foregroundColor(text); Spacer(); Button("Change") { who = nil; query = "" }.frame(minHeight: 44) }
                TextField("", text: $addNote, prompt: Text("What happened").foregroundColor(.brPlaceholder)).font(BRFont.body(16, .regular))
                    .padding(12).background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 10))
                Button { Task { await add(w) } } label: { Text("Flag it for review").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
                    .disabled(addNote.trimmingCharacters(in: .whitespaces).isEmpty)
            } else {
                TextField("", text: $query, prompt: Text("Search a member by name").foregroundColor(.brPlaceholder)).font(BRFont.body(16, .regular))
                    .textInputAutocapitalization(.words).autocorrectionDisabled()
                    .padding(12).background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 10))
                ForEach(suggestions) { s in
                    Button { who = s; suggestions = [] } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.name).font(BRFont.body(16, .semibold)).foregroundColor(text)
                            Text(s.emailMasked).font(BRFont.body(14, .regular)).foregroundColor(sub)
                        }.frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44)
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private func load() async {
        do { let r: StrikesReply = try await BackendAPI.get("/api/admin/strikes"); rows = r.strikes; error = nil }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        loaded = true
    }

    private func decide(_ r: StrikeRow, _ action: String) async {
        busyId = r.id; defer { busyId = nil }
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/admin/strikes/decide", ["id": r.id, "action": action, "note": notes[r.id] ?? ""])
            await load()
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }

    private func add(_ w: GuestSuggestion) async {
        let uid = String(w.id.dropFirst(2))
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/admin/strikes/add", ["uid": uid, "note": addNote])
            who = nil; query = ""; addNote = ""
            await load()
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }
}

// MARK: - Studio and guest list

nonisolated struct StaffGuest: Decodable, Hashable { let name: String; let email: String }
nonisolated struct StudioListRow: Decodable, Identifiable {
    let kind: String            // studio | live | prerecorded
    let startAt: Date
    let endAt: Date
    let hostName: String
    let hostEmail: String
    let title: String
    let status: String
    let guests: [StaffGuest]
    let justMe: Bool
    var id: String { "\(kind)-\(startAt.timeIntervalSince1970)-\(hostEmail)-\(title)" }
}
nonisolated private struct StudioListReply: Decodable { let rows: [StudioListRow] }

struct StudioListView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var rows: [StudioListRow] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var copied = false

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    private func kindWord(_ k: String) -> String { k == "studio" ? "Studio booking" : (k == "live" ? "Live show" : "Pre-recorded show") }

    /// Plain text for pasting: one block per booking or show, with guest names and emails.
    private var copyText: String {
        rows.map { r in
            let who = r.justMe ? "Just the host" : (r.guests.isEmpty ? "No guest list" : r.guests.map { "\($0.name) <\($0.email)>" }.joined(separator: ", "))
            return "\(StationTime.range(r.startAt, r.endAt)) · \(kindWord(r.kind)) · \(r.title) · \(r.hostName) <\(r.hostEmail)>\n  \(who)"
        }.joined(separator: "\n\n")
    }

    /// One row per guest (or one row for a booking with none), for a spreadsheet.
    private var csv: String {
        func q(_ s: String) -> String { "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }
        var out = ["Date,Start,End,Type,Title,Host,Host email,Guest,Guest email"]
        for r in rows {
            let base = [StationTime.day(r.startAt), StationTime.clock(r.startAt), StationTime.clock(r.endAt), kindWord(r.kind), r.title, r.hostName, r.hostEmail].map(q).joined(separator: ",")
            if r.guests.isEmpty { out.append(base + "," + q(r.justMe ? "Just me" : "") + "," + q("")) }
            for g in r.guests { out.append(base + "," + q(g.name) + "," + q(g.email)) }
        }
        return out.joined(separator: "\n")
    }

    private var csvFile: URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("guest-list.csv")
        do { try csv.write(to: url, atomically: true, encoding: .utf8); return url } catch { return nil }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Studio and guest list").font(BRFont.display(28)).foregroundColor(text)
                Text("Upcoming studio bookings and shows, with who is coming. For the E-board only.").font(BRFont.body(16, .regular)).foregroundColor(sub)
                if let e = error { Text(e).font(BRFont.body(16, .regular)).foregroundColor(.brRed) }
                if !rows.isEmpty {
                    HStack(spacing: 18) {
                        Button { UIPasteboard.general.string = copyText; copied = true } label: { Text(copied ? "Copied" : "Copy").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
                        if let f = csvFile { ShareLink(item: f) { Text("Export CSV").font(BRFont.body(16, .semibold)).frame(minHeight: 44) } }
                    }
                }
                if rows.isEmpty { Text(loaded ? "Nothing is booked yet." : "Loading…").font(BRFont.body(16, .regular)).foregroundColor(sub) }
                ForEach(rows) { r in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(StationTime.range(r.startAt, r.endAt))").font(BRFont.body(16, .semibold)).foregroundColor(text)
                        Text("\(kindWord(r.kind)) · \(r.title)\(r.status == "pending" ? " · pending" : "")").font(BRFont.body(16, .regular)).foregroundColor(text)
                        Text("\(r.hostName) · \(r.hostEmail)").font(BRFont.body(14, .regular)).foregroundColor(sub)
                        if r.justMe { Text("Just the host").font(BRFont.body(14, .regular)).foregroundColor(sub) }
                        ForEach(r.guests, id: \.self) { g in Text("\(g.name) · \(g.email)").font(BRFont.body(14, .regular)).foregroundColor(sub) }
                    }
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading).brCard()
                }
            }
            .padding(20)
        }
        .hwPage()
        .navigationTitle("Studio list")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do { let r: StudioListReply = try await BackendAPI.get("/api/admin/studio/list"); rows = r.rows; error = nil; copied = false }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        loaded = true
    }
}
