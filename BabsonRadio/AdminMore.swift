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
