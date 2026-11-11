import SwiftUI

// MARK: - More admin screens (the same controls as the website's Admin Panel)
// People and access levels, page text, blocked words and song requests. All go through the website's API, which checks the role again.

private struct AdminField: ViewModifier {
    func body(content: Content) -> some View {
        content.padding(12).background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
private extension View { func adminField() -> some View { modifier(AdminField()) } }

private let white = Color.white
private let softWhite = Color.white.opacity(0.85)

private struct AdminButton: View {
    let title: String
    var enabled = true
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(BRFont.body(16, .regular)).foregroundColor(Color(hex: "0F5233"))
                .padding(.horizontal, 18).padding(.vertical, 10).background(Color.white)
        }
        .buttonStyle(.plain).disabled(!enabled).opacity(enabled ? 1 : 0.4)
    }
}

// MARK: People and access levels

nonisolated private struct AdminUser: Decodable, Identifiable {
    let id: String; let name: String; let username: String; let email: String
    let level: String; let studioTrained: Bool; let radioTrained: Bool; let owner: Bool; let you: Bool
}
nonisolated private struct AdminUserList: Decodable { let users: [AdminUser] }
nonisolated private struct OkReply: Decodable { let ok: Bool? ; let invited: Bool? }

struct UsersAdminView: View {
    @State private var users: [AdminUser] = []
    @State private var query = ""
    @State private var message: String?
    @State private var newEmail = ""
    @State private var newLevel = "student"

    private static let levels: [(String, String)] = [("guest", "Guest"), ("student", "Student"), ("director", "Director"), ("admin", "Admin")]
    private func label(_ l: String) -> String { Self.levels.first { $0.0 == l }?.1 ?? l.capitalized }

    private var found: [AdminUser] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard q.count >= 2 else { return users.filter { $0.level == "director" || $0.level == "admin" || $0.radioTrained || $0.studioTrained } }
        return users.filter { $0.name.lowercased().contains(q) || $0.email.lowercased().contains(q) || $0.username.lowercased().contains(q) }.prefix(25).map { $0 }
    }

    var body: some View {
        AdminSheet(title: "People and roles") {
            TextField("", text: $query, prompt: Text("Find someone").foregroundColor(.brPlaceholder))
                .textInputAutocapitalization(.never).autocorrectionDisabled().adminField()
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            if query.trimmingCharacters(in: .whitespaces).count < 2 {
                Text("Showing staff, directors and trained hosts. Search to find anyone else.").font(BRFont.body(13, .regular)).foregroundColor(softWhite)
            }
            ForEach(found) { u in
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(u.name.isEmpty ? u.email : u.name).font(BRFont.body(17, .regular)).foregroundColor(white)
                            Text(u.email).font(BRFont.body(13, .regular)).foregroundColor(softWhite)
                        }
                        Spacer()
                        if u.owner || u.you {
                            Text(u.owner ? "Owner" : "You").font(BRFont.body(14, .regular)).foregroundColor(softWhite)
                        } else {
                            Menu {
                                ForEach(Self.levels, id: \.0) { l in Button(l.1) { Task { await change(u, ["level": l.0]) } } }
                            } label: {
                                Text(label(u.level)).font(BRFont.body(14, .regular)).foregroundColor(white)
                                    .padding(.horizontal, 12).padding(.vertical, 6).overlay(Rectangle().stroke(Color.white.opacity(0.6), lineWidth: 1))
                            }
                        }
                    }
                    if !u.owner && u.level != "guest" {
                        HStack(spacing: 18) {
                            badge("Studio trained", u.studioTrained) { Task { await change(u, ["studioTrained": !u.studioTrained]) } }
                            badge("Radio trained", u.radioTrained) { Task { await change(u, ["radioTrained": !u.radioTrained]) } }
                        }
                    }
                }
                .padding(14).adminCard()
            }

            VStack(alignment: .leading, spacing: 10) {
                AdminHeader("Give a role by email")
                Text("For someone without an account yet. It applies the first time that email signs in.").font(BRFont.body(13, .regular)).foregroundColor(softWhite)
                TextField("", text: $newEmail, prompt: Text("name@babson.edu").foregroundColor(.brPlaceholder))
                    .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().adminField()
                HStack {
                    Picker("Level", selection: $newLevel) { ForEach(Self.levels, id: \.0) { Text($0.1).tag($0.0) } }.tint(.white)
                    Spacer()
                    AdminButton(title: "Add", enabled: newEmail.contains("@")) { Task { await addByEmail() } }
                }
            }
            .padding(14).adminCard()
        }
        .task { await load() }
    }

    private func badge(_ title: String, _ on: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: on ? "checkmark.square.fill" : "square").font(.system(size: 18))
                Text(title).font(BRFont.body(14, .regular))
            }.foregroundColor(white)
        }.buttonStyle(.plain)
    }

    private func load() async {
        if let r: AdminUserList = try? await BackendAPI.get("/api/admin/users") { users = r.users }
    }
    private func change(_ u: AdminUser, _ fields: [String: Any]) async {
        var body = fields; body["uid"] = u.id
        do { let _: OkReply = try await BackendAPI.post("/api/admin/users", body); message = "Saved." }
        catch { message = adminErrText(error) }
        await load()
    }
    private func addByEmail() async {
        do {
            let r: OkReply = try await BackendAPI.post("/api/admin/users", ["email": newEmail.trimmingCharacters(in: .whitespaces), "level": newLevel])
            message = r.invited == true ? "Saved. It applies when they first sign in." : "Saved."
            newEmail = ""
        } catch { message = adminErrText(error) }
        await load()
    }
}

