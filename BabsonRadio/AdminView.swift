import SwiftUI
import Combine

// MARK: - Admin screen (admins only; reached from the profile)
// Needs-attention, bug and idea reports, the station controls and push notification choices.
// Every action goes through the website's API, which checks the admin role again on the server.

nonisolated private struct AdminAlerts: Decodable {
    struct Cancel: Decodable, Identifiable { let id: String; let title: String; let requesterName: String; let startAt: Double; let reason: String; let wasApproved: Bool }
    let pendingRequests: Int
    let newReports: Int?
    let cancellations: [Cancel]
}
nonisolated private struct AdminDash: Decodable {
    struct NP: Decodable { let song: String; let listeners: Int; let isLive: Bool; let streamer: String }
    struct OnAir: Decodable { let title: String; let isShow: Bool }
    struct Ann: Decodable { let text: String }
    struct Last: Decodable { let sessions: Int; let hours: Double }
    let nowPlaying: NP
    let onAir: OnAir
    let announcement: Ann?
    let last24h: Last
}
nonisolated private struct Report: Decodable, Identifiable {
    let id: String
    let type: String
    let message: String
    let name: String?
    let platform: String?
    let status: String
    let createdAt: Double
}
nonisolated private struct ReportList: Decodable { let items: [Report] }
nonisolated private struct TesterRequest: Decodable, Identifiable {
    let uid: String
    let email: String
    let name: String
    let joinedAt: Double
    var id: String { uid }
}
nonisolated private struct TesterList: Decodable { let requests: [TesterRequest] }

@MainActor
private final class AdminModel: ObservableObject {
    @Published var alerts: AdminAlerts?
    @Published var dash: AdminDash?
    @Published var reports: [Report] = []
    @Published var testers: [TesterRequest] = []
    @Published var message = ""
    @Published var busy = false
    @Published var error: String?

    func load() async {
        if let a: AdminAlerts = try? await BackendAPI.get("/api/admin/alerts") { alerts = a }
        if let d: AdminDash = try? await BackendAPI.get("/api/admin/dashboard") { dash = d }
        if let t: TesterList = try? await BackendAPI.get("/api/admin/testers") { testers = t.requests }
        do { let r: ReportList = try await BackendAPI.get("/api/admin/feedback"); reports = r.items; error = nil }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }

    func decide(_ t: TesterRequest, approve: Bool) async {
        do { let _: EmptyResponse = try await BackendAPI.put("/api/admin/testers", ["uid": t.uid, "decision": approve ? "approve" : "deny"]) }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        await load()
    }

    func mark(_ r: Report, done: Bool) async {
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/feedback", ["id": r.id, "status": done ? "done" : "new"]) }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        await load()
    }

    func control(_ body: [String: Any], done: String) async {
        busy = true; message = ""
        do { let _: EmptyResponse = try await BackendAPI.post("/api/admin/controls", body); message = done }
        catch { message = (error as? BackendError)?.message ?? error.localizedDescription }
        busy = false
        await load()
    }
}

struct AdminView: View {
    @StateObject private var model = AdminModel()
    @StateObject private var push = PushManager.shared
    @ObservedObject private var lab = TestLab.shared
    @Environment(\.colorScheme) private var scheme

