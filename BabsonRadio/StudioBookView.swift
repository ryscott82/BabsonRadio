import SwiftUI

// MARK: - Book the studio
// Day strip, 30-minute blocks from /api/studio/open (7 AM to 11 PM by default), tap a block, pick 30 / 60 / 90 minutes, who is coming,
// the policy tick, Book. Confirms at once. Quiet hours are tinted and warn in one line; nothing is ever blocked because of them.
// Loads when it opens and when the week changes. No polling.

extension Standing {
    /// "You cannot host or book until Dec 18. It comes from: missed live show (Nov 4)." Empty unless banned.
    var bannedLine: String {
        guard level >= 3 else { return "" }
        let until = bannedUntil.map { StationTime.day($0) } ?? "the end of the semester"
        let why = strikes.isEmpty ? "" : " It comes from: " + strikes.map { "\($0.reason.lowercased()) (\($0.date))" }.joined(separator: "; ") + "."
        return "You cannot host or book until \(until).\(why)"
    }
}

struct StudioBookView: View {
    let standing: Standing?
    var onBooked: () -> Void = {}

    @Environment(\.colorScheme) private var scheme
    @ObservedObject private var store = MembersStore.shared

    @State private var grid: StudioGrid?
    @State private var weekOffset = 0
    @State private var dayIndex = 0
    @State private var start: Date?
    @State private var length = 30
    @State private var chips: [GuestChip] = []
    @State private var justMe = false
    @State private var agreed = false
    @State private var busy = false
    @State private var error: String?
    @State private var done: String?
    @State private var now = Date()

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    private var windowStart: Date { StationTime.startOfDay(now).addingTimeInterval(TimeInterval(weekOffset * 7) * 86_400) }
    private var days: [Date] { (0..<7).compactMap { StationTime.calendar.date(byAdding: .day, value: $0, to: windowStart) } }
    private var held: Int { store.bookings?.held ?? 0 }
    private var maxHolds: Int { store.bookings?.maxHolds ?? grid?.rules.maxHolds ?? 2 }
    private var full: Bool { held >= maxHolds }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Book the studio").font(BRFont.display(28)).foregroundColor(text)
                Text(MembersText.walkIn).font(BRFont.body(16, .regular)).foregroundColor(sub)

                if let s = standing, s.level >= 3 {
                    Text(s.bannedLine).font(BRFont.body(16, .regular)).foregroundColor(.brRed)
                } else if let g = grid {
                    Text(StudioBlocks.holdLine(held: held, max: maxHolds)).font(BRFont.body(16, .semibold)).foregroundColor(full ? .brRed : text)
                    if !full { picker(g) }
                } else if let e = error {
                    Text(e).font(BRFont.body(16, .regular)).foregroundColor(.brRed)
                } else {
                    ProgressView()
                }

