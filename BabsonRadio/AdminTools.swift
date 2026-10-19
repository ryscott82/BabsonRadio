import SwiftUI
import Combine

// MARK: - Admin tools for when you are away from a computer
// Show requests, training, announcements and roles. All go through the website's API, which checks the role again.

private struct Sheet<Content: View>: View {
    let title: String
    let content: Content
    init(title: String, @ViewBuilder content: () -> Content) { self.title = title; self.content = content() }
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) { content }.padding(20)
        }
        .hwPage()
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private func errText(_ e: Error) -> String { (e as? BackendError)?.message ?? e.localizedDescription }
private func when(_ ms: Double) -> String { Date(timeIntervalSince1970: ms / 1000).formatted(.dateTime.weekday(.abbreviated).month().day().hour().minute()) }

/// The list that sits in the admin screen.
struct AdminToolLinks: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            BRSectionHeader(title: "TOOLS")
            link("Show requests", "calendar.badge.clock") { ShowRequestsView() }
            link("Training", "graduationcap") { TrainingAdminView() }
            link("Announcement", "megaphone") { AnnounceView() }
            link("People and roles", "person.2") { UsersAdminView() }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private func link<D: View>(_ title: String, _ icon: String, @ViewBuilder _ dest: @escaping () -> D) -> some View {
        NavigationLink { dest() } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).frame(width: 24)
                Text(title).font(BRFont.body(15, .medium))
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).opacity(0.5)
            }
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
    }
}

// MARK: Show requests

nonisolated private struct SlotReq: Decodable, Identifiable {
    let id: String
    let title: String; let description: String; let location: String
    let type: String; let category: String
    let requesterName: String; let requesterEmail: String
    let startAt: Double; let durationMin: Int
    let audioURL: String; let cleanHours: Bool; let makePublic: Bool
}
nonisolated private struct SlotReqList: Decodable { let requests: [SlotReq] }

@MainActor private final class ShowRequestsModel: ObservableObject {
    @Published var items: [SlotReq] = []
    @Published var loaded = false
    @Published var error: String?
    func load() async {
        do { let r: SlotReqList = try await BackendAPI.get("/api/admin/slot-requests"); items = r.requests; error = nil }
        catch { self.error = errText(error) }
        loaded = true
    }
    func decide(_ r: SlotReq, approve: Bool, note: String, info: String) async {
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/slots/decision",
                ["requestId": r.id, "action": approve ? "approve" : "decline", "note": note, "connectionInfo": info])
            error = nil
        } catch { self.error = errText(error) }
        await load()
    }
}

struct ShowRequestsView: View {
    @StateObject private var model = ShowRequestsModel()
    @Environment(\.colorScheme) private var scheme
    @State private var open: SlotReq?
    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }

    var body: some View {
        Sheet(title: "Show requests") {
            if let e = model.error { Text(e).font(BRFont.body(13, .regular)).foregroundColor(.brRed) }
            if model.loaded && model.items.isEmpty { Text("Nothing waiting.").font(BRFont.body(14, .regular)).foregroundColor(sub) }
            ForEach(model.items) { r in
                Button { open = r } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(r.title).font(BRFont.body(16, .semibold)).foregroundColor(text)
                        Text("\(r.requesterName) · \(when(r.startAt)) · \(r.durationMin) min · \(r.type == "live" ? "Live" : "Pre-recorded")")
                            .font(BRFont.body(12, .regular)).foregroundColor(sub)
                        if r.cleanHours { Text("Clean hours").font(BRFont.body(11, .semibold)).foregroundColor(.brRed) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(14).brCard()
                }
                .buttonStyle(.plain)
            }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
        .sheet(item: $open) { r in
            DecideSheet(req: r) { approve, note, info in
                await model.decide(r, approve: approve, note: note, info: info)
                open = nil
            }
        }
    }
}

private struct DecideSheet: View {
    let req: SlotReq
    let onDecide: (Bool, String, String) async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var info = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(req.title).font(.headline)
                    Text("\(req.requesterName) · \(req.requesterEmail)").font(.footnote)
                    Text("\(when(req.startAt)) · \(req.durationMin) min · \(req.category.capitalized)").font(.footnote)
                    Text(req.description)
                    if !req.location.isEmpty { Text("Request: \(req.location)").font(.footnote) }
                    if !req.audioURL.isEmpty, let u = URL(string: req.audioURL) { Link("Listen to the audio", destination: u) }
                    if req.makePublic { Text("They agreed to share recordings publicly.").font(.footnote) }
                    if req.cleanHours { Text("Falls in clean hours.").font(.footnote).foregroundColor(.red) }
                }
                .listRowBackground(HWFieldFill())
                Section("Note to them (optional)") { TextField("Note", text: $note, axis: .vertical) }
                .listRowBackground(HWFieldFill())
                Section("Connection details (optional)") { TextField("Live stream login or instructions", text: $info, axis: .vertical) }
                .listRowBackground(HWFieldFill())
                Section {
                    Button { go(true) } label: { Text(busy ? "One moment…" : "Approve").frame(maxWidth: .infinity) }.disabled(busy)
                    Button(role: .destructive) { go(false) } label: { Text("Decline").frame(maxWidth: .infinity) }.disabled(busy)
                }
                .listRowBackground(HWFieldFill())
            }
            .hwPage()
            .navigationTitle("Request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }
    private func go(_ approve: Bool) {
        busy = true
        Task { await onDecide(approve, note.trimmingCharacters(in: .whitespacesAndNewlines), info.trimmingCharacters(in: .whitespacesAndNewlines)); busy = false }
    }
}