// MARK: Page text (edit the words on About and other pages)

nonisolated private struct TextItem: Decodable, Identifiable { let key: String; let page: String; let label: String; let def: String; let lines: Bool?; let hint: String?
    var id: String { key } }
nonisolated private struct TextReply: Decodable { let items: [TextItem]?; let values: [String: String] }

struct PageTextAdminView: View {
    @State private var items: [TextItem] = []
    @State private var saved: [String: String] = [:]
    @State private var draft: [String: String] = [:]
    @State private var message: String?
    @State private var busy: String?

    private func current(_ i: TextItem) -> String { draft[i.key] ?? saved[i.key] ?? i.def }
    private var pages: [String] { var seen: [String] = []; for i in items where !seen.contains(i.page) { seen.append(i.page) }; return seen }

    var body: some View {
        AdminSheet(title: "Page text") {
            Text("Change the words on a page. Links go in like [this](/schedule). Reset puts the original words back.")
                .font(BRFont.body(14, .regular)).foregroundColor(softWhite)
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            ForEach(pages, id: \.self) { page in
                AdminHeader(page)
                ForEach(items.filter { $0.page == page }) { i in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(i.label).font(BRFont.body(16, .regular)).foregroundColor(white)
                        if let h = i.hint { Text(h).font(BRFont.body(12, .regular)).foregroundColor(softWhite) }
                        TextField("", text: Binding(get: { current(i) }, set: { draft[i.key] = $0 }), axis: .vertical)
                            .lineLimit(i.lines == true ? 3...10 : 1...3).adminField()
                        HStack(spacing: 12) {
                            AdminButton(title: "Save", enabled: draft[i.key] != nil && draft[i.key] != (saved[i.key] ?? i.def) && busy == nil) { Task { await save(i, current(i)) } }
                            AdminButton(title: "Reset", enabled: saved[i.key] != nil && busy == nil) { Task { await save(i, nil) } }
                        }
                    }
                    .padding(14).adminCard()
                }
            }
        }
        .task {
            if let r: TextReply = try? await BackendAPI.get("/api/admin/site-text") { items = r.items ?? []; saved = r.values }
        }
    }

    private func save(_ i: TextItem, _ value: String?) async {
        busy = i.key; message = nil
        let body: [String: Any] = ["key": i.key, "value": value.map { $0 as Any } ?? NSNull()]
        do {
            let r: TextReply = try await BackendAPI.post("/api/admin/site-text", body)
            saved = r.values; draft[i.key] = nil
            message = value == nil ? "Back to the original words." : "Saved. The page updates within a minute."
        } catch { message = adminErrText(error) }
        busy = nil
    }
}

// MARK: Blocked words

nonisolated private struct WordConfig: Decodable { let words: [String]; let level: String }

struct BlockedWordsAdminView: View {
    @State private var text = ""
    @State private var level = "explicit"
    @State private var loaded = false
    @State private var message: String?

