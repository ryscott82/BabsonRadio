import SwiftUI
import PhotosUI
import UIKit

// MARK: - Host a show (reached from Profile, Members, Library and the top bar)
// The three-step flow lives in HostShowView.swift. This wrapper keeps the old name for the Profile row.

struct SlotsView: View {
    /// True when pushed from Profile (the Profile tab already provides the navigation stack).
    var embedded = false

    var body: some View {
        if embedded { HostShowView() } else { NavigationStack { HostShowView() } }
    }
}

// MARK: - Rows

struct SlotRequestRow: View {
    let request: SlotRequest
    let onCancel: () -> Void
    /// "Same time next week" (only when repeating is on) and "Pick another time" (declined shows).
    var onRepeat: (() -> Void)? = nil
    var onPickAnother: (() -> Void)? = nil
    @Environment(\.colorScheme) var scheme

    private var textColor: Color { scheme == .dark ? .brDkText : .brLtText }
    private var subColor: Color { scheme == .dark ? .brDkSub : .brLtSub }

    private var canCancel: Bool {
        (request.status == "pending" || request.status == "approved") && request.startAt > Date()
    }

    private var statusLabel: String {
        switch request.status {
        case "pending":  return "PENDING REVIEW"
        case "approved": return "APPROVED"
        case "declined": return "DECLINED"
        default:         return "CANCELLED"
        }
    }

    private var statusColor: Color {
        switch request.status {
        case "approved": return .brGreen
        case "pending":  return scheme == .dark ? .brGold : .brGreenMid
        case "declined": return .brRed
        default:         return subColor
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Text(request.title)
                    .font(BRFont.body(16, .semibold))
                    .foregroundColor(textColor)
                Spacer()
                Text(statusLabel)
                    .font(BRFont.display(11))
                    .kerning(1.5)
                    .foregroundColor(statusColor)
            }

            Text("\(request.startAt.formatted(date: .abbreviated, time: .shortened)) · \(request.durationMin) min · \(request.type == "live" ? "Live" : "Pre-recorded")")
                .font(BRFont.body(13, .regular))
                .foregroundColor(subColor)

            if !request.staffNote.isEmpty {
                Text("Staff note: \(request.staffNote)")
                    .font(BRFont.body(13, .regular))
                    .foregroundColor(textColor)
            }

            if request.status == "approved" && !request.connectionInfo.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(request.type == "live" ? "HOW TO GO LIVE" : "DETAILS")
                        .font(BRFont.display(10))
                        .kerning(2)
                        .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                    Text(request.connectionInfo)
                        .font(BRFont.body(13, .regular))
                        .foregroundColor(textColor)
                        .textSelection(.enabled)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(HWFieldFill())
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            if request.status == "pending" {
                Text(request.autoNote).font(BRFont.body(14, .regular)).foregroundColor(subColor)
            }

            if request.status == "declined", let onPickAnother {
                Button("Pick another time", action: onPickAnother).font(BRFont.body(16, .semibold)).frame(minHeight: 44)
            }

            if (request.status == "pending" || request.status == "approved"), request.startAt > Date(), let onRepeat {
                Button("Same time next week", action: onRepeat).font(BRFont.body(16, .semibold)).frame(minHeight: 44)
            }

            if canCancel {
                Button("Cancel request", role: .destructive, action: onCancel)
                    .font(BRFont.body(16, .regular)).frame(minHeight: 44)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brCard()
    }
}

private struct AutoBlockRow: View {
    let block: AutoBlock
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(block.label)
                    .font(BRFont.body(15, .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text("On the radio")
                    .font(BRFont.body(12, .regular))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(block.startAt.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
                    .font(BRFont.body(12, .medium))
                Text("\(block.startAt.formatted(date: .omitted, time: .shortened)) – \(block.endAt.formatted(date: .omitted, time: .shortened))")
                    .font(BRFont.body(12, .regular))
            }
            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HWFieldFill())
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12)
            .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1))
    }
}

private struct AirSlotRow: View {
    let slot: AirSlot
    @Environment(\.colorScheme) var scheme

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(slot.title)
                    .font(BRFont.body(15, .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text("with \(slot.hostName) · \(slot.type == "live" ? "Live" : "Pre-recorded")")
                    .font(BRFont.body(12, .regular))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(slot.startAt.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
                    .font(BRFont.body(12, .medium))
                Text("\(slot.startAt.formatted(date: .omitted, time: .shortened)) – \(slot.endAt.formatted(date: .omitted, time: .shortened))")
                    .font(BRFont.body(12, .regular))
            }
            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
        }
        .padding(14)
        .brCard()
    }
}