// MARK: Training

nonisolated private struct TrainRow: Decodable, Identifiable {
    let uid: String; let name: String; let email: String
    let trained: Bool; let conductSigned: Bool
    let requestedAt: Double?; let checkInAt: Double?
    let score: Double?
    var id: String { uid }
}
nonisolated private struct TrainList: Decodable { let users: [TrainRow] }

@MainActor private final class TrainingAdminModel: ObservableObject {
    @Published var rows: [TrainRow] = []
    @Published var loaded = false
    @Published var error: String?
    func load() async {
        do { let r: TrainList = try await BackendAPI.get("/api/admin/training"); rows = r.users; error = nil }
        catch { self.error = errText(error) }
        loaded = true
    }
    func act(_ r: TrainRow, _ action: String) async {
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/training", ["uid": r.uid, "action": action]); error = nil }
        catch { self.error = errText(error) }
        await load()
    }
}

struct TrainingAdminView: View {
    @StateObject private var model = TrainingAdminModel()
    @Environment(\.colorScheme) private var scheme
    @State private var query = ""
    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    private var checkIns: [TrainRow] { model.rows.filter { $0.checkInAt != nil && !$0.trained } }
    private var requests: [TrainRow] { model.rows.filter { $0.requestedAt != nil && $0.checkInAt == nil && !$0.trained } }
    private var found: [TrainRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard q.count >= 2 else { return [] }
        return model.rows.filter { $0.name.lowercased().contains(q) || $0.email.lowercased().contains(q) }.prefix(20).map { $0 }
    }