    var body: some View {
        AdminSheet(title: "Blocked words") {
            Text("Hosts cannot send these words to listeners or staff. Look-alike characters, stretched letters and star-outs are caught too.")
                .font(BRFont.body(14, .regular)).foregroundColor(softWhite)
            AdminHeader("How strict")
            option("explicit", "TV-MA (default)", "Blocks explicit and banned words. Crude words like hell and damn go through.")
            option("crude", "TV-PG (keep it clean)", "Also blocks crude words and every starred-out word.")
            Text("Slurs are always blocked, whatever you pick.").font(BRFont.body(12, .regular)).foregroundColor(softWhite)
            AdminHeader("Your own extra words")
            Text("One per line. These count as explicit.").font(BRFont.body(13, .regular)).foregroundColor(softWhite)
            if loaded {
                TextEditor(text: $text).scrollContentBackground(.hidden).frame(minHeight: 140)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().adminField()
            }
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            AdminButton(title: "Save", enabled: loaded) { Task { await save() } }
        }
        .task {
            if let r: WordConfig = try? await BackendAPI.get("/api/admin/blocked-words") { text = r.words.joined(separator: "\n"); level = r.level; loaded = true }
        }
    }

    private func option(_ value: String, _ title: String, _ detail: String) -> some View {
        Button { level = value } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: level == value ? "largecircle.fill.circle" : "circle").font(.system(size: 20)).foregroundColor(white)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(BRFont.body(16, .regular)).foregroundColor(white)
                    Text(detail).font(BRFont.body(13, .regular)).foregroundColor(softWhite).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
        }.buttonStyle(.plain)
    }

    private func save() async {
        let words = text.split(whereSeparator: { $0 == "\n" || $0 == "," }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        do {
            let r: WordConfig = try await BackendAPI.post("/api/admin/blocked-words", ["words": words, "level": level])
            text = r.words.joined(separator: "\n"); level = r.level; message = "Saved."
        } catch { message = adminErrText(error) }
    }
}

// MARK: Song requests

nonisolated private struct SongReq: Decodable, Identifiable {
    let id: String; let title: String; let artist: String; let playlist: String; let count: Int; let done: Bool; let show: String
}
nonisolated private struct SongReqList: Decodable { let requests: [SongReq] }

struct SongRequestsAdminView: View {
    @State private var rows: [SongReq] = []
    @State private var loaded = false

    var body: some View {
        AdminSheet(title: "Song requests") {
            if loaded && rows.isEmpty { Text("Nothing requested yet.").font(BRFont.body(14, .regular)).foregroundColor(softWhite) }
            ForEach(rows) { r in
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(r.title).font(BRFont.body(17, .regular)).foregroundColor(white)
                        Text([r.artist, r.playlist].filter { !$0.isEmpty }.joined(separator: " · ") + (r.count > 1 ? " · asked \(r.count) times" : ""))
                            .font(BRFont.body(13, .regular)).foregroundColor(softWhite)
                    }
                    Spacer()
                    Button { Task { await mark(r, !r.done) } } label: {
                        Text(r.done ? "Added" : "Mark added").font(BRFont.body(14, .regular)).foregroundColor(white)
                            .padding(.horizontal, 12).padding(.vertical, 6).overlay(Rectangle().stroke(Color.white.opacity(0.6), lineWidth: 1))
                    }.buttonStyle(.plain)
                }
                .padding(14).adminCard().opacity(r.done ? 0.6 : 1)
            }
        }
        .task { await load() }
    }

    private func load() async {
        if let r: SongReqList = try? await BackendAPI.get("/api/admin/playlist-requests") { rows = r.requests }
        loaded = true
    }
    private func mark(_ r: SongReq, _ done: Bool) async {
        let _: OkReply? = try? await BackendAPI.post("/api/admin/playlist-requests", ["id": r.id, "done": done])
        await load()
    }
}


// MARK: Phone changes

nonisolated private struct PhoneChange: Decodable, Identifiable {
    let uid: String; let name: String; let email: String; let oldPhone: String; let newPhone: String; let at: Double
    var id: String { uid }
}
nonisolated private struct PhoneChangeList: Decodable { let requests: [PhoneChange] }

struct PhoneChangesAdminView: View {
    @State private var items: [PhoneChange] = []
    @State private var loaded = false
    @State private var message: String?

