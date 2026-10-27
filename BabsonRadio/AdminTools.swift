import SwiftUI
import Combine

// MARK: - Admin tools for when you are away from a computer
// Show requests, training, announcements and roles. All go through the website's API, which checks the role again.

struct AdminSheet<Content: View>: View {
    let title: String
    let content: Content
    init(title: String, @ViewBuilder content: () -> Content) { self.title = title; self.content = content() }
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    Button { dismiss() } label: {
                        HStack(spacing: 6) { Image(systemName: "chevron.left"); Text("Back") }
                            .font(BRFont.body(16, .regular)).foregroundColor(.white)
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .background(Color(hex: "0F5233")).overlay(Rectangle().stroke(Color.white.opacity(0.5), lineWidth: 1))
                    }
                    Text(title).font(BRFont.body(28, .light)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.6)
                    Spacer()
                }
                .padding(.bottom, 6)
                content
            }.padding(20)
        }
        .adminPage()
        .toolbar(.hidden, for: .navigationBar)
    }
}

func adminErrText(_ e: Error) -> String { (e as? BackendError)?.message ?? e.localizedDescription }
private func when(_ ms: Double) -> String { Date(timeIntervalSince1970: ms / 1000).formatted(.dateTime.weekday(.abbreviated).month().day().hour().minute()) }

/// The list that sits in the admin screen.
struct AdminToolLinks: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AdminHeader("Tools")
            link("Show requests", "Approve or decline requests to go on air", "calendar.badge.clock") { ShowRequestsView() }
            link("Training", "Who is training and quiz results", "graduationcap") { TrainingAdminView() }
            link("Announcement", "A message on every page of the site and app", "megaphone") { AnnounceView() }
            link("People and roles", "Find people, set access levels and badges", "person.2") { UsersAdminView() }
            link("Page text", "Edit the words on About and other pages", "text.alignleft") { PageTextAdminView() }
            link("Blocked words", "How strict the word filter is, plus your own words", "nosign") { BlockedWordsAdminView() }
            link("Phone changes", "Approve or set a member's phone number", "phone.badge.checkmark") { PhoneChangesAdminView() }
            link("Show changes", "Approve hosts' edits to their show", "pencil.and.list.clipboard") { ShowChangesAdminView() }
            link("Library episodes", "See, add and remove videos", "play.rectangle.on.rectangle") { EpisodesAdminView() }
            link("Schedule", "Add, change or remove weekly shows", "calendar") { ScheduleAdminView() }
            link("Events", "One-time events, and whether they use auto DJ info", "star.circle") { EventsAdminView() }
            link("Easter eggs", "Reaction sets for certain songs, artists or shows", "sparkles") { EasterEggsAdminView() }
            link("Birthdays", "Who shared a birthday and when", "gift") { BirthdaysAdminView() }
            link("Song requests", "What listeners asked to hear", "music.note.list") { SongRequestsAdminView() }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).adminCard()
    }

    private func link<D: View>(_ title: String, _ detail: String, _ icon: String, @ViewBuilder _ dest: @escaping () -> D) -> some View {
        NavigationLink { dest() } label: {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 24)).foregroundColor(.white)
                    .frame(width: 56, height: 56).background(AdminLook.tile)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(BRFont.body(19, .regular)).foregroundColor(.white)
                    Text(detail).font(BRFont.body(14, .regular)).foregroundColor(Color.white.opacity(0.85))
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .regular)).foregroundColor(.white.opacity(0.7))
            }
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
        catch { self.error = adminErrText(error) }
        loaded = true
    }
    func decide(_ r: SlotReq, approve: Bool, note: String, info: String) async {
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/slots/decision",
                ["requestId": r.id, "action": approve ? "approve" : "decline", "note": note, "connectionInfo": info])
            error = nil
        } catch { self.error = adminErrText(error) }
        await load()
    }
}

struct ShowRequestsView: View {
    @StateObject private var model = ShowRequestsModel()
    @Environment(\.colorScheme) private var scheme
    @State private var open: SlotReq?
    private var text: Color { Color.white }
    private var sub: Color { Color.white.opacity(0.85) }