nonisolated struct PublicInfo: Decodable {
    let publicSharing: String?
    let publicClauses: [String]
    let publicVersion: String
}

// MARK: - Picture helpers

enum ImageShrinker {
    /// Resizes to at most 800px and compresses to JPEG under ~400 KB (usually 60–150 KB).
    static func jpeg(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, 800 / longest)
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            UIColor.white.setFill(); UIRectFill(CGRect(origin: .zero, size: size))
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        for q in [0.82, 0.7, 0.55, 0.4] {
            if let out = small.jpegData(compressionQuality: q), out.count <= 400_000 { return out }
        }
        return nil
    }
}

/// Fallback artwork when an item has no picture (mirrors genreArt.ts on the website).
struct GenreArt: View {
    let title: String
    private static let pairs: [(Color, Color)] = [
        (Color(red: 0.00, green: 0.24, blue: 0.15), Color(red: 0.00, green: 0.40, blue: 0.27)),
        (Color(red: 0.10, green: 0.18, blue: 0.29), Color(red: 0.18, green: 0.36, blue: 0.54)),
        (Color(red: 0.16, green: 0.10, blue: 0.03), Color(red: 0.36, green: 0.23, blue: 0.06)),
        (Color(red: 0.10, green: 0.04, blue: 0.18), Color(red: 0.29, green: 0.10, blue: 0.48)),
        (Color(red: 0.16, green: 0.03, blue: 0.03), Color(red: 0.48, green: 0.10, blue: 0.10)),
        (Color(red: 0.06, green: 0.16, blue: 0.18), Color(red: 0.12, green: 0.44, blue: 0.47)),
    ]
    private var pair: (Color, Color) {
        var h: UInt32 = 0
        for u in title.lowercased().unicodeScalars { h = h &* 31 &+ u.value }
        return Self.pairs[Int(h % UInt32(Self.pairs.count))]
    }
    var body: some View {
        ZStack {
            LinearGradient(colors: [pair.0, pair.1], startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(String(title.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
                .font(BRFont.display(28)).foregroundColor(.brAccentText)
        }
    }
}

/// The beaver on the scheduler's color (or a plain plate): what a show shows when it has no picture.
struct BeaverArt: View {
    let tint: Color?
    var body: some View {
        ZStack {
            if let tint { LinearGradient(colors: [tint, tint.opacity(0.45)], startPoint: .topLeading, endPoint: .bottomTrailing) }
            else { Color.black.opacity(0.12) }
            GeometryReader { g in
                Image("LaunchLogo").resizable().scaledToFit().frame(width: g.size.width * 0.62, height: g.size.height * 0.62)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

/// The item's picture, or generated artwork.
struct ScheduleArt: View {
    let entry: ScheduleEntry
    var body: some View {
        if let url = URL(string: entry.imageUrl), !entry.imageUrl.isEmpty {
            AsyncImage(url: url) { phase in
                if let image = phase.image { image.resizable().scaledToFill() } else if entry.source != "auto" { BeaverArt(tint: entry.tint) } else { GenreArt(title: entry.title) }
            }
        } else if entry.source != "auto" {
            BeaverArt(tint: entry.tint)
        } else if let tint = entry.tint {
            ZStack {
                LinearGradient(colors: [tint, tint.opacity(0.45)], startPoint: .topLeading, endPoint: .bottomTrailing)
                Text(String(entry.title.prefix(1)).uppercased())
                    .font(BRFont.display(22)).foregroundColor(.white.opacity(0.9))
            }
        } else {
            GenreArt(title: entry.title)
        }
    }
}

// MARK: - Schedule tab
// The whole next week: weekly shows, approved student shows and genre playlists, with a detail screen.

struct ScheduleView: View {
    @StateObject private var auth = AuthManager.shared
    @StateObject private var slots = SlotsManager()
    @Environment(\.colorScheme) var scheme
    @State private var selected: ScheduleEntry?
    @State private var calSelected: ScheduleEntry?   // a show opened from inside the auto DJ calendar
    @State private var showAuto = false
    @State private var first = Calendar.current.startOfDay(for: Date())   // first of the three days shown
    @ObservedObject private var reminders = ReminderManager.shared

    private let hourH: CGFloat = 56
    private let gutter: CGFloat = 40
    private let daysShown = 3
    private let daysLoaded = 14

    private var textColor: Color { scheme == .dark ? .brDkText : .brLtText }
    private var subColor: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var lineColor: Color { scheme == .dark ? .brDkBorder : .brLtBorder }
    private var cal: Calendar { Calendar.current }
    private var today: Date { cal.startOfDay(for: Date()) }
    private var shown: [Date] { (0..<daysShown).compactMap { cal.date(byAdding: .day, value: $0, to: first) } }
    private var minDay: Date { cal.date(byAdding: .day, value: -7, to: today) ?? today }   // how far back you can look
    private var canBack: Bool { first > minDay }
    private var canForward: Bool {
        guard let end = cal.date(byAdding: .day, value: daysShown, to: first),
              let limit = cal.date(byAdding: .day, value: daysLoaded, to: today) else { return false }
        return end < limit
    }

    /// Opens the show a tapped reminder was about (matched by its key), then forgets the tap. With no key it just leaves the Schedule tab showing.
    private func openReminderShow() {
        guard let key = reminders.openShowKey else { return }
        if key.isEmpty { reminders.openShowKey = nil; return }
        let now = Date()
        guard let entry = slots.feed.filter({ $0.reminderKey == key && $0.endAt > now }).min(by: { $0.startAt < $1.startAt }) else { return }
        selected = entry
        reminders.openShowKey = nil
    }

    private func move(_ days: Int) {
        if let d = cal.date(byAdding: .day, value: days, to: first) { first = max(d, minDay) }
    }

    private var rangeText: String {
        guard let a = shown.first, let b = shown.last else { return "" }
        return "\(a.formatted(.dateTime.month(.abbreviated).day())) – \(b.formatted(.dateTime.month(.abbreviated).day()))".uppercased()
    }

    // The live lineup: everything that is not the auto DJ, soonest first, grouped by day.
    private var lineup: [(day: Date, items: [ScheduleEntry])] {
        let items = slots.feed.filter { $0.source != "auto" && $0.endAt > Date() }.sorted { $0.startAt < $1.startAt }
        let groups = Dictionary(grouping: items) { cal.startOfDay(for: $0.startAt) }
        return groups.keys.sorted().map { ($0, groups[$0] ?? []) }
    }

    private func dayTitle(_ d: Date) -> String {
        if cal.isDateInToday(d) { return "TODAY" }
        if cal.isDateInTomorrow(d) { return "TOMORROW" }
        return d.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()).uppercased()
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    if lineup.isEmpty {
                        Text(slots.isLoading ? "Loading…" : "No live shows coming up.")
                            .font(BRFont.body(14, .regular)).foregroundColor(subColor)
                    }
                    ForEach(lineup, id: \.day) { group in
                        VStack(alignment: .leading, spacing: 10) {
                            BRSectionHeader(title: dayTitle(group.day))
                            ForEach(group.items) { e in ScheduleEntryRow(entry: e) { selected = e } }
                        }
                    }
                    // The auto DJ calendar is a tap away, so the shows with people in them come first.
                    Button { showAuto = true } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "music.note.list")
                            Text("Music schedule").font(BRFont.display(14)).kerning(2)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                        .padding(14)
                        .frame(maxWidth: .infinity)
                        .brCard()
                    }
                    .buttonStyle(.plain)
                }
                .padding(20)
            }
            .refreshable { await slots.loadFeed() }
            .hwPage()
            .navigationTitle("")
            .profileButton()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    EtchedText(text: "Babson Radio", size: 24)
                }
            }
        }
        .sheet(item: $selected) { ScheduleDetailView(entry: $0) }
        // A tapped show reminder: open that show once the schedule has loaded.
        .onChange(of: reminders.openShowKey) { _, _ in openReminderShow() }
        .onChange(of: slots.feed.count) { _, _ in openReminderShow() }
        .sheet(isPresented: $showAuto) { calendarSheet }
        .alert("Reminders", isPresented: Binding(get: { reminders.notice != nil }, set: { if !$0 { reminders.notice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(reminders.notice ?? "") }
        .task(id: auth.currentUser?.id) { await slots.loadFeed() }
    }

    /// The full 24 hour calendar, with the auto DJ's blocks, for people who want it.
    private var calendarSheet: some View {
        NavigationStack {
            VStack(spacing: 0) {
                controls
                dayHeader
                Divider().overlay(lineColor)
                ScrollViewReader { proxy in
                    ScrollView(showsIndicators: false) {
                        if slots.feed.isEmpty {
                            Text(slots.isLoading ? "Loading…" : "Nothing is scheduled yet.")
                                .font(BRFont.body(13, .regular)).foregroundColor(subColor).padding(20)
                        } else {
                            grid
                        }
                    }
                    .refreshable { await slots.loadFeed() }
                    .onAppear { scrollToNow(proxy) }
                    .onChange(of: first) { _, _ in scrollToNow(proxy) }
                }
            }
            .hwPage()
            .navigationTitle("Music schedule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showAuto = false } } }
        }
        .sheet(item: $calSelected) { ScheduleDetailView(entry: $0) }
    }

    private func scrollToNow(_ proxy: ScrollViewProxy) {
        let hour = first == today ? max(0, cal.component(.hour, from: Date()) - 1) : 7
        DispatchQueue.main.async { proxy.scrollTo(hour, anchor: .top) }
    }

    // MARK: pieces

    private var controls: some View {
        HStack(spacing: 10) {
            Button { move(-1) } label: { Image(systemName: "chevron.left").frame(width: 34, height: 34) }
                .disabled(!canBack)
            Button { move(1) } label: { Image(systemName: "chevron.right").frame(width: 34, height: 34) }
                .disabled(!canForward)
            Button("Today") { first = today }
                .font(BRFont.body(13, .semibold))
                .disabled(first == today)
            Spacer()
            Text(rangeText).font(BRFont.display(13)).kerning(2)
                .foregroundColor(scheme == .dark ? .brGold : .brGreen)
        }
        .font(BRFont.body(15, .semibold))
        .foregroundColor(scheme == .dark ? .brGold : .brGreen)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private var dayHeader: some View {
        HStack(spacing: 0) {
            Spacer().frame(width: gutter)
            ForEach(shown, id: \.self) { day in
                let isToday = cal.isDate(day, inSameDayAs: Date())
                VStack(spacing: 1) {
                    Text(isToday ? "TODAY" : day.formatted(.dateTime.weekday(.abbreviated)).uppercased())
                        .font(BRFont.display(11)).kerning(1.5)
                        .foregroundColor(isToday ? (scheme == .dark ? .brGold : .brGreen) : subColor)
                    Text(day.formatted(.dateTime.month(.abbreviated).day()))
                        .font(BRFont.body(13, .medium)).foregroundColor(textColor)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
        }
    }

    private var grid: some View {
        HStack(alignment: .top, spacing: 0) {
            // Hour labels (also the scroll anchors)
            VStack(spacing: 0) {
                ForEach(0..<24, id: \.self) { h in
                    Text(h == 0 ? "" : Calendar.current.date(from: DateComponents(hour: h))!.formatted(.dateTime.hour()))
                        .font(BRFont.body(10, .regular)).foregroundColor(subColor)
                        .frame(width: gutter - 4, height: hourH, alignment: .topTrailing)
                        .offset(y: -6)
                        .id(h)
                }
            }
            .frame(width: gutter)
            ForEach(shown, id: \.self) { day in
                dayColumn(day)
            }
        }
        .frame(height: hourH * 24)
        .padding(.bottom, 24)
    }

    private func dayColumn(_ day: Date) -> some View {
        let start = day
        let end = cal.date(byAdding: .day, value: 1, to: day) ?? day.addingTimeInterval(86_400)
        let items = slots.feed.filter { $0.startAt < end && $0.endAt > start }
        return GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                ForEach(0..<24, id: \.self) { h in
                    Rectangle().fill(lineColor.opacity(0.6)).frame(height: 0.5).offset(y: CGFloat(h) * hourH)
                }
                ForEach(items) { e in
                    let top = max(e.startAt, start).timeIntervalSince(start) / 3600 * hourH
                    let height = max(min(e.endAt, end).timeIntervalSince(max(e.startAt, start)) / 3600 * hourH - 2, 22)
                    CalendarBlock(entry: e, height: height, onOpen: { calSelected = e })
                        .opacity(e.endAt <= Date() ? 0.55 : 1)
                        .frame(width: geo.size.width - 4, height: height)
                        .offset(x: 2, y: top + 1)
                }
                if cal.isDate(day, inSameDayAs: Date()) {
                    Rectangle().fill(Color.brRed).frame(height: 1.5)
                        .offset(y: Date().timeIntervalSince(start) / 3600 * hourH)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .overlay(alignment: .leading) { Rectangle().fill(lineColor).frame(width: 0.5) }
    }
}

/// One show on the calendar. Tap to open details; the small bell sets a reminder.
private struct CalendarBlock: View {
    let entry: ScheduleEntry
    let height: CGFloat
    let onOpen: () -> Void
    @Environment(\.colorScheme) var scheme

    private var onNow: Bool { entry.startAt <= Date() && entry.endAt > Date() }
    private var isAuto: Bool { entry.source == "auto" }
    private var accent: Color { entry.tint ?? (scheme == .dark ? Color.brGold : Color.brGreen) }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.title)
                    .font(BRFont.body(11, .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if height >= 44 {
                    Text(entry.startAt.formatted(date: .omitted, time: .shortened))
                        .font(BRFont.body(9, .regular))
                        .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        .lineLimit(1)
                }
            }
            .padding(.leading, 6).padding(.trailing, 22).padding(.vertical, 4)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .contentShape(Rectangle())
            .onTapGesture(perform: onOpen)
            if height >= 34 {
                BellButton(entry: entry, compact: true)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isAuto ? (scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
                             : accent.opacity(entry.tint != nil ? 0.30 : (scheme == .dark ? 0.18 : 0.14)))
        )
        .overlay(alignment: .leading) {
            if !isAuto { RoundedRectangle(cornerRadius: 1).fill(accent).frame(width: 3) }
        }
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(onNow ? Color.brRed : .clear, lineWidth: 1.5))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

private struct ScheduleEntryRow: View {
    let entry: ScheduleEntry
    let onOpen: () -> Void
    @Environment(\.colorScheme) var scheme

    private var onNow: Bool { entry.startAt <= Date() && entry.endAt > Date() }

    var body: some View {
        HStack(spacing: 6) {
        HStack(spacing: 14) {
            ScheduleArt(entry: entry)
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.title)
                    .font(BRFont.body(15, .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    .lineLimit(1)
                Text((entry.hosts.isEmpty ? "" : "with \(entry.hosts.joined(separator: ", ")) · ") + entry.formatLabel)
                    .font(BRFont.body(12, .regular))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                if onNow {
                    Text("ON now").font(BRFont.display(10)).kerning(1.5).foregroundColor(.brRed)
                }
                Text("\(entry.startAt.formatted(date: .omitted, time: .shortened)) – \(entry.endAt.formatted(date: .omitted, time: .shortened))")
                    .font(BRFont.body(12, .regular))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onOpen)
            BellButton(entry: entry)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brCard()
    }
}

struct ScheduleDetailView: View {
    let entry: ScheduleEntry
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) var scheme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ScheduleArt(entry: entry)
                        .frame(maxWidth: .infinity)
                        .frame(height: 240)
                        .clipped()
                    VStack(alignment: .leading, spacing: 12) {
                        Text(entry.formatLabel + (entry.category.isEmpty ? "" : " · \(entry.category.uppercased())"))
                            .font(BRFont.display(12)).kerning(2)
                            .foregroundColor(scheme == .dark ? .brGold : .brGreen)
                        Text(entry.title)
                            .font(BRFont.display(32))
                            .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        if !entry.hosts.isEmpty {
                            Text("with \(entry.hosts.joined(separator: ", "))")
                                .font(BRFont.body(15, .regular))
                                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        }
                        Text("\(entry.startAt.formatted(.dateTime.weekday(.wide).month(.wide).day()))\n\(entry.startAt.formatted(date: .omitted, time: .shortened)) – \(entry.endAt.formatted(date: .omitted, time: .shortened))")
                            .font(BRFont.body(14, .regular))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        DetailBellRow(entry: entry)
                        // An open Auto DJ stretch: one tap starts Host a show at this time.
                        if entry.source == "auto", entry.startAt > Date(), auth.isSignedIn, auth.currentUser?.isGuest != true {
                            NavigationLink { HostShowView(preStart: entry.startAt, preLength: min(90, max(30, Int(entry.endAt.timeIntervalSince(entry.startAt) / 60)))) } label: {
                                Label("Host here", systemImage: "mic.fill").font(BRFont.body(16, .semibold)).frame(minHeight: 44)
                            }
                        }
                        if !entry.description.isEmpty {
                            Text(entry.description)
                                .font(BRFont.body(15, .regular))
                                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 30)
                }
            }
            .hwPage()
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.large])
    }
}

private struct DetailBellRow: View {
    let entry: ScheduleEntry
    @ObservedObject private var reminders = ReminderManager.shared
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let on = reminders.isOn(entry)
        Button { Task { await reminders.toggle(entry) } } label: {
            HStack(spacing: 8) {
                Image(systemName: on ? "bell.fill" : "bell")
                Text(on ? "Reminder on" : "Remind me 5 minutes before")
                    .font(BRFont.body(14, .semibold))
            }
            .foregroundColor(on ? .brGold : (scheme == .dark ? .brDkText : .brLtText))
            .padding(.vertical, 10).padding(.horizontal, 16)
            .brCard()
        }
        .buttonStyle(.plain)
    }
}