    var body: some View {
        AdminSheet(title: "Phone changes") {
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            if loaded && items.isEmpty { Text("Nothing waiting.").font(BRFont.body(14, .regular)).foregroundColor(softWhite) }
            ForEach(items) { r in
                VStack(alignment: .leading, spacing: 10) {
                    Text(r.name.isEmpty ? r.email : r.name).font(BRFont.body(17, .regular)).foregroundColor(white)
                    Text(r.email).font(BRFont.body(13, .regular)).foregroundColor(softWhite)
                    Text("\(r.oldPhone.isEmpty ? "No number" : r.oldPhone)  to  \(r.newPhone)").font(BRFont.body(15, .regular)).foregroundColor(white)
                    HStack(spacing: 10) {
                        AdminButton(title: "Approve") { Task { await act(r, "approve") } }
                        AdminButton(title: "Reject") { Task { await act(r, "reject") } }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(14).adminCard()
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { let r: PhoneChangeList = try await BackendAPI.get("/api/admin/phone-changes"); items = r.requests; message = nil }
        catch { message = adminErrText(error) }
        loaded = true
    }
    private func act(_ r: PhoneChange, _ action: String) async {
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/phone-changes", ["uid": r.uid, "action": action]); message = nil }
        catch { message = adminErrText(error) }
        await load()
    }
}

// MARK: Show changes (a host's edits to their weekly show)

nonisolated private struct ShowEditSide: Decodable { let showName: String; let description: String; let imageUrl: String }
nonisolated private struct ShowEdit: Decodable, Identifiable {
    let id: String; let requesterName: String; let current: ShowEditSide; let requested: ShowEditSide
}
nonisolated private struct ShowEditList: Decodable { let items: [ShowEdit] }

struct ShowChangesAdminView: View {
    @State private var items: [ShowEdit] = []
    @State private var loaded = false
    @State private var message: String?

    var body: some View {
        AdminSheet(title: "Show changes") {
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            if loaded && items.isEmpty { Text("Nothing waiting.").font(BRFont.body(14, .regular)).foregroundColor(softWhite) }
            ForEach(items) { r in
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(r.requesterName) wants to change \(r.current.showName)").font(BRFont.body(16, .regular)).foregroundColor(white)
                    diff("Name", r.current.showName, r.requested.showName)
                    diff("About", r.current.description, r.requested.description)
                    if !r.requested.imageUrl.isEmpty { Text("Includes a new picture.").font(BRFont.body(13, .regular)).foregroundColor(softWhite) }
                    HStack(spacing: 10) {
                        AdminButton(title: "Approve") { Task { await act(r, "approve") } }
                        AdminButton(title: "Decline") { Task { await act(r, "decline") } }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(14).adminCard()
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private func diff(_ label: String, _ old: String, _ new: String) -> some View {
        if !new.isEmpty && new != old {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(BRFont.body(12, .regular)).foregroundColor(softWhite)
                Text(old).font(BRFont.body(13, .regular)).foregroundColor(softWhite).strikethrough()
                Text(new).font(BRFont.body(14, .regular)).foregroundColor(white)
            }
        }
    }
    private func load() async {
        do { let r: ShowEditList = try await BackendAPI.get("/api/admin/show-updates"); items = r.items; message = nil }
        catch { message = adminErrText(error) }
        loaded = true
    }
    private func act(_ r: ShowEdit, _ action: String) async {
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/show-updates", ["id": r.id, "action": action]); message = nil }
        catch { message = adminErrText(error) }
        await load()
    }
}

// MARK: Library episodes

nonisolated private struct AdminEpisode: Decodable, Identifiable { let id: String; let title: String; let showName: String; let category: String }
nonisolated private struct AdminEpisodeList: Decodable { let items: [AdminEpisode] }

struct EpisodesAdminView: View {
    @State private var items: [AdminEpisode] = []
    @State private var loaded = false
    @State private var message: String?
    @State private var url = ""
    @State private var showName = ""
    @State private var category = "Podcast"
    @State private var confirm: AdminEpisode?

    var body: some View {
        AdminSheet(title: "Library episodes") {
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            VStack(alignment: .leading, spacing: 10) {
                Text("Add a YouTube video").font(BRFont.body(16, .regular)).foregroundColor(white)
                TextField("", text: $url, prompt: Text("YouTube link").foregroundColor(.brPlaceholder))
                    .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL).adminField()
                TextField("", text: $showName, prompt: Text("Show name").foregroundColor(.brPlaceholder)).adminField()
                Picker("Category", selection: $category) {
                    ForEach(["Music", "Interview", "Podcast", "Talk", "News"], id: \.self) { Text($0).tag($0) }
                }.pickerStyle(.menu).tint(.white)
                Text("Added as private (students only). Public sharing needs the host's signed agreement, set on the website.").font(BRFont.body(12, .regular)).foregroundColor(softWhite)
                AdminButton(title: "Add video", enabled: !url.isEmpty && !showName.isEmpty) { Task { await add() } }
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(14).adminCard()

            ForEach(items) { e in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.title).font(BRFont.body(15, .regular)).foregroundColor(white).lineLimit(2)
                        Text("\(e.showName) · \(e.category)").font(BRFont.body(12, .regular)).foregroundColor(softWhite)
                    }
                    Spacer()
                    Button { confirm = e } label: { Image(systemName: "trash").foregroundColor(white).frame(width: 40, height: 40) }
                        .buttonStyle(.plain).accessibilityLabel("Remove \(e.title)")
                }
                .padding(12).adminCard()
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Remove this episode from the library?", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) { if let e = confirm { Task { await remove(e) } } }
            Button("Cancel", role: .cancel) {}
        } message: { Text(confirm?.title ?? "") }
    }

    private func load() async {
        do { let r: AdminEpisodeList = try await BackendAPI.get("/api/admin/episodes"); items = r.items; message = nil }
        catch { message = adminErrText(error) }
        loaded = true
    }
    private func add() async {
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/admin/episodes", ["url": url, "showName": showName, "category": category])
            url = ""; message = "Added."
        } catch { message = adminErrText(error) }
        await load()
    }
    private func remove(_ e: AdminEpisode) async {
        do { let _: EmptyResponse = try await BackendAPI.delete("/api/admin/episodes", ["id": e.id]); message = "Removed." }
        catch { message = adminErrText(error) }
        confirm = nil
        await load()
    }
}


// MARK: Birthdays

nonisolated private struct BirthdayPerson: Decodable, Identifiable {
    let uid: String; let month: Int; let day: Int; let name: String; let daysAway: Int
    var id: String { uid }
}
nonisolated private struct BirthdayList: Decodable { let people: [BirthdayPerson] }

struct BirthdaysAdminView: View {
    @State private var people: [BirthdayPerson] = []
    @State private var loaded = false
    @State private var message: String?
    private func date(_ p: BirthdayPerson) -> String {
        let d = Calendar.current.date(from: DateComponents(year: 2001, month: p.month, day: p.day)) ?? Date()
        return d.formatted(.dateTime.month(.wide).day())
    }
    var body: some View {
        AdminSheet(title: "Birthdays") {
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            if loaded && people.isEmpty { Text("No one has shared a birthday yet.").font(BRFont.body(14, .regular)).foregroundColor(softWhite) }
            ForEach(people) { p in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name).font(BRFont.body(16, .regular)).foregroundColor(white)
                        Text(date(p)).font(BRFont.body(13, .regular)).foregroundColor(softWhite)
                    }
                    Spacer()
                    Text(p.daysAway == 0 ? "Today" : p.daysAway == 1 ? "Tomorrow" : "In \(p.daysAway) days")
                        .font(BRFont.body(14, .regular)).foregroundColor(white)
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading).adminCard()
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }
    private func load() async {
        do { let r: BirthdayList = try await BackendAPI.get("/api/admin/birthdays"); people = r.people; message = nil }
        catch { message = adminErrText(error) }
        loaded = true
    }
}

// MARK: Easter eggs (reaction sets that appear for a song, artist or show)

nonisolated private struct Egg: Codable, Identifiable {
    var id: String; var name: String; var enabled: Bool
    var artist: [String]; var title: [String]; var show: [String]; var emojis: [String]
}
nonisolated private struct AdminEggList: Codable { let eggs: [Egg] }

struct EasterEggsAdminView: View {
    @State private var eggs: [Egg] = []
    @State private var loaded = false
    @State private var message: String?

    private func csv(_ b: Binding<[String]>) -> Binding<String> {
        Binding(get: { b.wrappedValue.joined(separator: ", ") },
                set: { b.wrappedValue = $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } })
    }
    private func emojiCSV(_ b: Binding<[String]>) -> Binding<String> {
        Binding(get: { b.wrappedValue.joined(separator: " ") },
                set: { b.wrappedValue = $0.split(whereSeparator: { $0 == " " || $0 == "," }).map(String.init) })
    }

    var body: some View {
        AdminSheet(title: "Easter eggs") {
            Text("While a matching artist, song or show is on, the reaction row switches to that set. Separate entries with commas.").font(BRFont.body(13, .regular)).foregroundColor(softWhite)
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            ForEach($eggs) { $e in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        TextField("", text: $e.name, prompt: Text("Name").foregroundColor(.brPlaceholder)).adminField()
                        Toggle("", isOn: $e.enabled).labelsHidden().tint(.white)
                    }
                    TextField("", text: csv($e.artist), prompt: Text("Artists").foregroundColor(.brPlaceholder)).autocorrectionDisabled().adminField()
                    TextField("", text: csv($e.title), prompt: Text("Song titles").foregroundColor(.brPlaceholder)).autocorrectionDisabled().adminField()
                    TextField("", text: csv($e.show), prompt: Text("Shows").foregroundColor(.brPlaceholder)).autocorrectionDisabled().adminField()
                    TextField("", text: emojiCSV($e.emojis), prompt: Text("Reactions (up to 8)").foregroundColor(.brPlaceholder)).adminField()
                    Button("Delete") { eggs.removeAll { $0.id == e.id } }
                        .font(BRFont.body(14, .regular)).foregroundColor(white)
                }
                .padding(14).frame(maxWidth: .infinity, alignment: .leading).adminCard()
            }
            HStack(spacing: 10) {
                AdminButton(title: "Add") {
                    eggs.append(Egg(id: "egg-\(Int(Date().timeIntervalSince1970))", name: "New easter egg", enabled: true, artist: [], title: [], show: [], emojis: ["🎉", "🔥", "❤️", "🤘"]))
                }
                AdminButton(title: "Save", enabled: loaded) { Task { await save() } }
            }
        }
        .task { await load() }
    }
    private func load() async {
        do { let r: AdminEggList = try await BackendAPI.get("/api/admin/easter-eggs"); eggs = r.eggs; message = nil }
        catch { message = adminErrText(error) }
        loaded = true
    }
    private func save() async {
        do {
            let data = try JSONEncoder().encode(eggs)
            let arr = try JSONSerialization.jsonObject(with: data)
            let r: AdminEggList = try await BackendAPI.post("/api/admin/easter-eggs", ["eggs": arr])
            eggs = r.eggs; message = "Saved. Takes about a minute to show everywhere."
        } catch { message = adminErrText(error) }
    }
}