    var body: some View {
        AdminSheet(title: "Show requests") {
            if let e = model.error { Text(e).font(BRFont.body(13, .regular)).foregroundColor(.brRed) }
            if model.loaded && model.items.isEmpty { Text("Nothing waiting.").font(BRFont.body(14, .regular)).foregroundColor(sub) }
            ForEach(model.items) { r in
                Button { open = r } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(r.title).font(BRFont.body(16, .regular)).foregroundColor(text)
                        Text("\(r.requesterName) · \(when(r.startAt)) · \(r.durationMin) min · \(r.type == "live" ? "Live" : "Pre-recorded")")
                            .font(BRFont.body(12, .regular)).foregroundColor(sub)
                        if r.cleanHours { Text("Clean hours").font(BRFont.body(11, .regular)).foregroundColor(.brRed) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(14).adminCard()
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
                    Text(req.title).font(BRFont.body(17, .regular))
                    Text("\(req.requesterName) · \(req.requesterEmail)").font(BRFont.body(13, .regular))
                    Text("\(when(req.startAt)) · \(req.durationMin) min · \(req.category.capitalized)").font(BRFont.body(13, .regular))
                    Text(req.description)
                    if !req.location.isEmpty { Text("Request: \(req.location)").font(BRFont.body(13, .regular)) }
                    if !req.audioURL.isEmpty, let u = URL(string: req.audioURL) { Link("Listen to the audio", destination: u) }
                    if req.makePublic { Text("They agreed to share recordings publicly.").font(BRFont.body(13, .regular)) }
                    if req.cleanHours { Text("Falls in clean hours.").font(BRFont.body(13, .regular)).foregroundColor(.red) }
                }
                .listRowBackground(HWFieldFill())
                Section("Note to them (optional)") { TextField("", text: $note, prompt: Text("Note").foregroundColor(.brPlaceholder), axis: .vertical) }
                .listRowBackground(HWFieldFill())
                Section("Connection details (optional)") { TextField("", text: $info, prompt: Text("Live stream login or instructions").foregroundColor(.brPlaceholder), axis: .vertical) }
                .listRowBackground(HWFieldFill())
                Section {
                    Button { go(true) } label: { Text(busy ? "One moment…" : "Approve").frame(maxWidth: .infinity) }.disabled(busy)
                    Button(role: .destructive) { go(false) } label: { Text("Decline").frame(maxWidth: .infinity) }.disabled(busy)
                }
                .listRowBackground(HWFieldFill())
            }
            .adminPage()
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
        catch { self.error = adminErrText(error) }
        loaded = true
    }
    func act(_ r: TrainRow, _ action: String) async {
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/training", ["uid": r.uid, "action": action]); error = nil }
        catch { self.error = adminErrText(error) }
        await load()
    }
}

struct TrainingAdminView: View {
    @StateObject private var model = TrainingAdminModel()
    @Environment(\.colorScheme) private var scheme
    @State private var query = ""
    private var text: Color { Color.white }
    private var sub: Color { Color.white.opacity(0.85) }
    private var accent: Color { Color.white }

    private var checkIns: [TrainRow] { model.rows.filter { $0.checkInAt != nil && !$0.trained } }
    private var requests: [TrainRow] { model.rows.filter { $0.requestedAt != nil && $0.checkInAt == nil && !$0.trained } }
    private var found: [TrainRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard q.count >= 2 else { return [] }
        return model.rows.filter { $0.name.lowercased().contains(q) || $0.email.lowercased().contains(q) }.prefix(20).map { $0 }
    }

    var body: some View {
        AdminSheet(title: "Training") {
            if let e = model.error { Text(e).font(BRFont.body(13, .regular)).foregroundColor(.brRed) }
            TextField("", text: $query, prompt: Text("Find a student").foregroundColor(.brPlaceholder))
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(12).background(HWFieldFill())
                .clipShape(RoundedRectangle(cornerRadius: 10))
            if !checkIns.isEmpty {
                AdminHeader("AT TRAINING NOW")
                ForEach(checkIns) { row($0, primary: ("Let them take the quiz", "approveCheckin")) }
            }
            if !requests.isEmpty {
                AdminHeader("WANT TRAINING")
                ForEach(requests) { row($0, primary: ("Certify now", "certify"), secondary: ("Dismiss", "clearRequest")) }
            }
            if !found.isEmpty {
                AdminHeader("RESULTS")
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
            Text(r.name.isEmpty ? r.email : r.name).font(BRFont.body(16, .regular)).foregroundColor(text)
            Text("\(r.email)\(r.trained ? " · certified" : "")\(r.conductSigned ? " · signed" : "")")
                .font(BRFont.body(12, .regular)).foregroundColor(sub)
            HStack(spacing: 10) {
                Button(primary.0, role: destructive ? .destructive : nil) { Task { await model.act(r, primary.1) } }
                    .buttonStyle(.borderedProminent).tint(destructive ? .red : accent)
                if let s = secondary { Button(s.0) { Task { await model.act(r, s.1) } }.buttonStyle(.bordered) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(14).adminCard()
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
    private var sub: Color { Color.white.opacity(0.85) }
    private var accent: Color { Color.white }
    private var field: Color { Color.hwField(scheme) }

    var body: some View {
        AdminSheet(title: "Announcement") {
            if let i = info { Text("\(i.phones) phone\(i.phones == 1 ? "" : "s") will get it.").font(BRFont.body(13, .regular)).foregroundColor(sub) }
            TextField("", text: $title, prompt: Text("Title").foregroundColor(.brPlaceholder)).padding(12).background(field).clipShape(RoundedRectangle(cornerRadius: 10))
            TextField("", text: $body_, prompt: Text("Message").foregroundColor(.brPlaceholder), axis: .vertical).lineLimit(2...4)
                .padding(12).background(field).clipShape(RoundedRectangle(cornerRadius: 10))
            if let m = message { Text(m).font(BRFont.body(13, .regular)).foregroundColor(accent) }
            Button { confirm = true } label: { Text(busy ? "Sending…" : "Send").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(accent)
                .disabled(busy || title.trimmingCharacters(in: .whitespaces).isEmpty || body_.trimmingCharacters(in: .whitespaces).isEmpty)
            if let h = info?.history, !h.isEmpty {
                AdminHeader("RECENT")
                ForEach(h) { b in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(b.title).font(BRFont.body(14, .regular))
                        Text(b.body).font(BRFont.body(13, .regular)).foregroundColor(sub)
                        Text("\(when(b.at)) · \(b.sent) sent").font(BRFont.body(11, .regular)).foregroundColor(sub)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12).adminCard()
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
            } catch { message = adminErrText(error) }
            busy = false
        }
    }
}
