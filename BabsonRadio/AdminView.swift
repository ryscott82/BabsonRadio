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
nonisolated private struct FxState: Decodable { let onAirSign: Bool?; let audioFx: Bool? }
nonisolated private struct TesterList: Decodable { let requests: [TesterRequest] }

@MainActor
private final class AdminModel: ObservableObject {
    @Published var alerts: AdminAlerts?
    @Published var dash: AdminDash?
    @Published var reports: [Report] = []
    @Published var testers: [TesterRequest] = []
    @Published var fx: FxState?
    @Published var message = ""
    @Published var busy = false
    @Published var error: String?

    func load() async {
        if let a: AdminAlerts = try? await BackendAPI.get("/api/admin/alerts") { alerts = a }
        if let d: AdminDash = try? await BackendAPI.get("/api/admin/dashboard") { dash = d }
        if let c: FxState = try? await BackendAPI.get("/api/admin/controls") { fx = c }
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
    /// The admin panel opens full screen like its own app. This closes it.
    var onClose: (() -> Void)? = nil
    @StateObject private var model = AdminModel()
    @StateObject private var push = PushManager.shared
    @ObservedObject private var lab = TestLab.shared
    @Environment(\.colorScheme) private var scheme

    @State private var showDone = false
    @State private var announce = ""
    @State private var minutes = 60
    @State private var confirm: String?

    private var text: Color { Color.white }
    private var sub: Color { Color.white.opacity(0.85) }
    private var accent: Color { Color.white }

    var body: some View {
        NavigationStack { screen }
            .preferredColorScheme(.dark)
    }

    private var screen: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                if let e = model.error { Text(e).font(BRFont.body(13, .regular)).foregroundColor(.brRed) }
                attention
                status
                station
                AdminToolLinks()
                testers
                reports
                notifications
                testLab
            }
            .padding(20)
        }
        .adminPage()
        .toolbar(.hidden, for: .navigationBar)
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

    private var header: some View {
        HStack(spacing: 14) {
            Image(systemName: "dot.radiowaves.left.and.right").font(.system(size: 26)).foregroundColor(.white)
                .frame(width: 56, height: 56).background(AdminLook.tile)
            Text("Admin Panel").font(BRFont.body(32, .light)).foregroundColor(.white)
            Spacer()
            Button { onClose?() } label: {
                Text("Close").font(BRFont.body(16, .regular)).foregroundColor(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Color(hex: "0F5233")).overlay(Rectangle().stroke(Color.white.opacity(0.5), lineWidth: 1))
            }
        }
    }

    private var status: some View {
        VStack(alignment: .leading, spacing: 8) {
            AdminHeader("RIGHT NOW")
            if let d = model.dash {
                Text(d.onAir.title.isEmpty ? "Nothing scheduled" : "On air: \(d.onAir.title)")
                    .font(BRFont.body(16, .regular)).foregroundColor(text)
                Text(d.nowPlaying.song.isEmpty ? "Nothing reported" : (d.nowPlaying.isLive ? "LIVE · " : "") + d.nowPlaying.song)
                    .font(BRFont.body(14, .regular)).foregroundColor(sub)
                Text("\(d.nowPlaying.listeners) listening · last 24 hours: \(d.last24h.sessions) sessions, \(d.last24h.hours.formatted()) h")
                    .font(BRFont.body(12, .regular)).foregroundColor(sub)
            } else { ProgressView() }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).adminCard()
    }

    private var attention: some View {
        VStack(alignment: .leading, spacing: 8) {
            AdminHeader("Notifications")
            let a = model.alerts
            if let a, a.pendingRequests == 0, (a.newReports ?? 0) == 0, a.cancellations.isEmpty {
                Text("Nothing waiting.").font(BRFont.body(14, .regular)).foregroundColor(sub)
            }
            if let a, a.pendingRequests > 0 {
                Text("\(a.pendingRequests) show request\(a.pendingRequests == 1 ? "" : "s") waiting. Open Show requests below.")
                    .font(BRFont.body(14, .regular)).foregroundColor(text)
            }
            if let a, let n = a.newReports, n > 0 {
                Text("\(n) new report\(n == 1 ? "" : "s") below.").font(BRFont.body(14, .regular)).foregroundColor(text)
            }
            ForEach(model.alerts?.cancellations ?? []) { c in
                Text("Cancelled: \(c.title) (\(c.requesterName.isEmpty ? "student" : c.requesterName))\(c.wasApproved ? " · was approved" : "")\(c.reason.isEmpty ? "" : " · \"\(c.reason)\"")")
                    .font(BRFont.body(13, .regular)).foregroundColor(sub)
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).adminCard()
    }

    private var testers: some View {
        VStack(alignment: .leading, spacing: 12) {
            AdminHeader("BETA TESTER REQUESTS")
            if model.testers.isEmpty {
                Text("No one is waiting.").font(BRFont.body(14, .regular)).foregroundColor(sub)
            }
            ForEach(model.testers) { t in
                VStack(alignment: .leading, spacing: 8) {
                    Text(t.name.isEmpty ? t.email : t.name)
                        .font(BRFont.body(15, .regular)).foregroundColor(text)
                    Text("\(t.email) · signed up \(Date(timeIntervalSince1970: t.joinedAt / 1000).formatted(.dateTime.month().day().hour().minute()))")
                        .font(BRFont.body(12, .regular)).foregroundColor(sub)
                    HStack(spacing: 10) {
                        Button("Approve") { Task { await model.decide(t, approve: true) } }
                            .buttonStyle(.borderedProminent).tint(Color.brGreen)
                        Button("Deny") { Task { await model.decide(t, approve: false) } }
                            .buttonStyle(.bordered).tint(Color.brRed)
                    }
                    .font(BRFont.body(13, .regular))
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.18), in: RoundedRectangle(cornerRadius: 6))
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).adminCard()
    }

    private var reports: some View {
        VStack(alignment: .leading, spacing: 12) {
            AdminHeader("BUGS AND IDEAS")
            Picker("Show", selection: $showDone) {
                Text("New").tag(false)
                Text("Done").tag(true)
            }
            .pickerStyle(.segmented)
            let list = model.reports.filter { ($0.status == "done") == showDone }
            if list.isEmpty { Text(showDone ? "Nothing marked done yet." : "No new reports.").font(BRFont.body(14, .regular)).foregroundColor(sub) }
            ForEach(list) { r in
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(r.type == "feature" ? "Idea" : "Bug") · \(r.name ?? "") · \(r.platform == "ios" ? "iOS" : "Website") · \(Date(timeIntervalSince1970: r.createdAt / 1000).formatted(.dateTime.month().day().hour().minute()))")
                        .font(BRFont.body(11, .regular)).foregroundColor(sub)
                    Text(r.message).font(BRFont.body(14, .regular)).foregroundColor(text)
                    Button(showDone ? "Reopen" : "Mark done") { Task { await model.mark(r, done: !showDone) } }
                        .font(BRFont.body(13, .regular)).foregroundColor(accent)
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.18), in: RoundedRectangle(cornerRadius: 6))
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).adminCard()
    }

    private var station: some View {
        VStack(alignment: .leading, spacing: 12) {
            AdminHeader("STATION")
            HStack(spacing: 10) {
                stationButton("Skip song", filled: true) { Task { await model.control(["action": "skip"], done: "Skipped.") } }
                stationButton("Stop", filled: false, destructive: true) { confirm = "emergency-stop" }
                stationButton("Resume", filled: false) { confirm = "resume" }
            }
            Text("Message to everyone").font(BRFont.body(12, .regular)).foregroundColor(sub).padding(.top, 6)
            if let a = model.dash?.announcement { Text("Live now: \(a.text)").font(BRFont.body(13, .regular)).foregroundColor(accent) }
            TextField("", text: $announce, prompt: Text("Shown on every page and in the app").foregroundColor(.brPlaceholder), axis: .vertical)
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
                .font(BRFont.body(14, .regular)).foregroundColor(accent)
                .disabled(announce.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.busy)
            }
            if !model.message.isEmpty { Text(model.message).font(BRFont.body(12, .regular)).foregroundColor(sub) }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).adminCard()
    }

    private func stationButton(_ title: String, filled: Bool, destructive: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(BRFont.body(15, .regular)).frame(maxWidth: .infinity).padding(.vertical, 12)
                .background(filled ? accent : (destructive ? Color.brRed : Color.clear))
                .foregroundColor(filled ? Color(hex: "0F5233") : (destructive ? .white : text))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(filled || destructive ? Color.clear : sub.opacity(0.5)))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(model.busy)
    }

    private var testLab: some View {
        VStack(alignment: .leading, spacing: 10) {
            AdminHeader("Tests")
            Text("Reactions and layouts only change this phone. The two switches below change the station.")
                .font(BRFont.body(12, .regular)).foregroundColor(sub)
            Toggle("ON AIR sign", isOn: Binding(get: { model.fx?.onAirSign == true },
                set: { on in Task { await model.control(["action": "on-air-sign", "on": on], done: on ? "ON AIR sign on." : "ON AIR sign off.") } }))
            Toggle("Audio processing", isOn: Binding(get: { model.fx?.audioFx != false },
                set: { on in Task { await model.control(["action": "audio-fx", "on": on], done: on ? "Audio processing on." : "Audio processing off.") } }))
            Toggle("Pittsburgh reactions (as if Mac Miller is on)", isOn: $lab.pittsburgh)
            Toggle("Pretend the foldable is half folded", isOn: $lab.halfFolded)
            Toggle("Big clock on the full screen board", isOn: $lab.clock)
            Text("Rain starts 3 seconds after you tap.")
                .font(BRFont.body(12, .regular)).foregroundColor(sub).padding(.top, 4)
            HStack(spacing: 10) {
                stationButton("🔥 Rain", filled: false) { lab.rain("🔥") }
                stationButton("Bridge rain", filled: false) { lab.rain(":pgh-bridge:") }
                stationButton("Beaver rain", filled: false) { lab.rain(":br:") }
            }
            Button("Turn everything off") { lab.reset() }
                .font(BRFont.body(13, .regular)).foregroundColor(sub)
        }
        .font(BRFont.body(14, .regular)).foregroundColor(text).tint(accent)
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).adminCard()
    }

    private var notifications: some View {
        VStack(alignment: .leading, spacing: 10) {
            AdminHeader("Notifications on this phone")
            if !PushManager.available {
                Text("Push is not set up in this build.").font(BRFont.body(13, .regular)).foregroundColor(sub)
            } else {
                ForEach(PushKind.allCases) { k in
                    Toggle(k.title, isOn: Binding(get: { push.kinds.contains(k) }, set: { on in Task { await push.set(k, on: on) } }))
                        .font(BRFont.body(14, .regular)).foregroundColor(text).tint(accent).disabled(push.busy)
                }
                if !push.status.isEmpty { Text(push.status).font(BRFont.body(12, .regular)).foregroundColor(.brRed) }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).adminCard()
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


// MARK: - Admin look (same as the website admin panel: green, regular weight, plain cards)

enum AdminLook {
    static func bg(_ scheme: ColorScheme) -> Color { Color(hex: scheme == .dark ? "165C3A" : "1A6E44") }
    static let tile = Color(hex: "2A8F5F")
    static let card = Color(red: 4 / 255, green: 50 / 255, blue: 28 / 255).opacity(0.4)
}

struct AdminPageModifier: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(AdminLook.bg(scheme).ignoresSafeArea())
            .toolbarBackground(AdminLook.bg(scheme), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .environment(\.colorScheme, .dark)
    }
}

struct AdminCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(AdminLook.card, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.white.opacity(0.28), lineWidth: 1))
    }
}

extension View {
    func adminPage() -> some View { modifier(AdminPageModifier()) }
    func adminCard() -> some View { modifier(AdminCardModifier()) }
}

/// A plain section title in sentence case ("Right now"), no all-caps and no "See All".
struct AdminHeader: View {
    let title: String
    init(_ title: String) { self.title = title }
    var body: some View {
        Text(String(title.prefix(1)) + title.dropFirst().lowercased())
            .font(BRFont.body(22, .regular)).foregroundColor(.white)
    }
}