    @State private var showDone = false
    @State private var announce = ""
    @State private var minutes = 60
    @State private var confirm: String?

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let e = model.error { Text(e).font(.system(size: 13)).foregroundColor(.brRed) }
                status
                attention
                testers
                reports
                station
                notifications
                testLab
            }
            .padding(20)
        }
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
        .navigationTitle("Admin")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load() }
        .task {
            await model.load()
            await push.load()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                await model.load()
            }
        }
        .confirmationDialog(confirm == "emergency-stop" ? "Take Babson Radio off air now?" : "Bring the station back on air?",
                            isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            Button(confirm == "emergency-stop" ? "Stop the station" : "Resume", role: confirm == "emergency-stop" ? .destructive : nil) {
                if let c = confirm { Task { await model.control(["action": c], done: c == "resume" ? "Back on air." : "Station stopped.") } }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: sections

    private var status: some View {
        VStack(alignment: .leading, spacing: 8) {
            BRSectionHeader(title: "RIGHT NOW")
            if let d = model.dash {
                Text(d.onAir.title.isEmpty ? "Nothing scheduled" : "On air: \(d.onAir.title)")
                    .font(.system(size: 16, weight: .semibold)).foregroundColor(text)
                Text(d.nowPlaying.song.isEmpty ? "Nothing reported" : (d.nowPlaying.isLive ? "LIVE · " : "") + d.nowPlaying.song)
                    .font(.system(size: 14)).foregroundColor(sub)
                Text("\(d.nowPlaying.listeners) listening · last 24 hours: \(d.last24h.sessions) sessions, \(d.last24h.hours.formatted()) h")
                    .font(.system(size: 12)).foregroundColor(sub)
            } else { ProgressView() }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private var attention: some View {
        VStack(alignment: .leading, spacing: 8) {
            BRSectionHeader(title: "NEEDS ATTENTION")
            let a = model.alerts
            if let a, a.pendingRequests == 0, (a.newReports ?? 0) == 0, a.cancellations.isEmpty {
                Text("Nothing waiting.").font(.system(size: 14)).foregroundColor(sub)
            }
            if let a, a.pendingRequests > 0 {
                Text("\(a.pendingRequests) show request\(a.pendingRequests == 1 ? "" : "s") waiting. Decide on the website.")
                    .font(.system(size: 14)).foregroundColor(text)
            }
            if let a, let n = a.newReports, n > 0 {
                Text("\(n) new report\(n == 1 ? "" : "s") below.").font(.system(size: 14)).foregroundColor(text)
            }
            ForEach(model.alerts?.cancellations ?? []) { c in
                Text("Cancelled: \(c.title) (\(c.requesterName.isEmpty ? "student" : c.requesterName))\(c.wasApproved ? " · was approved" : "")\(c.reason.isEmpty ? "" : " · \"\(c.reason)\"")")
                    .font(.system(size: 13)).foregroundColor(sub)
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private var testers: some View {
        VStack(alignment: .leading, spacing: 12) {
            BRSectionHeader(title: "BETA TESTER REQUESTS")
            if model.testers.isEmpty {
                Text("No one is waiting.").font(.system(size: 14)).foregroundColor(sub)
            }
            ForEach(model.testers) { t in
                VStack(alignment: .leading, spacing: 8) {
                    Text(t.name.isEmpty ? t.email : t.name)
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(text)
                    Text("\(t.email) · signed up \(Date(timeIntervalSince1970: t.joinedAt / 1000).formatted(.dateTime.month().day().hour().minute()))")
                        .font(.system(size: 12)).foregroundColor(sub)
                    HStack(spacing: 10) {
                        Button("Approve") { Task { await model.decide(t, approve: true) } }
                            .buttonStyle(.borderedProminent).tint(Color.brGreen)
                        Button("Deny") { Task { await model.decide(t, approve: false) } }
                            .buttonStyle(.bordered).tint(Color.brRed)
                    }
                    .font(.system(size: 13, weight: .semibold))
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private var reports: some View {
        VStack(alignment: .leading, spacing: 12) {
            BRSectionHeader(title: "BUGS AND IDEAS")
            Picker("Show", selection: $showDone) {
                Text("New").tag(false)
                Text("Done").tag(true)
            }
            .pickerStyle(.segmented)
            let list = model.reports.filter { ($0.status == "done") == showDone }
            if list.isEmpty { Text(showDone ? "Nothing marked done yet." : "No new reports.").font(.system(size: 14)).foregroundColor(sub) }
            ForEach(list) { r in
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(r.type == "feature" ? "Idea" : "Bug") · \(r.name ?? "") · \(r.platform == "ios" ? "iOS" : "Website") · \(Date(timeIntervalSince1970: r.createdAt / 1000).formatted(.dateTime.month().day().hour().minute()))")
                        .font(.system(size: 11, weight: .semibold)).foregroundColor(sub)
                    Text(r.message).font(.system(size: 14)).foregroundColor(text)
                    Button(showDone ? "Reopen" : "Mark done") { Task { await model.mark(r, done: !showDone) } }
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(accent)
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private var station: some View {
        VStack(alignment: .leading, spacing: 12) {
            BRSectionHeader(title: "STATION")
            HStack(spacing: 10) {
                stationButton("SKIP SONG", filled: true) { Task { await model.control(["action": "skip"], done: "Skipped.") } }
                stationButton("STOP", filled: false, destructive: true) { confirm = "emergency-stop" }
                stationButton("RESUME", filled: false) { confirm = "resume" }
            }
            Text("Message to everyone").font(.system(size: 12, weight: .semibold)).foregroundColor(sub).padding(.top, 6)
            if let a = model.dash?.announcement { Text("Live now: \(a.text)").font(.system(size: 13)).foregroundColor(accent) }
            TextField("Shows on every page of the site and in the app", text: $announce, axis: .vertical)
                .lineLimit(2...4).textFieldStyle(.roundedBorder)
            HStack {
                Picker("How long", selection: $minutes) {
                    Text("15 min").tag(15); Text("1 hour").tag(60); Text("3 hours").tag(180); Text("12 hours").tag(720)
                }
                .pickerStyle(.menu)
                Spacer()
                if model.dash?.announcement != nil {
                    Button("Remove") { Task { await model.control(["action": "clear-announcement"], done: "Message removed.") } }
                        .foregroundColor(sub)
                }
                Button("Send") {
                    let t = announce
                    Task { await model.control(["action": "announce", "text": t, "minutes": minutes], done: "Sent to everyone."); announce = "" }
                }
                .font(.system(size: 14, weight: .semibold)).foregroundColor(accent)
                .disabled(announce.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.busy)
            }
            if !model.message.isEmpty { Text(model.message).font(.system(size: 12)).foregroundColor(sub) }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private func stationButton(_ title: String, filled: Bool, destructive: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(BRFont.display(13)).kerning(1.5).frame(maxWidth: .infinity).padding(.vertical, 12)
                .background(filled ? accent : (destructive ? Color.brRed : Color.clear))
                .foregroundColor(filled ? (scheme == .dark ? .brDkBg : .white) : (destructive ? .white : text))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(filled || destructive ? Color.clear : sub.opacity(0.5)))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(model.busy)
    }

    private var testLab: some View {
        VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "TEST LAB")
            Text("Switch on things that are not always on, to try them on this phone. They only change this phone, and reset when you quit the app.")
                .font(.system(size: 12)).foregroundColor(sub)
            Toggle("Pittsburgh reactions (as if Mac Miller is on)", isOn: $lab.pittsburgh)
            Toggle("Pretend the foldable is half folded", isOn: $lab.halfFolded)
            Toggle("Big clock on the full screen board", isOn: $lab.clock)
            Text("Falling emojis, 3 seconds after you tap. Switch to the Live tab to watch.")
                .font(.system(size: 12)).foregroundColor(sub).padding(.top, 4)
            HStack(spacing: 10) {
                stationButton("🔥 RAIN", filled: false) { lab.rain("🔥") }
                stationButton("BRIDGE RAIN", filled: false) { lab.rain(":pgh-bridge:") }
                stationButton("BEAVER RAIN", filled: false) { lab.rain(":br:") }
            }
            Button("Turn everything off") { lab.reset() }
                .font(.system(size: 13, weight: .semibold)).foregroundColor(sub)
        }
        .font(.system(size: 14)).foregroundColor(text).tint(accent)
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private var notifications: some View {
        VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "NOTIFICATIONS ON THIS PHONE")
            if !PushManager.available {
                Text("Push is not set up in this build yet. See PUSH_SETUP.md in the project.").font(.system(size: 13)).foregroundColor(sub)
            } else {
                ForEach(PushKind.allCases) { k in
                    Toggle(k.title, isOn: Binding(get: { push.kinds.contains(k) }, set: { on in Task { await push.set(k, on: on) } }))
                        .font(.system(size: 14)).foregroundColor(text).tint(accent).disabled(push.busy)
                }
                if !push.status.isEmpty { Text(push.status).font(.system(size: 12)).foregroundColor(.brRed) }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }
}


// MARK: - Test lab

/// Switches for things that are not always on, so they can be tried by hand from Admin. Per phone, not saved.
@MainActor
final class TestLab: ObservableObject {
    static let shared = TestLab()
    @Published var pittsburgh = false
    @Published var halfFolded = false
    @Published var clock = false

    func rain(_ emoji: String) {
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            LiveExtrasModel.shared.rain(emoji, count: 24, spread: 2.5)
        }
    }

    func reset() { pittsburgh = false; halfFolded = false; clock = false }
}
