import SwiftUI

// MARK: - Members tab
// Top to bottom: Next up for me, Host a show, Studio, Standing, Training, Club events, Info (and E-board tools for E-board and Admin).
// Everyone can read it. Signed-out people and guests see Club events and Info, plus a sign-in prompt.
// Loads when the tab opens and on pull to refresh. Nothing polls.

struct MembersView: View {
    @ObservedObject private var auth = AuthManager.shared
    @ObservedObject private var store = MembersStore.shared
    @StateObject private var slots = SlotsManager()
    @Environment(\.colorScheme) private var scheme
    @State private var confirmCancel: StudioBooking?
    @State private var busyCancel = false

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }
    private var isGuest: Bool { auth.currentUser?.isGuest == true }
    private var member: Bool { auth.isSignedIn && !isGuest }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 28) {
                        if let e = store.error { Text(e).font(BRFont.body(16, .regular)).foregroundColor(.brRed) }
                        if !member { signInPrompt }
                        if member {
                            nextUp
                            HostShowCard(compact: false)
                            studio(proxy)
                            standing
                            training.id("training")
                        }
                        clubEvents
                        info
                        if member && store.access?.isEBoard == true { eboard }
                    }
                    .padding(20)
                }
                .refreshable { await reload() }
            }
            .hwPage()
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { EtchedText(text: "Babson Radio", size: 24) } }
            .profileButton()
        }
        .task(id: auth.currentUser?.id) { await reload() }
        .confirmationDialog("Cancel this booking?", isPresented: Binding(get: { confirmCancel != nil }, set: { if !$0 { confirmCancel = nil } }), titleVisibility: .visible) {
            Button("Cancel booking", role: .destructive) { if let b = confirmCancel { Task { await cancel(b) } } }
            Button("Keep it", role: .cancel) {}
        } message: {
            if let b = confirmCancel {
                Text(StudioBlocks.canCancelFree(b.startAt, now: Date(), cancelHours: 2) ? "You can cancel until 2 hours before." : "Less than 2 hours away. You can still cancel, and the E-board may be told.")
            }
        }
    }

    private func reload() async {
        await store.load(signedIn: auth.isSignedIn, guest: isGuest)
        if member { await slots.loadMine() }
    }

    // MARK: sign in

    private var signInPrompt: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(isGuest ? "The rest of Members is for Babson, Olin and Wellesley students." : "Sign in with your school email to book the studio, host a show and see your standing.")
                .font(BRFont.body(16, .regular)).foregroundColor(sub)
            if !isGuest {
                Button { auth.goToSignIn() } label: { Text("Sign in").font(BRFont.display(16)).kerning(1.5).frame(maxWidth: .infinity).padding(.vertical, 14) }
                    .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
            }
        }
    }

    // MARK: Next up for me

    private var nextUp: some View {
        let lines = nextUpLines
        return VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "Next up for me")
            if lines.isEmpty {
                Text(store.loaded ? "Nothing coming up. Host a show or book the studio below." : "Loading…").font(BRFont.body(16, .regular)).foregroundColor(sub)
            }
            ForEach(lines, id: \.self) { Text($0).font(BRFont.body(16, .regular)).foregroundColor(text) }
        }
    }

    private var nextUpLines: [String] {
        var out: [String] = []
        if let b = store.bookings?.upcoming.first { out.append("Studio: \(StationTime.range(b.startAt, b.endAt))") }
        if let r = slots.myRequests.filter({ ($0.status == "approved" || $0.status == "pending") && $0.endAt > Date() }).min(by: { $0.startAt < $1.startAt }) {
            out.append("Show: \(r.title), \(StationTime.when(r.startAt))\(r.status == "pending" ? " (waiting for approval)" : "")")
        }
        if let s = store.sessions.first(where: { $0.me.rsvp }) { out.append("Training: \(s.title), \(StationTime.when(s.startsAt))") }
        if let t = store.access?.training {
            let soon = Date().addingTimeInterval(30 * 86_400)
            if t.studioExpired { out.append("Your studio training has ended. Renew it to book the studio.") }
            else if let d = t.studioExpiresAt, d < soon { out.append("Studio training ends \(StationTime.day(d)). Renew it before then.") }
            if t.radioExpired { out.append("Your radio training has ended. Renew it to host live.") }
            else if let d = t.radioExpiresAt, d < soon { out.append("Radio training ends \(StationTime.day(d)). Renew it before then.") }
        }
        return out
    }

    // MARK: Studio

    @ViewBuilder private func studio(_ proxy: ScrollViewProxy) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BRSectionHeader(title: "Studio")
            Text(MembersText.walkIn).font(BRFont.body(16, .regular)).foregroundColor(sub)

            if store.studioBadge {
                if let b = store.bookings {
                    Text(StudioBlocks.holdLine(held: b.held, max: b.maxHolds)).font(BRFont.body(16, .semibold)).foregroundColor(b.held >= b.maxHolds ? .brRed : text)
                    ForEach(b.upcoming) { bk in bookingRow(bk) }
                }
                if let s = store.standing, s.level >= 3 {
                    Text(s.bannedLine).font(BRFont.body(16, .regular)).foregroundColor(.brRed)
                } else {
                    NavigationLink { StudioBookView(standing: store.standing) } label: { rowLabel("Book the studio", systemImage: "calendar.badge.plus") }
                        .buttonStyle(.plain)
                }

                if !store.recordings.isEmpty {
                    Text("My recordings").font(BRFont.body(16, .semibold)).foregroundColor(text).padding(.top, 6)
                    ForEach(store.recordings) { r in recordingRow(r) }
                }
            } else {
                Text("Booking the studio needs the Studio badge.").font(BRFont.body(16, .regular)).foregroundColor(sub)
                Button { withAnimation { proxy.scrollTo("training", anchor: .top) } } label: {
                    Text("Get trained").font(BRFont.display(16)).kerning(1.5).frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                .buttonStyle(HWKeyStyle(corner: 12, lit: false, height: nil))
            }
        }
    }

    private func bookingRow(_ b: StudioBooking) -> some View {
        let guestLine = b.justMe ? "Just me" : (b.guests.isEmpty ? "" : b.guests.map(\.name).joined(separator: ", "))
        return VStack(alignment: .leading, spacing: 6) {
            Text(StationTime.range(b.startAt, b.endAt)).font(BRFont.body(16, .semibold)).foregroundColor(text)
            if !guestLine.isEmpty { Text(guestLine).font(BRFont.body(14, .regular)).foregroundColor(sub) }
            if b.quiet { Text(MembersText.quiet).font(BRFont.body(14, .regular)).foregroundColor(.brGold) }
            Text(StudioBlocks.canCancelFree(b.startAt, now: Date(), cancelHours: 2) ? "You can cancel until 2 hours before." : "Less than 2 hours away. You can still cancel, and the E-board may be told.")
                .font(BRFont.body(14, .regular)).foregroundColor(sub)
            Button("Cancel booking", role: .destructive) { confirmCancel = b }.font(BRFont.body(16, .regular)).frame(minHeight: 44)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private func recordingRow(_ r: RecordingRow) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(r.title.isEmpty ? "Recording" : r.title).font(BRFont.body(16, .semibold)).foregroundColor(text)
            Text("\(mmss(r.durationSec)) · \(recordingWord(r))").font(BRFont.body(14, .regular)).foregroundColor(sub)
            HStack(spacing: 16) {
                if r.requestId.isEmpty && (r.status == "uploaded" || r.status == "attached") {
                    NavigationLink { HostShowView(preType: "prerecorded", preRecording: r.id) } label: {
                        Text("Schedule this to air").font(BRFont.body(16, .semibold)).foregroundColor(accent).frame(minHeight: 44)
                    }
                }
                Button("Delete", role: .destructive) { Task { await store.deleteRecording(r) } }.font(BRFont.body(16, .regular)).frame(minHeight: 44)
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }

    private func mmss(_ sec: Int) -> String { String(format: "%d:%02d", sec / 60, sec % 60) }
    private func recordingWord(_ r: RecordingRow) -> String {
        switch r.status {
        case "recording": return "recording"
        case "uploading": return "uploading"
        case "attached": return r.scheduled ? "scheduled to air" : "attached to a show"
        case "aired": return "aired"
        default: return "ready"
        }
    }

    private func cancel(_ b: StudioBooking) async {
        confirmCancel = nil
        do {
            let _: EmptyResponse = try await BackendAPI.post("/api/studio/cancel", ["id": b.id])
            await store.loadBookings()
        } catch { store.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }

    // MARK: Standing

    @ViewBuilder private var standing: some View {
        VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "Standing")
            if let s = store.standing {
                Text(s.label).font(BRFont.body(20, .semibold)).foregroundColor(s.level >= 2 ? .brRed : text)
                if s.strikes.isEmpty {
                    Text("No missed shows or bookings. Keep it up.").font(BRFont.body(16, .regular)).foregroundColor(sub)
                } else {
                    ForEach(s.strikes) { l in Text("\(l.date): \(l.reason)").font(BRFont.body(16, .regular)).foregroundColor(text) }
                }
                Text("A missed show or booking gets a mistake, then a warning, then a ban from hosting and booking until the semester ends. The E-board can excuse a mistake. Mistakes clear at the end of the semester.")
                    .font(BRFont.body(14, .regular)).foregroundColor(sub)
            } else {
                Text(store.loaded ? "Good standing" : "Loading…").font(BRFont.body(16, .regular)).foregroundColor(sub)
            }
        }
    }

    // MARK: Training

    @ViewBuilder private var training: some View {
        VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "Training")
            badgeLine("Studio", has: store.access?.studioTrained == true || store.access?.isEBoard == true, ends: store.access?.training?.studioExpiresAt, expired: store.access?.training?.studioExpired == true)
            badgeLine("Radio", has: store.access?.radioTrained == true || store.access?.isEBoard == true, ends: store.access?.training?.radioExpiresAt, expired: store.access?.training?.radioExpired == true)

            if store.access?.isEBoard != true && (store.access?.studioTrained != true || store.access?.radioTrained != true) {
                Text("Get trained to book the studio and host live.").font(BRFont.body(16, .regular)).foregroundColor(sub)
            }
            if store.sessions.isEmpty {
                Text(store.loaded ? "No training sessions are scheduled right now." : "Loading…").font(BRFont.body(16, .regular)).foregroundColor(sub)
            }
            ForEach(store.sessions) { s in
                VStack(alignment: .leading, spacing: 6) {
                    Text(s.title).font(BRFont.body(16, .semibold)).foregroundColor(text)
                    Text("\(StationTime.range(s.startsAt, s.endsAt)) · \(s.location)").font(BRFont.body(14, .regular)).foregroundColor(sub)
                    Text("\(s.rsvpCount) of \(s.capacity) spots taken").font(BRFont.body(14, .regular)).foregroundColor(sub)
                    Button { Task { await store.rsvp(s, want: !s.me.rsvp) } } label: {
                        Text(s.me.rsvp ? "Give back my spot" : "Save my spot").font(BRFont.body(16, .semibold)).foregroundColor(s.me.rsvp ? sub : accent).frame(minHeight: 44)
                    }
                }
                .padding(14).frame(maxWidth: .infinity, alignment: .leading).brCard()
            }
            Button { showTraining = true } label: { Text("Do the radio host training").font(BRFont.body(16, .semibold)).frame(minHeight: 44) }
        }
        .sheet(isPresented: $showTraining) { HostTrainingSheet { showTraining = false; Task { await reload() } } }
    }

    @State private var showTraining = false

    private func badgeLine(_ name: String, has: Bool, ends: Date?, expired: Bool) -> some View {
        let state = expired ? "ended, renew it" : (has ? (ends.map { "active until \(StationTime.day($0))" } ?? "active") : "not yet")
        return Text("\(name) badge: \(state)").font(BRFont.body(16, .regular)).foregroundColor(has && !expired ? text : sub)
    }

    // MARK: Club events

    @ViewBuilder private var clubEvents: some View {
        VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "Club events")
            if store.events.isEmpty {
                Text(store.loaded ? "No club events are planned yet." : "Loading…").font(BRFont.body(16, .regular)).foregroundColor(sub)
            }
            ForEach(store.events) { e in
                VStack(alignment: .leading, spacing: 4) {
                    Text(e.title).font(BRFont.body(16, .semibold)).foregroundColor(text)
                    Text("\(StationTime.range(e.startAt, e.endAt))\(e.place.isEmpty ? "" : " · \(e.place)")").font(BRFont.body(14, .regular)).foregroundColor(sub)
                    if !e.details.isEmpty { Text(e.details).font(BRFont.body(14, .regular)).foregroundColor(sub) }
                }
                .padding(14).frame(maxWidth: .infinity, alignment: .leading).brCard()
            }
        }
    }

    // MARK: Info

    private var info: some View {
        VStack(alignment: .leading, spacing: 8) {
            BRSectionHeader(title: "Info")
            ForEach([MembersText.infoRules, MembersText.infoClean, MembersText.infoQuiet, MembersText.infoContacts], id: \.self) {
                Text($0).font(BRFont.body(16, .regular)).foregroundColor(text)
            }
        }
    }

    // MARK: E-board

    private var eboard: some View {
        VStack(alignment: .leading, spacing: 10) {
            BRSectionHeader(title: "E-board")
            NavigationLink { StrikesView() } label: { rowLabel("Strikes", systemImage: "exclamationmark.triangle") }.buttonStyle(.plain)
            NavigationLink { StudioListView() } label: { rowLabel("Studio and guest list", systemImage: "list.bullet.rectangle") }.buttonStyle(.plain)
        }
    }

    private func rowLabel(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage).font(.system(size: 18)).foregroundColor(accent).frame(width: 28)
            Text(title).font(BRFont.body(18, .semibold)).foregroundColor(text)
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundColor(sub)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
    }
}
