import SwiftUI
import PhotosUI
import UIKit

// MARK: - Host a show (three steps, the same as the website)
// 1 Pick a time (format, length, open times) · 2 Your show (title, about, category) · 3 Send (who is coming, policy).
// Live shows are at most 90 minutes and use the studio unless "I am not using the studio" is on. Quiet hours and popular times are hints only.
// Loads when it opens, when the week changes and when the category changes. Pull down to refresh. No polling.

nonisolated struct SlotOptions: Decodable {
    struct Last: Decodable { let title: String; let description: String; let location: String; let type: String; let category: String; let durationMin: Int; let audioURL: String }
    struct Rules: Decodable {
        let minLeadHours: Int?; let maxAdvanceDays: Int?; let maxMinutes: Int?; let autoApproveHours: Int?
        let maxRepeatWeeks: Int?; let liveMaxMinutes: Int?; let capacity: Int?; let quietWarning: String?
    }
    let canLive: Bool
    let trainedReason: String?
    let agreementSigned: Bool
    let lastShow: Last?
    let rules: Rules
    let weekHasShow: [String: Bool]

    var lead: Int { rules.minLeadHours ?? 24 }
    var advanceDays: Int { rules.maxAdvanceDays ?? 60 }
    var liveMax: Int { rules.liveMaxMinutes ?? 90 }
    var maxMinutes: Int { rules.maxMinutes ?? 240 }
    var capacity: Int { rules.capacity ?? 12 }
    var autoHours: Int { rules.autoApproveHours ?? 24 }
    var repeatWeeks: Int { rules.maxRepeatWeeks ?? 0 }
    var quietLine: String { rules.quietWarning ?? MembersText.quiet }
}

nonisolated struct OpenRange: Decodable { let startAt: Date; let endAt: Date; let pending: Bool? }
nonisolated struct OpenRangesReply: Decodable { let ranges: [OpenRange] }
nonisolated struct StudioOpenReply: Decodable { let ranges: [TimeSpan]; let quietRanges: [TimeSpan] }
nonisolated struct PopularReply: Decodable {
    struct Top: Decodable { let label: String }
    let top: [Top]; let grid: [[Int]]; let fallback: Bool
}
nonisolated struct RequestReply: Decodable { let id: String; let ids: [String]?; let quiet: Bool?; let warning: String?; let needsAgreement: Bool? }

// MARK: - Logic (mirrors the website's lib/hostFlow.ts)

enum HostLogic {
    static func lengths(live: Bool) -> [Int] { live ? [30, 60, 90] : [30, 60, 90, 120] }
    static func moreLengths(live: Bool, maxMinutes: Int) -> [Int] {
        let extra = [15, 45, 150, 180, 240]
        return live ? extra.filter { $0 < 90 && ![30, 60, 90].contains($0) } : extra.filter { $0 <= maxMinutes }
    }
    static func clamp(_ minutes: Int, live: Bool, liveMax: Int) -> Int { live && minutes > liveMax ? liveMax : minutes }

    static func studioLine(live: Bool, noStudio: Bool) -> String {
        guard live else { return "" }
        return noStudio ? "Not using the studio. The room stays free for others." : "Uses the studio. Nobody else can book it then."
    }