                if let d = done { Text(d).font(BRFont.body(16, .semibold)).foregroundColor(accent) }
            }
            .padding(20)
        }
        .hwPage()
        .navigationTitle("Book the studio")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loadGrid(); await store.loadBookings() }
        .task(id: weekOffset) { now = Date(); await loadGrid() }
        .task { await store.loadBookings() }
    }

    // MARK: pieces

    @ViewBuilder private func picker(_ g: StudioGrid) -> some View {
        HStack {
            Button { if weekOffset > 0 { weekOffset -= 1; dayIndex = 0; start = nil } } label: { Text("Earlier").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
                .opacity(weekOffset > 0 ? 1 : 0)
            Spacer()
            Text(weekOffset == 0 ? "This week" : "Next week").font(BRFont.body(16, .regular)).foregroundColor(sub)
            Spacer()
            Button { if weekOffset < 1 { weekOffset += 1; dayIndex = 0; start = nil } } label: { Text("Later").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
                .opacity(weekOffset < 1 ? 1 : 0)
        }

        // Days: one row you can scroll sideways, one tap each.
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(days.enumerated()), id: \.offset) { i, d in
                    Button { dayIndex = i; start = nil } label: {
                        Text(StationTime.day(d)).font(BRFont.body(16, dayIndex == i ? .semibold : .regular))
                            .foregroundColor(dayIndex == i ? .white : text)
                            .padding(.horizontal, 14).frame(minHeight: 44)
                            .background(dayIndex == i ? accent : Color.clear)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(accent.opacity(0.5), lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
        }

        let blocks = StudioBlocks.blocks(on: days[min(dayIndex, 6)], rules: g.rules)
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            ForEach(blocks, id: \.self) { b in block(b, g) }
        }
        legend

        if let s = start { chooser(s, g) }
    }

    private func block(_ b: Date, _ g: StudioGrid) -> some View {
        let state = StudioBlocks.state(b, grid: g, now: now)
        let quiet = StudioBlocks.touchesQuiet(g, b, b.addingTimeInterval(TimeInterval(g.rules.stepMinutes * 60)))
        let chosen = start == b
        return Button {
            start = b
            let longest = StudioBlocks.longest(from: b, grid: g)
            let fits = StudioBlocks.chips(longest: longest, rules: g.rules)
            length = fits.contains(length) ? length : (fits.last ?? g.rules.minMinutes)
            done = nil; error = nil
        } label: {
            Text(state == .taken ? "Booked" : StationTime.clock(b))
                .font(BRFont.body(16, chosen ? .semibold : .regular))
                .foregroundColor(chosen ? .white : (state == .free ? text : sub))
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(chosen ? accent : (quiet && state == .free ? Color.brGold.opacity(0.18) : Color.clear))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(state == .free ? accent.opacity(0.5) : sub.opacity(0.25), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(state != .free)
        .opacity(state == .past ? 0.45 : 1)
    }

    private var legend: some View {
        HStack(spacing: 14) {
            Label("Quiet hours", systemImage: "square.fill").foregroundColor(Color.brGold.opacity(0.6))
            Label("Booked", systemImage: "xmark.square").foregroundColor(sub)
        }
        .font(BRFont.body(14, .regular))
    }

    @ViewBuilder private func chooser(_ s: Date, _ g: StudioGrid) -> some View {
        let longest = StudioBlocks.longest(from: s, grid: g)
        let lengths = StudioBlocks.chips(longest: longest, rules: g.rules)
        let end = s.addingTimeInterval(TimeInterval(length * 60))
        VStack(alignment: .leading, spacing: 14) {
            Text(StationTime.range(s, end)).font(BRFont.body(18, .semibold)).foregroundColor(text)
            if lengths.isEmpty {
                Text("There is not enough free time here. Pick another block.").font(BRFont.body(16, .regular)).foregroundColor(.brRed)
            } else {
                HStack(spacing: 8) {
                    ForEach(lengths, id: \.self) { m in
                        Button { length = m } label: {
                            Text("\(m) min").font(BRFont.body(16, length == m ? .semibold : .regular))
                                .foregroundColor(length == m ? .white : text)
                                .padding(.horizontal, 16).frame(minHeight: 44)
                                .background(length == m ? accent : Color.clear)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(accent.opacity(0.5), lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }
                }
                if StudioBlocks.touchesQuiet(g, s, end) {
                    Text(g.warning ?? MembersText.quiet).font(BRFont.body(16, .regular)).foregroundColor(.brGold)
                }
                GuestPicker(chips: $chips, justMe: $justMe, capacity: g.rules.capacity)
                PolicyBox(agreed: $agreed)
                if let e = error { Text(e).font(BRFont.body(16, .regular)).foregroundColor(.brRed) }
                let problem = GuestLogic.problem(chips, justMe: justMe)
                if !problem.isEmpty { Text(problem).font(BRFont.body(14, .regular)).foregroundColor(sub) }
                Button { Task { await book(s, g) } } label: {
                    HStack { Spacer(); if busy { ProgressView() } else { Text("Book it").font(BRFont.display(16)).kerning(2) }; Spacer() }
                        .padding(.vertical, 14)
                }
                .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
                .disabled(busy || !agreed || !problem.isEmpty)
            }
        }
    }

    // MARK: actions

    private func loadGrid() async {
        let from = max(Date(), windowStart)
        let to = windowStart.addingTimeInterval(7 * 86_400)
        let path = "/api/studio/open?from=\(Int(from.timeIntervalSince1970 * 1000))&to=\(Int(to.timeIntervalSince1970 * 1000))"
        do { grid = try await BackendAPI.get(path); error = nil }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }

    private func book(_ s: Date, _ g: StudioGrid) async {
        busy = true; error = nil
        defer { busy = false }
        let body: [String: Any] = [
            "startAt": Int(s.timeIntervalSince1970 * 1000), "durationMin": length,
            "guests": GuestLogic.payload(chips), "justMe": justMe, "policyAck": agreed,
        ]
        do {
            let r: BookReply = try await BackendAPI.post("/api/studio/book", body)
            done = "Booked: \(StationTime.range(s, s.addingTimeInterval(TimeInterval(length * 60))))." + ((r.quiet ?? false) ? " " + (r.warning ?? MembersText.quiet) : "")
            start = nil; chips = []; justMe = false; agreed = false
            await loadGrid(); await store.loadBookings()
            onBooked()
        } catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }
}