// MARK: Schedule (the weekly shows; directors and admins)

nonisolated private struct SchedShow: Decodable, Identifiable {
    let id: String; var showName: String; var dayOfWeek: Int; var startTime: String; var endTime: String
    var description: String; var hostNames: [String]; var category: String; var color: String
    var imageUrl: String; var imagePath: String; var showSlug: String; var isActive: Bool
    var repeatMode: String; var anchor: String; var weeks: [Int]; var dates: [String]; var hostUsernames: [String]
    enum CodingKeys: String, CodingKey {
        case id, showName, dayOfWeek, startTime, endTime, description, hostNames, category, color, imageUrl, imagePath, showSlug, isActive, anchor, weeks, dates, hostUsernames
        case repeatMode = "repeat"
    }
    static func blank() -> SchedShow {
        SchedShow(id: "", showName: "", dayOfWeek: 1, startTime: "12:00", endTime: "13:00", description: "", hostNames: [], category: "", color: "",
                  imageUrl: "", imagePath: "", showSlug: "", isActive: true, repeatMode: "weekly", anchor: "", weeks: [], dates: [], hostUsernames: [])
    }
    var body: [String: Any] {
        var b: [String: Any] = ["showName": showName, "dayOfWeek": dayOfWeek, "startTime": startTime, "endTime": endTime, "description": description,
            "hostNames": hostNames, "category": category, "color": color, "imageUrl": imageUrl, "imagePath": imagePath, "showSlug": showSlug,
            "isActive": isActive, "repeat": repeatMode, "anchor": anchor, "weeks": weeks, "dates": dates, "hostUsernames": hostUsernames]
        if !id.isEmpty { b["id"] = id }
        return b
    }
}
nonisolated private struct SchedList: Decodable { let shows: [SchedShow] }