    static func weekKey(_ d: Date) -> String {
        let cal = StationTime.calendar
        let dow = (cal.component(.weekday, from: d) + 5) % 7           // Monday = 0
        let monday = cal.date(byAdding: .day, value: -dow, to: cal.startOfDay(for: d)) ?? d
        let f = DateFormatter(); f.timeZone = StationTime.zone; f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: monday)
    }

    /// Approved by itself, or waits for staff when the person already has a show that week.
    static func notice(start: Date, opts: SlotOptions) -> (auto: Bool, line: String) {
        if opts.weekHasShow[weekKey(start)] == true { return (false, "This one will need staff approval, because you already have a show that week.") }
        return (true, "Approved automatically \(opts.autoHours) hours after you send it.")
    }

    /// 0 to 3 for the hour that holds this instant (grid: 7 days x 24 hours, Sunday first, station time).
    static func level(_ grid: [[Int]]?, at d: Date) -> Int {
        guard let grid else { return 0 }
        let cal = StationTime.calendar
        let dow = cal.component(.weekday, from: d) - 1
        let h = cal.component(.hour, from: d)
        guard dow >= 0, dow < grid.count, h >= 0, h < grid[dow].count else { return 0 }
        return min(3, max(0, grid[dow][h]))
    }

    static func popularLine(category: String, top: [String], fallback: Bool) -> String {
        guard !top.isEmpty else { return "" }
        let when = top.prefix(2).joined(separator: ", ")
        return fallback || category.isEmpty ? "Popular on the station: \(when)" : "Popular for \(category.capitalized) shows: \(when)"
    }

    /// A few open starts a person could take now: far enough ahead, not overlapping anything, spread over different hours, in sensible hours.
    static func nextOpen(_ taken: [TimeSpan], now: Date, leadHours: Int, lengthMin: Int, count: Int = 4, horizonDays: Int = 14) -> [Date] {
        let step: TimeInterval = 1800
        let first = ceil((now.timeIntervalSince1970 + Double(leadHours) * 3600) / step) * step
        var out: [Date] = []
        var s = first
        let end = now.timeIntervalSince1970 + Double(horizonDays) * 86_400
        let cal = StationTime.calendar
        while s < end && out.count < count {
            let d = Date(timeIntervalSince1970: s)
            let h = cal.component(.hour, from: d)
            let e = d.addingTimeInterval(Double(lengthMin) * 60)
            if h >= 8 && h < 22 && !taken.contains(where: { $0.startAt < e && d < $0.endAt }) {
                if out.last == nil || d.timeIntervalSince(out.last!) >= 3 * 3600 { out.append(d) }
            }
            s += step
        }
        return out
    }

    /// A one-event calendar file. Shared through the share sheet, so the app never asks for calendar access.
    static func ics(title: String, start: Date, end: Date) -> String {
        let f = DateFormatter(); f.timeZone = TimeZone(identifier: "UTC"); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        func esc(_ s: String) -> String { s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: ";", with: "\\;").replacingOccurrences(of: ",", with: "\\,").replacingOccurrences(of: "\n", with: "\\n") }
        return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Babson Radio//Host a show//EN", "BEGIN:VEVENT",
                "UID:\(UUID().uuidString)@babsonradio", "DTSTAMP:\(f.string(from: Date()))", "DTSTART:\(f.string(from: start))", "DTEND:\(f.string(from: end))",
                "SUMMARY:\(esc(title))", "DESCRIPTION:Babson Radio show", "END:VEVENT", "END:VCALENDAR"].joined(separator: "\r\n")
    }
}

// MARK: - The screen

struct HostShowView: View {
    /// Pre-filled starts: "Host here" on the schedule, "Same time next week", "Schedule this to air" and "Pick another time".
    var preStart: Date? = nil
    var preLength: Int? = nil
    var preType: String? = nil
    var preTitle: String? = nil
    var preDescription: String? = nil
    var preCategory: String? = nil
    var preRecording: String? = nil

    @ObservedObject private var auth = AuthManager.shared
    @ObservedObject private var store = MembersStore.shared
    @StateObject private var slots = SlotsManager()
    @Environment(\.colorScheme) private var scheme

    @State private var opts: SlotOptions?
    @State private var pub: PublicInfo?
    @State private var step = 1
    @State private var type = "live"
    @State private var length = 60
    @State private var weekOffset = 0
    @State private var dayIndex = 0
    @State private var pick: Date?
    @State private var shows: [Int: [OpenRange]] = [:]
    @State private var studio: [Int: StudioOpenReply] = [:]
    @State private var popular: [String: PopularReply] = [:]
    @State private var now = Date()
    @State private var seeded = false

    @State private var title = ""
    @State private var details = ""
    @State private var category = "podcast"
    @State private var location = ""
    @State private var audioURL = ""
    @State private var receiveRatings = true
    @State private var noStudio = false
    @State private var sharePublic = false
    @State private var pubTicks: Set<Int> = []
    @State private var pubName = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var photoPreview: UIImage?
    @State private var uploaded: UploadedImage?
    @State private var isUploading = false
    @State private var chips: [GuestChip] = []
    @State private var justMe = false
    @State private var agreed = false
    @State private var recClean = false

    @State private var busy = false
    @State private var error: String?
    @State private var sent: SentSummary?
    @State private var showTraining = false
    @State private var agreements: TrainingInfo?
    @State private var signBusy = false
    @State private var signError: String?

    struct SentSummary { let title: String; let start: Date; let end: Date; let line: String; let warning: String; let count: Int }