    var body: some View {
        Sheet(title: "Training") {
            if let e = model.error { Text(e).font(BRFont.body(13, .regular)).foregroundColor(.brRed) }
            TextField("Find a student", text: $query)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(12).background(HWFieldFill())
                .clipShape(RoundedRectangle(cornerRadius: 10))
            if !checkIns.isEmpty {
                BRSectionHeader(title: "AT TRAINING NOW")
                ForEach(checkIns) { row($0, primary: ("Let them take the quiz", "approveCheckin")) }
            }
            if !requests.isEmpty {
                BRSectionHeader(title: "WANT TRAINING")
                ForEach(requests) { row($0, primary: ("Certify now", "certify"), secondary: ("Dismiss", "clearRequest")) }
            }
            if !found.isEmpty {
                BRSectionHeader(title: "RESULTS")
                ForEach(found) { r in
                    r.trained ? row(r, primary: ("Remove certification", "revoke"), destructive: true)
                              : row(r, primary: ("Certify", "certify"))
                }
            }
            if model.loaded && checkIns.isEmpty && requests.isEmpty && found.isEmpty {
                Text("No one waiting. Search for a student to certify or remove.").font(BRFont.body(14, .regular)).foregroundColor(sub)
            }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    private func row(_ r: TrainRow, primary: (String, String), secondary: (String, String)? = nil, destructive: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(r.name.isEmpty ? r.email : r.name).font(BRFont.body(16, .semibold)).foregroundColor(text)
            Text("\(r.email)\(r.trained ? " · certified" : "")\(r.conductSigned ? " · signed" : "")")
                .font(BRFont.body(12, .regular)).foregroundColor(sub)
            HStack(spacing: 10) {
                Button(primary.0, role: destructive ? .destructive : nil) { Task { await model.act(r, primary.1) } }
                    .buttonStyle(.borderedProminent).tint(destructive ? .red : accent)
                if let s = secondary { Button(s.0) { Task { await model.act(r, s.1) } }.buttonStyle(.bordered) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(14).brCard()
    }
}

// MARK: Announcement

nonisolated private struct Broadcast: Decodable, Identifiable { let id: String; let title: String; let body: String; let at: Double; let sent: Int }
nonisolated private struct BroadcastInfo: Decodable { let phones: Int; let history: [Broadcast] }
nonisolated private struct SentReply: Decodable { let sent: Int }

struct AnnounceView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var title = ""
    @State private var body_ = ""
    @State private var info: BroadcastInfo?
    @State private var busy = false
    @State private var message: String?
    @State private var confirm = false
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }
    private var field: Color { Color.hwField(scheme) }

    var body: some View {
        Sheet(title: "Announcement") {
            if let i = info { Text("\(i.phones) phone\(i.phones == 1 ? "" : "s") will get it.").font(BRFont.body(13, .regular)).foregroundColor(sub) }
            TextField("Title", text: $title).padding(12).background(field).clipShape(RoundedRectangle(cornerRadius: 10))
            TextField("Message", text: $body_, axis: .vertical).lineLimit(2...4)
                .padding(12).background(field).clipShape(RoundedRectangle(cornerRadius: 10))
            if let m = message { Text(m).font(BRFont.body(13, .regular)).foregroundColor(accent) }
            Button { confirm = true } label: { Text(busy ? "Sending…" : "Send").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(accent)
                .disabled(busy || title.trimmingCharacters(in: .whitespaces).isEmpty || body_.trimmingCharacters(in: .whitespaces).isEmpty)
            if let h = info?.history, !h.isEmpty {
                BRSectionHeader(title: "RECENT")
                ForEach(h) { b in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(b.title).font(BRFont.body(14, .semibold))
                        Text(b.body).font(BRFont.body(13, .regular)).foregroundColor(sub)
                        Text("\(when(b.at)) · \(b.sent) sent").font(BRFont.body(11, .regular)).foregroundColor(sub)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12).brCard()
                }
            }
        }
        .task { info = try? await BackendAPI.get("/api/admin/broadcast") }
        .confirmationDialog("Send this to every phone with announcements on?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Send") { send() }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func send() {
        busy = true; message = nil
        Task {
            do {
                let r: SentReply = try await BackendAPI.post("/api/admin/broadcast",
                    ["title": title.trimmingCharacters(in: .whitespaces), "body": body_.trimmingCharacters(in: .whitespaces)])
                message = "Sent to \(r.sent)."; title = ""; body_ = ""
                info = try? await BackendAPI.get("/api/admin/broadcast")
            } catch { message = errText(error) }
            busy = false
        }
    }
}

// MARK: People and roles

nonisolated private struct AdminUser: Decodable, Identifiable {
    let id: String; let name: String; let username: String; let email: String; let role: String
}
nonisolated private struct AdminUserList: Decodable { let users: [AdminUser]; let canManageAdmins: Bool }
nonisolated private struct NoteReply: Decodable { let note: String? }

struct UsersAdminView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var users: [AdminUser] = []
    @State private var canAdmins = false
    @State private var query = ""
    @State private var message: String?
    @State private var loaded = false
    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }

    private static let labels: [(String, String)] = [("listener", "Listener"), ("showHost", "Host"), ("director", "Director"), ("superAdmin", "Admin")]
    private var roles: [(String, String)] { canAdmins ? Self.labels + [("developer", "Developer")] : Self.labels.filter { $0.0 != "superAdmin" } }

    private var found: [AdminUser] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard q.count >= 2 else { return users.filter { $0.role != "listener" } }
        return users.filter { $0.name.lowercased().contains(q) || $0.email.lowercased().contains(q) || $0.username.lowercased().contains(q) }.prefix(25).map { $0 }
    }

    var body: some View {
        Sheet(title: "People and roles") {
            TextField("Find someone", text: $query)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(12).background(HWFieldFill())
                .clipShape(RoundedRectangle(cornerRadius: 10))
            if let m = message { Text(m).font(BRFont.body(13, .regular)).foregroundColor(.brGold) }
            if query.trimmingCharacters(in: .whitespaces).count < 2 { Text("Hosts and staff. Search to find anyone else.").font(BRFont.body(12, .regular)).foregroundColor(sub) }
            ForEach(found) { u in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(u.name.isEmpty ? u.email : u.name).font(BRFont.body(15, .semibold)).foregroundColor(text)
                        Text(u.email).font(BRFont.body(12, .regular)).foregroundColor(sub)
                    }
                    Spacer()
                    Menu {
                        ForEach(roles, id: \.0) { r in Button(r.1) { Task { await setRole(u, r.0) } } }
                    } label: {
                        Text(Self.labels.first { $0.0 == u.role }?.1 ?? u.role.capitalized).font(BRFont.body(13, .semibold))
                            .padding(.horizontal, 12).padding(.vertical, 6).background(Capsule().fill(Color.brGreen.opacity(0.15)))
                    }
                }
                .padding(14).brCard()
            }
        }
        .task { await load() }
    }

    private func load() async {
        if let r: AdminUserList = try? await BackendAPI.get("/api/admin/users") { users = r.users; canAdmins = r.canManageAdmins }
        loaded = true
    }

    private func setRole(_ u: AdminUser, _ role: String) async {
        do {
            let r: NoteReply = try await BackendAPI.post("/api/admin/users", ["uid": u.id, "role": role])
            message = r.note ?? "\(u.name.isEmpty ? u.email : u.name) is now \(role)."
        } catch { message = errText(error) }
        await load()
    }
}