struct ScheduleAdminView: View {
    @State private var shows: [SchedShow] = []
    @State private var loaded = false
    @State private var message: String?
    @State private var editing: SchedShow?
    private static let days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    var body: some View {
        AdminSheet(title: "Schedule") {
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            AdminButton(title: "Add a show") { editing = .blank() }
            ForEach(shows) { s in
                Button { editing = s } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(s.showName).font(BRFont.body(16, .regular)).foregroundColor(white)
                        Text("\(s.repeatMode == "dates" ? "Set dates" : Self.days[min(max(s.dayOfWeek, 0), 6)]) · \(s.startTime) to \(s.endTime)\(s.isActive ? "" : " · Off")")
                            .font(BRFont.body(12, .regular)).foregroundColor(softWhite)
                        if s.repeatMode != "weekly" { Text("Repeats: \(s.repeatMode)").font(BRFont.body(12, .regular)).foregroundColor(softWhite) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(14).adminCard()
                }
                .buttonStyle(.plain)
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $editing) { s in
            ScheduleEditSheet(show: s, days: Self.days) { saved in
                if let saved { await save(saved) } else { await remove(s) }
                editing = nil
            }
        }
    }
    private func load() async {
        do { let r: SchedList = try await BackendAPI.get("/api/admin/schedule"); shows = r.shows; message = nil }
        catch { message = adminErrText(error) }
        loaded = true
    }
    private func save(_ s: SchedShow) async {
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/schedule", s.body); message = "Saved." }
        catch { message = adminErrText(error) }
        await load()
    }
    private func remove(_ s: SchedShow) async {
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/schedule", ["action": "delete", "id": s.id]); message = "Removed." }
        catch { message = adminErrText(error) }
        await load()
    }
}

private struct ScheduleEditSheet: View {
    @State var show: SchedShow
    let days: [String]
    let done: (SchedShow?) async -> Void   // a show to save, or nil to delete
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete = false