    private static let categories = ["podcast", "music", "talk", "interview", "news", "other"]
    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }
    private var live: Bool { type == "live" }
    private var usesStudio: Bool { live && !noStudio }
    private var lead: Int { opts?.lead ?? 24 }
    private var windowStart: Date { StationTime.startOfDay(now).addingTimeInterval(TimeInterval(weekOffset * 7) * 86_400) }
    private var days: [Date] { (0..<7).compactMap { StationTime.calendar.date(byAdding: .day, value: $0, to: windowStart) } }
    private var maxWeek: Int { min(8, Int(ceil(Double(opts?.advanceDays ?? 60) / 7.0)) - 1) }
    private var pickEnd: Date? { pick.map { $0.addingTimeInterval(TimeInterval(length * 60)) } }

    /// Everything that blocks the chosen week: booked shows and pending requests, plus the studio when the show uses it.
    private func taken(_ week: Int) -> [TimeSpan] {
        let s = (shows[week] ?? []).map { TimeSpan(startAt: $0.startAt, endAt: $0.endAt) }
        return s + (usesStudio ? (studio[week]?.ranges ?? []) : [])
    }
    private func weekIndex(of d: Date) -> Int {
        let diff = StationTime.calendar.dateComponents([.day], from: StationTime.startOfDay(now), to: StationTime.startOfDay(d)).day ?? 0
        return max(0, diff / 7)
    }
    private var conflict: Bool {
        guard let p = pick, let e = pickEnd else { return false }
        return taken(weekIndex(of: p)).contains { $0.startAt < e && p < $0.endAt }
    }
    private var tooSoon: Bool { pick.map { $0 < now.addingTimeInterval(Double(lead) * 3600) } ?? false }
    private var pickOK: Bool { pick != nil && !conflict && !tooSoon }
    private var quietHit: Bool {
        guard live, let p = pick, let e = pickEnd, let q = studio[weekIndex(of: p)] else { return false }
        return StudioBlocks.overlaps(q.quietRanges, p, e)
    }
    private var step2OK: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty && details.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10 }
    private var pop: PopularReply? { popular[category] }
    private var publicOK: Bool {
        guard sharePublic, let info = pub else { return true }
        return pubTicks.count == info.publicClauses.count && pubName.trimmingCharacters(in: .whitespaces).split(separator: " ").count >= 2
    }

    var body: some View {
        Group {
            if let info = agreements {
                ScrollView {
                    AgreementsForm(info: info, busy: signBusy, error: signError) { name in sign(name, version: info.agreementsVersion) }.padding(20)
                }
                .hwPage()
            } else {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 22) {
                        content
                    }
                    .padding(20)
                }
                .hwPage()
                .refreshable { await loadAll() }
            }
        }
        .navigationTitle("Host a show")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: auth.currentUser?.id) { await loadAll() }
        .task(id: weekOffset) { await loadWeek(weekOffset) }
        .task(id: category) { await loadPopular(category) }
        .sheet(isPresented: $showTraining) { HostTrainingSheet { showTraining = false; Task { await loadAll() } } }
    }

    @ViewBuilder private var content: some View {
        if auth.currentUser?.isGuest == true {
            GuestLockedNote(text: "Requesting airtime is for Babson students.")
        } else if !auth.isSignedIn {
            VStack(spacing: 12) {
                Text("Sign in to host a show").font(BRFont.display(22)).foregroundColor(text)
                Text("Sign in with your school email.").font(BRFont.body(16, .regular)).foregroundColor(sub)
            }
            .frame(maxWidth: .infinity).padding(.top, 80)
        } else if let s = store.standing, s.level >= 3 {
            Text("Host a show").font(BRFont.display(28)).foregroundColor(text)
            Text(s.bannedLine).font(BRFont.body(16, .regular)).foregroundColor(.brRed)
            myShows
        } else if let o = opts {
            if let done = sent { sentView(done, o) } else { flow(o) }
            myShows
        } else if let e = error {
            Text(e).font(BRFont.body(16, .regular)).foregroundColor(.brRed)
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
        }
    }

    // MARK: the three steps

    @ViewBuilder private func flow(_ o: SlotOptions) -> some View {
        Text("Host a show").font(BRFont.display(28)).foregroundColor(text)
        Text("Pick a time, tell us about it, send. At least \(lead) hours ahead.").font(BRFont.body(16, .regular)).foregroundColor(sub)

        HStack(spacing: 8) {
            ForEach(Array(["Pick a time", "Your show", "Send"].enumerated()), id: \.offset) { i, name in
                Text(name).font(BRFont.body(14, step == i + 1 ? .semibold : .regular))
                    .foregroundColor(step == i + 1 ? .white : (step > i + 1 ? text : sub))
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background(step == i + 1 ? accent : Color.clear)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(accent.opacity(0.4), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        if let e = error { Text(e).font(BRFont.body(16, .regular)).foregroundColor(.brRed) }

        if step == 1 { stepTime(o) } else if step == 2 { stepShow(o) } else { stepSend(o) }
    }

    @ViewBuilder private func stepTime(_ o: SlotOptions) -> some View {
        // Format
        VStack(alignment: .leading, spacing: 8) {
            Text("Format").font(BRFont.body(16, .semibold)).foregroundColor(text)
            HStack(spacing: 8) {
                if o.canLive { chip("Live", on: live) { chooseType("live") } }
                chip("Pre-recorded", on: !live) { chooseType("prerecorded") }
            }
            if !o.canLive {
                Text(o.trainedReason == "expired" ? "Your radio training has ended. Renew it to host live." : "Live shows need radio training.")
                    .font(BRFont.body(16, .regular)).foregroundColor(sub)
                Button { showTraining = true } label: { Text("Get trained").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
            }
        }

        // Length
        VStack(alignment: .leading, spacing: 8) {
            Text("Length").font(BRFont.body(16, .semibold)).foregroundColor(text)
            HStack(spacing: 8) {
                ForEach(HostLogic.lengths(live: live), id: \.self) { m in chip("\(m) min", on: length == m) { length = m } }
                let more = HostLogic.moreLengths(live: live, maxMinutes: o.maxMinutes)
                if !more.isEmpty {
                    Menu {
                        ForEach(more, id: \.self) { m in Button("\(m) min") { length = m } }
                    } label: {
                        Text(HostLogic.lengths(live: live).contains(length) ? "More" : "\(length) min").font(BRFont.body(16, .regular)).foregroundColor(text)
                            .padding(.horizontal, 14).frame(minHeight: 44)
                            .overlay(RoundedRectangle(cornerRadius: 22).stroke(accent.opacity(0.4), lineWidth: 1))
                    }
                }
            }
            if live { Text("Live shows are at most \(o.liveMax) minutes.").font(BRFont.body(14, .regular)).foregroundColor(sub) }
        }

        // Next open times
        let next = HostLogic.nextOpen(taken(weekOffset), now: now, leadHours: lead, lengthMin: length)
        if !next.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Next open times").font(BRFont.body(16, .semibold)).foregroundColor(text)
                ForEach(next, id: \.self) { d in chip(StationTime.when(d), on: pick == d) { choose(d) } }
            }
        }

        // The day strip and blocks
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button { if weekOffset > 0 { weekOffset -= 1; dayIndex = 0 } } label: { Text("Earlier").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
                    .opacity(weekOffset > 0 ? 1 : 0)
                Spacer()
                Text(weekOffset == 0 ? "This week" : "Week of \(StationTime.day(windowStart))").font(BRFont.body(16, .regular)).foregroundColor(sub)
                Spacer()
                Button { if weekOffset < maxWeek { weekOffset += 1; dayIndex = 0 } } label: { Text("Later").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
                    .opacity(weekOffset < maxWeek ? 1 : 0)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) { ForEach(Array(days.enumerated()), id: \.offset) { i, d in chip(StationTime.day(d), on: dayIndex == i) { dayIndex = i } } }
            }
            blocks(o)
            if let p = pop {
                let line = HostLogic.popularLine(category: category, top: p.top.map(\.label), fallback: p.fallback)
                if !line.isEmpty { Text(line).font(BRFont.body(14, .regular)).foregroundColor(sub) }
            }
            HStack(spacing: 14) {
                Label("Quiet hours", systemImage: "square.fill").foregroundColor(Color.brGold.opacity(0.6))
                Label("Popular", systemImage: "square.fill").foregroundColor(accent.opacity(0.5))
                Label("Taken", systemImage: "xmark.square").foregroundColor(sub)
            }
            .font(BRFont.body(14, .regular))
        }

        if let p = pick, let e = pickEnd {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(StationTime.range(p, e))").font(BRFont.body(18, .semibold)).foregroundColor(text)
                if tooSoon { Text("That is less than \(lead) hours away. Pick a later time.").font(BRFont.body(16, .regular)).foregroundColor(.brRed) }
                else if conflict { Text("\(length) minutes runs into another booking. Pick a shorter length or another time.").font(BRFont.body(16, .regular)).foregroundColor(.brRed) }
                if quietHit { Text(o.quietLine).font(BRFont.body(16, .regular)).foregroundColor(.brGold) }
            }
        }
        primary("Next: your show", enabled: pickOK) { step = 2; error = nil }
    }

    private func blocks(_ o: SlotOptions) -> some View {
        let day = days[min(dayIndex, 6)]
        let cal = StationTime.calendar
        let first = cal.startOfDay(for: day)
        let list: [Date] = (14..<48).compactMap { cal.date(byAdding: .minute, value: $0 * 30, to: first) }   // 7:00 AM to 11:30 PM
        let tk = taken(weekOffset)
        let q = studio[weekOffset]?.quietRanges ?? []
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            ForEach(list, id: \.self) { b in
                let end = b.addingTimeInterval(1800)
                let past = b <= now
                let soon = !past && b < now.addingTimeInterval(Double(lead) * 3600)
                let far = b > now.addingTimeInterval(Double(o.advanceDays) * 86_400)
                let isTaken = StudioBlocks.overlaps(tk, b, end)
                let free = !past && !soon && !far && !isTaken
                let quiet = live && StudioBlocks.overlaps(q, b, end)
                let level = HostLogic.level(pop?.grid, at: b)
                let chosen = pick == b
                Button { choose(b) } label: {
                    Text(isTaken ? "Taken" : StationTime.clock(b)).font(BRFont.body(16, chosen ? .semibold : .regular))
                        .foregroundColor(chosen ? .white : (free ? text : sub))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(chosen ? accent : (free ? (quiet ? Color.brGold.opacity(0.18) : accent.opacity(0.08 * Double(level))) : Color.clear))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(free ? accent.opacity(0.5) : sub.opacity(0.25), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .disabled(!free)
                .opacity(past || soon ? 0.4 : 1)
            }
        }
    }

    @ViewBuilder private func stepShow(_ o: SlotOptions) -> some View {
        if o.lastShow != nil {
            Button { useLast(o) } label: { Text("Use details from my last show").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
        }
        field("Title", text: $title, prompt: "Show title")
        VStack(alignment: .leading, spacing: 6) {
            Text("What is it about? (one line)").font(BRFont.body(16, .semibold)).foregroundColor(text)
            TextField("", text: $details, prompt: Text("What listeners will hear").foregroundColor(.brPlaceholder), axis: .vertical)
                .lineLimit(2...5).font(BRFont.body(16, .regular))
                .padding(12).background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 10))
        }
        VStack(alignment: .leading, spacing: 6) {
            Text("Category").font(BRFont.body(16, .semibold)).foregroundColor(text)
            Picker("Category", selection: $category) { ForEach(Self.categories, id: \.self) { Text($0.capitalized).tag($0) } }
                .pickerStyle(.menu).tint(accent)
        }
        if !live { field("Link to your audio (optional)", text: $audioURL, prompt: "https://…", url: true) }

        DisclosureGroup("More options") {
            VStack(alignment: .leading, spacing: 14) {
                field("Special requests or location (optional)", text: $location, prompt: "Need a second mic…")
                if live {
                    Text(HostLogic.studioLine(live: true, noStudio: noStudio)).font(BRFont.body(16, .regular)).foregroundColor(text)
                    Toggle("I am not using the studio", isOn: $noStudio).font(BRFont.body(16, .regular))
                        .onChange(of: noStudio) { _, _ in Task { await loadWeek(weekOffset) } }
                }
                HStack(spacing: 14) {
                    if let img = photoPreview { Image(uiImage: img).resizable().scaledToFill().frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 10)) }
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        Text(isUploading ? "Uploading…" : (photoPreview == nil ? "Add a picture (optional)" : "Change picture")).font(BRFont.body(16, .regular)).frame(minHeight: 44)
                    }.disabled(isUploading)
                    if photoPreview != nil { Button("Remove", role: .destructive) { photoItem = nil; photoPreview = nil; uploaded = nil } }
                }
                Toggle("Receive ratings during my show", isOn: $receiveRatings).font(BRFont.body(16, .regular))
                if let info = pub, info.publicSharing == "adult" {
                    Toggle("Also share my recordings with the public (optional)", isOn: $sharePublic).font(BRFont.body(16, .regular))
                    if sharePublic {
                        ForEach(Array(info.publicClauses.enumerated()), id: \.offset) { i, c in
                            Button { if pubTicks.contains(i) { pubTicks.remove(i) } else { pubTicks.insert(i) } } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: pubTicks.contains(i) ? "checkmark.square.fill" : "square").font(.system(size: 22))
                                    Text(c).font(BRFont.body(16, .regular)).multilineTextAlignment(.leading).foregroundColor(text)
                                }.frame(minHeight: 44)
                            }.buttonStyle(.plain)
                        }
                        field("Type your full name to sign", text: $pubName, prompt: "First and last name")
                    }
                }
            }
            .padding(.top, 8)
        }
        .font(BRFont.body(16, .regular)).tint(accent)
        .onChange(of: photoItem) { _, item in if let item { Task { await upload(item) } } }

        HStack(spacing: 10) {
            secondary("Back") { step = 1 }
            primary("Next: send", enabled: step2OK && publicOK) { step = 3; error = nil }
        }
    }

    @ViewBuilder private func stepSend(_ o: SlotOptions) -> some View {
        if let p = pick, let e = pickEnd {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(BRFont.body(18, .semibold)).foregroundColor(text)
                Text("\(StationTime.range(p, e)) · \(length) min · \(live ? "Live" : "Pre-recorded") · \(category.capitalized)").font(BRFont.body(16, .regular)).foregroundColor(sub)
                if live { Text(HostLogic.studioLine(live: true, noStudio: noStudio)).font(BRFont.body(16, .regular)).foregroundColor(sub) }
                if quietHit { Text(o.quietLine).font(BRFont.body(16, .regular)).foregroundColor(.brGold) }
                Text(HostLogic.notice(start: p, opts: o).line).font(BRFont.body(16, .regular)).foregroundColor(text)
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading).background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 12))

            GuestPicker(chips: $chips, justMe: $justMe, capacity: o.capacity)

            if let rid = preRecording, !live {
                Button { recClean.toggle() } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: recClean ? "checkmark.square.fill" : "square").font(.system(size: 24)).foregroundColor(accent)
                        Text("I listened to the whole recording and it is clean.").font(BRFont.body(16, .regular)).foregroundColor(text).multilineTextAlignment(.leading)
                    }.frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("rec-\(rid)")
            }

            PolicyBox(agreed: $agreed)
            let problem = GuestLogic.problem(chips, justMe: justMe)
            if !problem.isEmpty { Text(problem).font(BRFont.body(14, .regular)).foregroundColor(sub) }
            HStack(spacing: 10) {
                secondary("Back") { step = 2 }
                primary(busy ? "Sending…" : "Request this time", enabled: agreed && problem.isEmpty && !busy && (preRecording == nil || live || recClean)) { Task { await send(o, p, e) } }
            }
        } else {
            secondary("Pick a time") { step = 1 }
        }
    }

    // MARK: sent, my shows

    @ViewBuilder private func sentView(_ s: SentSummary, _ o: SlotOptions) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(s.count > 1 ? "Requests sent" : "Request sent").font(BRFont.display(24)).foregroundColor(accent)
            Text("\(s.title), \(StationTime.range(s.start, s.end))").font(BRFont.body(18, .semibold)).foregroundColor(text)
            Text(s.line).font(BRFont.body(16, .regular)).foregroundColor(text)
            if !s.warning.isEmpty { Text(s.warning).font(BRFont.body(16, .regular)).foregroundColor(.brGold) }
            if let url = icsFile(s) {
                ShareLink(item: url) { Label("Add to Calendar", systemImage: "calendar.badge.plus").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
            }
            Button { sent = nil; step = 1 } label: { Text("Host another show").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private func icsFile(_ s: SentSummary) -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("babson-radio-show.ics")
        do { try HostLogic.ics(title: s.title, start: s.start, end: s.end).write(to: url, atomically: true, encoding: .utf8); return url } catch { return nil }
    }

    private var canRepeat: Bool { (opts?.repeatWeeks ?? 0) > 0 }

    @ViewBuilder private var myShows: some View {
        VStack(alignment: .leading, spacing: 14) {
            BRSectionHeader(title: "My shows")
            if slots.myRequests.isEmpty {
                Text(slots.isLoading ? "Loading…" : "You have not requested a show yet.").font(BRFont.body(16, .regular)).foregroundColor(sub)
            }
            ForEach(slots.myRequests) { r in
                SlotRequestRow(request: r,
                               onCancel: { Task { await slots.cancel(r.id); await loadAll() } },
                               onRepeat: canRepeat ? { Task { await repeatShow(r) } } : nil,
                               onPickAnother: { pickAnother(r) })
            }
        }
    }

    // MARK: pieces

    private func chip(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(BRFont.body(16, on ? .semibold : .regular)).foregroundColor(on ? .white : text)
                .padding(.horizontal, 16).frame(minHeight: 44)
                .background(on ? accent : Color.clear)
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(accent.opacity(0.5), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 22))
        }
        .buttonStyle(.plain)
    }

    private func field(_ label: String, text binding: Binding<String>, prompt: String, url: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(BRFont.body(16, .semibold)).foregroundColor(text)
            TextField("", text: binding, prompt: Text(prompt).foregroundColor(.brPlaceholder))
                .font(BRFont.body(16, .regular))
                .keyboardType(url ? .URL : .default)
                .textInputAutocapitalization(url ? .never : .sentences)
                .autocorrectionDisabled(url)
                .padding(12).background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private func primary(_ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack { Spacer(); Text(label).font(BRFont.display(16)).kerning(1.5); Spacer() }.padding(.vertical, 14)
        }
        .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
        .disabled(!enabled)
    }

    private func secondary(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(label).font(BRFont.body(16, .semibold)).foregroundColor(text).padding(.horizontal, 18).frame(minHeight: 48) }
            .buttonStyle(.plain)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(accent.opacity(0.5), lineWidth: 1))
    }

    // MARK: actions

    private func chooseType(_ t: String) {
        type = t
        length = HostLogic.clamp(length, live: t == "live", liveMax: opts?.liveMax ?? 90)
        if t != "live" { noStudio = false }
    }

    private func choose(_ d: Date) {
        pick = d
        weekOffset = min(maxWeek, weekIndex(of: d))
        let diff = StationTime.calendar.dateComponents([.day], from: windowStart, to: StationTime.startOfDay(d)).day ?? 0
        dayIndex = max(0, min(6, diff))
    }

    private func useLast(_ o: SlotOptions) {
        guard let l = o.lastShow else { return }
        title = l.title; details = l.description; location = l.location; category = l.category.isEmpty ? "podcast" : l.category
        if !live, !l.audioURL.isEmpty { audioURL = l.audioURL }
    }

    private func pickAnother(_ r: SlotRequest) {
        type = (r.type == "live" && opts?.canLive == true) ? "live" : "prerecorded"
        length = HostLogic.clamp(r.durationMin, live: type == "live", liveMax: opts?.liveMax ?? 90)
        title = r.title; details = r.description; category = r.category.isEmpty ? "podcast" : r.category
        pick = nil; sent = nil; step = 1
    }

    private func loadAll() async {
        guard auth.isSignedIn, auth.currentUser?.isGuest != true else { return }
        now = Date()
        do { opts = try await BackendAPI.get("/api/slots/options"); error = nil }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        await slots.loadMine()
        if store.access == nil { await store.load(signedIn: true, guest: false) } else { store.standing = try? await BackendAPI.get("/api/me/standing") }
        pub = try? await BackendAPI.get("/api/me")
        if let o = opts, !seeded { seed(o) }
        shows = [:]; studio = [:]
        await loadWeek(weekOffset)
    }

    private func seed(_ o: SlotOptions) {
        seeded = true
        let wanted = preType ?? (o.canLive ? "live" : "prerecorded")
        type = (wanted == "live" && !o.canLive) ? "prerecorded" : wanted
        length = HostLogic.clamp(preLength ?? 60, live: type == "live", liveMax: o.liveMax)
        if let t = preTitle { title = t }
        if let d = preDescription { details = d }
        category = preCategory ?? o.lastShow?.category ?? "podcast"
        if category.isEmpty { category = "podcast" }
        if let s = preStart, s > Date() { choose(s) }
    }

    private func loadWeek(_ w: Int) async {
        guard opts != nil, shows[w] == nil else { return }
        let start = max(now, StationTime.startOfDay(now).addingTimeInterval(TimeInterval(w * 7) * 86_400))
        let end = StationTime.startOfDay(now).addingTimeInterval(TimeInterval((w + 1) * 7) * 86_400)
        let ms: (Date) -> Int = { Int($0.timeIntervalSince1970 * 1000) }
        let q = "?from=\(ms(start))&to=\(ms(end))"
        if let r: OpenRangesReply = try? await BackendAPI.get("/api/slots/open\(q)") { shows[w] = r.ranges }
        if let r: StudioOpenReply = try? await BackendAPI.get("/api/studio/open\(q)") { studio[w] = r } else { studio[w] = StudioOpenReply(ranges: [], quietRanges: []) }
    }

    private func loadPopular(_ c: String) async {
        guard opts != nil, popular[c] == nil else { return }
        if let p: PopularReply = try? await BackendAPI.get("/api/slots/popular?category=\(c)") { popular[c] = p }
    }

    private func upload(_ item: PhotosPickerItem) async {
        isUploading = true; defer { isUploading = false }
        do {
            guard let raw = try await item.loadTransferable(type: Data.self), let jpeg = ImageShrinker.jpeg(from: raw) else {
                error = "That picture couldn't be used. Try another one. (BR-CLI-004)"; return
            }
            uploaded = try await BackendAPI.uploadImage(jpeg)
            photoPreview = UIImage(data: jpeg)
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription; photoItem = nil }
    }

    private func send(_ o: SlotOptions, _ p: Date, _ e: Date) async {
        busy = true; error = nil
        defer { busy = false }
        var body: [String: Any] = [
            "title": title.trimmingCharacters(in: .whitespacesAndNewlines), "description": details.trimmingCharacters(in: .whitespacesAndNewlines),
            "location": location.trimmingCharacters(in: .whitespacesAndNewlines), "type": type, "category": category,
            "startAt": Int(p.timeIntervalSince1970 * 1000), "durationMin": length,
            "audioURL": live ? "" : audioURL.trimmingCharacters(in: .whitespaces),
            "imageUrl": uploaded?.url ?? "", "imagePath": uploaded?.path ?? "", "receiveRatings": receiveRatings,
            "noStudio": live && noStudio, "guests": GuestLogic.payload(chips), "justMe": justMe, "policyAck": true,
        ]
        if sharePublic, let info = pub { body["publicConsent"] = ["typedName": pubName.trimmingCharacters(in: .whitespaces), "accepted": true, "version": info.publicVersion] }
        do {
            let r: RequestReply = try await BackendAPI.post("/api/slots/request", body)
            var line = HostLogic.notice(start: p, opts: o).line
            if let rec = preRecording, !live {
                do {
                    let _: EmptyResponse = try await BackendAPI.post("/api/recordings/attach", ["recordingId": rec, "requestId": r.id, "cleanConfirmed": true])
                    line += " Your recording is attached and plays at air time."
                } catch { line += " The recording could not be attached yet: \((error as? BackendError)?.message ?? "try again from My recordings.")" }
            }
            sent = SentSummary(title: title, start: p, end: e, line: line, warning: r.warning ?? "", count: r.ids?.count ?? 1)
            title = ""; details = ""; location = ""; audioURL = ""; uploaded = nil; photoPreview = nil; photoItem = nil
            chips = []; justMe = false; agreed = false; sharePublic = false; pubTicks = []; pubName = ""; pick = nil; step = 1; recClean = false
            shows = [:]; studio = [:]
            await loadAll()
            // The request is saved. If the account has not signed the on-air agreements yet, that comes next.
            if r.needsAgreement == true { agreements = try? await BackendAPI.get("/api/training") }
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }

    private func repeatShow(_ r: SlotRequest) async {
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/slots/repeat", ["requestId": r.id, "weeks": 1])
            await loadAll()
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }

    private func sign(_ name: String, version: String) {
        signBusy = true; signError = nil
        Task {
            do {
                let _: EmptyResponse = try await BackendAPI.post("/api/host/readiness", ["typedName": name, "accepted": true, "version": version])
                agreements = nil
                await loadAll()
            } catch { signError = (error as? BackendError)?.message ?? error.localizedDescription }
            signBusy = false
        }
    }
}