    var body: some View {
        AdminSheet(title: show.id.isEmpty ? "Add a show" : "Edit show") {
            TextField("", text: $show.showName, prompt: Text("Show name").foregroundColor(.brPlaceholder)).adminField()
            TextField("", text: $show.description, prompt: Text("What it is about").foregroundColor(.brPlaceholder), axis: .vertical).lineLimit(2...5).adminField()
            if show.repeatMode != "dates" {
                Picker("Day", selection: $show.dayOfWeek) { ForEach(0..<7, id: \.self) { Text(days[$0]).tag($0) } }.pickerStyle(.menu).tint(.white)
            } else {
                Text("This show airs on set dates. Change them on the website.").font(BRFont.body(13, .regular)).foregroundColor(softWhite)
            }
            HStack(spacing: 10) {
                TextField("", text: $show.startTime, prompt: Text("Start, e.g. 14:00").foregroundColor(.brPlaceholder)).autocorrectionDisabled().textInputAutocapitalization(.never).adminField()
                TextField("", text: $show.endTime, prompt: Text("End, e.g. 15:30").foregroundColor(.brPlaceholder)).autocorrectionDisabled().textInputAutocapitalization(.never).adminField()
            }
            TextField("", text: Binding(get: { show.hostUsernames.joined(separator: ", ") },
                                        set: { show.hostUsernames = $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }),
                      prompt: Text("Host usernames (they get the host panel)").foregroundColor(.brPlaceholder))
                .textInputAutocapitalization(.never).autocorrectionDisabled().adminField()
            Toggle("On the schedule", isOn: $show.isActive).tint(.white).foregroundColor(white)
            HStack(spacing: 10) {
                AdminButton(title: "Save", enabled: !show.showName.isEmpty) { Task { await done(show) } }
                AdminButton(title: "Cancel") { dismiss() }
                if !show.id.isEmpty { AdminButton(title: "Delete") { confirmDelete = true } }
            }
        }
        .confirmationDialog("Delete this show from the schedule?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await done(nil) } }
            Button("Cancel", role: .cancel) {}
        }
    }
}


// MARK: One-time events

nonisolated private struct AdminEvent: Decodable, Identifiable {
    var id: String; var title: String; var date: String; var startTime: String; var endTime: String
    var description: String; var hostNames: [String]; var category: String; var color: String
    var imageUrl: String; var imagePath: String; var isActive: Bool
    var useAutoMeta: Bool
    static func blank() -> AdminEvent {
        AdminEvent(id: "", title: "", date: Date().formatted(.iso8601.year().month().day()), startTime: "20:00", endTime: "21:00", description: "", hostNames: [],
                   category: "", color: "", imageUrl: "", imagePath: "", isActive: true, useAutoMeta: false)
    }
    var body: [String: Any] {
        var b: [String: Any] = ["action": "save", "title": title, "date": date, "startTime": startTime, "endTime": endTime, "description": description,
            "hostNames": hostNames, "category": category, "color": color, "imageUrl": imageUrl, "imagePath": imagePath, "isActive": isActive, "useAutoMeta": useAutoMeta]
        if !id.isEmpty { b["id"] = id }
        return b
    }
}
nonisolated private struct AdminEventList: Decodable { let events: [AdminEvent] }

struct EventsAdminView: View {
    @State private var events: [AdminEvent] = []
    @State private var loaded = false
    @State private var message: String?
    @State private var editing: AdminEvent?

    var body: some View {
        AdminSheet(title: "Events") {
            if let m = message { Text(m).font(BRFont.body(14, .regular)).foregroundColor(white) }
            AdminButton(title: "Add an event") { editing = .blank() }
            if loaded && events.isEmpty { Text("No one-time events yet.").font(BRFont.body(14, .regular)).foregroundColor(softWhite) }
            ForEach(events) { e in
                Button { editing = e } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(e.title).font(BRFont.body(16, .regular)).foregroundColor(white)
                        Text("\(e.date) · \(e.startTime) to \(e.endTime)\(e.isActive ? "" : " · Off")").font(BRFont.body(12, .regular)).foregroundColor(softWhite)
                        if e.useAutoMeta { Text("Uses auto DJ metadata").font(BRFont.body(12, .regular)).foregroundColor(softWhite) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(14).adminCard()
                }
                .buttonStyle(.plain)
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $editing) { e in
            EventEditSheet(event: e) { saved in
                if let saved { await save(saved) } else { await remove(e) }
                editing = nil
            }
        }
    }
    private func load() async {
        do { let r: AdminEventList = try await BackendAPI.get("/api/admin/events"); events = r.events; message = nil }
        catch { message = adminErrText(error) }
        loaded = true
    }
    private func save(_ e: AdminEvent) async {
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/events", e.body); message = "Saved." }
        catch { message = adminErrText(error) }
        await load()
    }
    private func remove(_ e: AdminEvent) async {
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/events", ["action": "delete", "id": e.id]); message = "Removed." }
        catch { message = adminErrText(error) }
        await load()
    }
}

private struct EventEditSheet: View {
    @State var event: AdminEvent
    let done: (AdminEvent?) async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete = false

    var body: some View {
        AdminSheet(title: event.id.isEmpty ? "Add an event" : "Edit event") {
            TextField("", text: $event.title, prompt: Text("Event name").foregroundColor(.brPlaceholder)).adminField()
            TextField("", text: $event.description, prompt: Text("What it is about").foregroundColor(.brPlaceholder), axis: .vertical).lineLimit(2...5).adminField()
            TextField("", text: $event.date, prompt: Text("Date, e.g. 2026-10-30").foregroundColor(.brPlaceholder)).autocorrectionDisabled().textInputAutocapitalization(.never).adminField()
            HStack(spacing: 10) {
                TextField("", text: $event.startTime, prompt: Text("Start, e.g. 20:00").foregroundColor(.brPlaceholder)).autocorrectionDisabled().textInputAutocapitalization(.never).adminField()
                TextField("", text: $event.endTime, prompt: Text("End, e.g. 21:00").foregroundColor(.brPlaceholder)).autocorrectionDisabled().textInputAutocapitalization(.never).adminField()
            }
            Toggle("Use auto DJ metadata", isOn: $event.useAutoMeta).tint(.white).foregroundColor(white)
            Text("Leave off for a live or special event: the player shows the event name instead of the auto DJ's songs. Turn on if the auto DJ is just playing music during this event.").font(BRFont.body(12, .regular)).foregroundColor(softWhite)
            Toggle("On the schedule", isOn: $event.isActive).tint(.white).foregroundColor(white)
            HStack(spacing: 10) {
                AdminButton(title: "Save", enabled: !event.title.isEmpty) { Task { await done(event) } }
                AdminButton(title: "Cancel") { dismiss() }
                if !event.id.isEmpty { AdminButton(title: "Delete") { confirmDelete = true } }
            }
        }
        .confirmationDialog("Delete this event?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await done(nil) } }
            Button("Cancel", role: .cancel) {}
        }
    }
}