// MARK: - Get trained (opens from "Get trained" buttons)

/// The in-person training steps, then "You can now host". The steps themselves live in HostGateView.
struct HostTrainingSheet: View {
    let onDone: () -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        NavigationStack {
            ScrollView {
                HostGateView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("You can now host").font(BRFont.display(28)).foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        Text("Your training is done. Pick a time and send your first show.").font(BRFont.body(16, .regular)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        Button(action: onDone) { Text("Host a show").font(BRFont.display(16)).kerning(1.5).frame(maxWidth: .infinity).padding(.vertical, 14) }
                            .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
                    }
                    .padding(20)
                }
                .padding(.top, 8)
            }
            .hwPage()
            .navigationTitle("Get trained")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close", action: onDone) } }
        }
    }
}

// MARK: - Host a show entry points

/// A card that opens Host a show. Used on Members, Library and the Schedule.
struct HostShowCard: View {
    var compact = true
    @Environment(\.colorScheme) private var scheme
    @ObservedObject private var auth = AuthManager.shared

    var body: some View {
        if auth.currentUser?.isGuest != true {
            NavigationLink { HostShowView() } label: {
                HStack(spacing: 14) {
                    Image(systemName: "mic.fill").font(.system(size: 20)).foregroundColor(scheme == .dark ? .brGold : .brGreen).frame(width: 28)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Host a show").font(BRFont.body(18, .semibold)).foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        if !compact {
                            Text("Pick a time, tell us about it, send.").font(BRFont.body(16, .regular)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                }
                .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
            }
            .buttonStyle(.plain)
        }
    }
}
