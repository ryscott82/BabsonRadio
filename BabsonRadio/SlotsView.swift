import SwiftUI

// MARK: - "Go on air" (reached from Profile)
// Members request a time on the radio; staff approve in the web admin. This screen shows
// the user's requests, what's already booked, and a form to ask for a new slot.

struct SlotsView: View {
    @StateObject private var auth = AuthManager.shared
    @StateObject private var slots = SlotsManager()
    @Environment(\.colorScheme) var scheme
    @State private var showForm = false
    /// True when pushed from Profile (the Profile tab already provides the navigation stack).
    var embedded = false

    private var textColor: Color { scheme == .dark ? .brDkText : .brLtText }
    private var subColor: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    var body: some View {
        Group {
            if embedded {
                scroll
                    .navigationTitle("Go on air")
                    .navigationBarTitleDisplayMode(.inline)
            } else {
                NavigationStack { scroll }
            }
        }
        .sheet(isPresented: $showForm) {
            RequestSlotForm(slots: slots)
        }
        .task(id: auth.currentUser?.id) {
            if auth.isSignedIn { await slots.refresh() }
        }
    }

    private var scroll: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                if auth.currentUser?.isGuest == true {
                    GuestLockedNote(text: "Requesting air time is for Babson students. Ask a student to feature your show.")
                } else if auth.isSignedIn {
                    signedInContent
                } else {
                    signedOutPrompt
                }
            }
        }
        .refreshable {
            if auth.isSignedIn { await slots.refresh() }
        }
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
    }

    // MARK: - Signed in

    private var signedInContent: some View {
        VStack(alignment: .leading, spacing: 28) {

            VStack(alignment: .leading, spacing: 10) {
                Text("GO ON AIR")
                    .font(BRFont.display(34))
                    .kerning(3)
                    .foregroundColor(textColor)
                Text("Have a podcast, a mix or a show idea? Request a time on the radio. Staff review every request, and you'll see the answer here.")
                    .font(.system(size: 14))
                    .foregroundColor(subColor)

                Button { showForm = true } label: {
                    HStack(spacing: 8) {
                        Spacer()
                        Image(systemName: "mic.fill")
                        Text("REQUEST A SLOT")
                            .font(BRFont.display(15))
                            .kerning(2)
                        Spacer()
                    }
                    .padding(.vertical, 14)
                    .background(accent)
                    .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .padding(.top, 6)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            if let error = slots.errorMessage {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundColor(.brRed)
                    .padding(.horizontal, 20)
            }

            VStack(alignment: .leading, spacing: 14) {
                BRSectionHeader(title: "MY REQUESTS")
                    .padding(.horizontal, 20)
                if slots.myRequests.isEmpty {
                    emptyText(slots.isLoading ? "Loading…" : "You haven't requested a slot yet.")
                } else {
                    ForEach(slots.myRequests) { request in
                        SlotRequestRow(request: request) {
                            Task { await slots.cancel(request.id) }
                        }
                        .padding(.horizontal, 20)
                    }
                }
            }
        }
        .padding(.bottom, 40)
    }

    // MARK: - Signed out

    private var signedOutPrompt: some View {
        VStack(spacing: 14) {
            Image(systemName: "mic.slash")
                .font(.system(size: 34))
                .foregroundColor(subColor)
            Text("SIGN IN TO REQUEST A SLOT")
                .font(BRFont.display(22))
                .kerning(2)
                .foregroundColor(textColor)
            Text("Sign in with your Babson email from the Profile tab to request airtime.")
                .font(.system(size: 14))
                .foregroundColor(subColor)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 32)
        .padding(.top, 120)
        .frame(maxWidth: .infinity)
    }

    private func emptyText(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundColor(subColor)
            .padding(.horizontal, 20)
    }
}

// MARK: - Rows

private struct SlotRequestRow: View {
    let request: SlotRequest
    let onCancel: () -> Void
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
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(textColor)
                Spacer()
                Text(statusLabel)
                    .font(BRFont.display(11))
                    .kerning(1.5)
                    .foregroundColor(statusColor)
            }

            Text("\(request.startAt.formatted(date: .abbreviated, time: .shortened)) · \(request.durationMin) min · \(request.type == "live" ? "Live" : "Pre-recorded")")
                .font(.system(size: 13))
                .foregroundColor(subColor)

            if !request.staffNote.isEmpty {
                Text("Staff note: \(request.staffNote)")
                    .font(.system(size: 13))
                    .foregroundColor(textColor)
            }

            if request.status == "approved" && !request.connectionInfo.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(request.type == "live" ? "HOW TO GO LIVE" : "DETAILS")
                        .font(BRFont.display(10))
                        .kerning(2)
                        .foregroundColor(scheme == .dark ? .brDkMuted : .brLtMuted)
                    Text(request.connectionInfo)
                        .font(.system(size: 13))
                        .foregroundColor(textColor)
                        .textSelection(.enabled)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            if canCancel {
                Button("Cancel request", role: .destructive, action: onCancel)
                    .font(.system(size: 13))
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
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text("On the radio")
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(block.startAt.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
                    .font(.system(size: 12, weight: .medium))
                Text("\(block.startAt.formatted(date: .omitted, time: .shortened)) – \(block.endAt.formatted(date: .omitted, time: .shortened))")
                    .font(.system(size: 12))
            }
            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
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
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                Text("with \(slot.hostName) · \(slot.type == "live" ? "Live" : "Pre-recorded")")
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(slot.startAt.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
                    .font(.system(size: 12, weight: .medium))
                Text("\(slot.startAt.formatted(date: .omitted, time: .shortened)) – \(slot.endAt.formatted(date: .omitted, time: .shortened))")
                    .font(.system(size: 12))
            }
            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
        }
        .padding(14)
        .brCard()
    }
}

// MARK: - Request form

struct RequestSlotForm: View {
    @ObservedObject var slots: SlotsManager
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var details = ""
    @State private var type = "live"
    @State private var category = "podcast"
    @State private var start = RequestSlotForm.roundUp(Date().addingTimeInterval(25 * 3600))
    @State private var durationMin = 60
    @State private var audioURL = ""
    @State private var isSubmitting = false
    @State private var errorText: String? = nil

    private static let categories = ["podcast", "music", "talk", "interview", "news", "other"]
    private static let lengths = [15, 30, 45, 60, 90, 120, 180, 240]

    /// The server only accepts start times on a 15-minute mark.
    static func roundUp(_ date: Date) -> Date {
        let step = 900.0
        return Date(timeIntervalSince1970: (date.timeIntervalSince1970 / step).rounded(.up) * step)
    }

    private var snappedStart: Date { Self.roundUp(start) }
    private var snappedEnd: Date { snappedStart.addingTimeInterval(Double(durationMin) * 60) }
    private var earliest: Date { Date().addingTimeInterval(24 * 3600) }
    private var latest: Date { Date().addingTimeInterval(60 * 86_400) }
    private var tooSoon: Bool { snappedStart < earliest }
    private var conflict: AirSlot? {
        slots.schedule.first { $0.startAt < snappedEnd && $0.endAt > snappedStart }
    }
    private var canSubmit: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && conflict == nil && !tooSoon && !isSubmitting
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("About your show") {
                    TextField("Title", text: $title)
                    TextField("What's it about? (optional)", text: $details, axis: .vertical)
                        .lineLimit(3...6)
                    Picker("Category", selection: $category) {
                        ForEach(Self.categories, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                }

                Section("How will it air?") {
                    Picker("Format", selection: $type) {
                        Text("Live").tag("live")
                        Text("Pre-recorded").tag("prerecorded")
                    }
                    .pickerStyle(.segmented)

                    if type == "prerecorded" {
                        TextField("Link to your audio (https://…)", text: $audioURL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Text("Share a link (Drive, Dropbox, etc.). Staff will schedule it for your slot.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("If approved, staff will send you what you need to connect your broadcast software at your start time.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("When") {
                    DatePicker("Start", selection: $start, in: earliest...latest,
                               displayedComponents: [.date, .hourAndMinute])
                    Picker("Length", selection: $durationMin) {
                        ForEach(Self.lengths, id: \.self) { Text("\($0) min").tag($0) }
                    }
                    Text("\(snappedStart.formatted(date: .abbreviated, time: .shortened)) – \(snappedEnd.formatted(date: .omitted, time: .shortened))")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let conflict {
                        Text("That overlaps \"\(conflict.title)\", which is already booked.")
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                    if tooSoon {
                        Text("Requests need at least 24 hours' notice.")
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                if let errorText {
                    Section { Text(errorText).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Request a slot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "Sending…" : "Send") { submit() }
                        .disabled(!canSubmit)
                }
            }
        }
    }

    private func submit() {
        isSubmitting = true
        errorText = nil
        Task {
            do {
                try await slots.submit(
                    title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                    details: details.trimmingCharacters(in: .whitespacesAndNewlines),
                    type: type,
                    category: category,
                    start: snappedStart,
                    durationMin: durationMin,
                    audioURL: type == "prerecorded" ? audioURL.trimmingCharacters(in: .whitespaces) : ""
                )
                dismiss()
            } catch {
                errorText = (error as? BackendError)?.message ?? error.localizedDescription
            }
            isSubmitting = false
        }
    }
}


// MARK: - Schedule tab
// What's on the radio: today's lineup, then every approved slot coming up.

struct ScheduleView: View {
    @StateObject private var auth = AuthManager.shared
    @StateObject private var slots = SlotsManager()
    @Environment(\.colorScheme) var scheme

    private var textColor: Color { scheme == .dark ? .brDkText : .brLtText }
    private var subColor: Color { scheme == .dark ? .brDkSub : .brLtSub }

    private struct Entry: Identifiable {
        enum Kind { case slot(AirSlot), auto(AutoBlock) }
        let id: String; let start: Date; let kind: Kind
    }
    /// Student shows and auto-scheduled filler, in time order.
    private var timeline: [Entry] {
        (slots.schedule.map { Entry(id: "s" + $0.id, start: $0.startAt, kind: .slot($0)) }
         + slots.autoBlocks.map { Entry(id: "a" + $0.id, start: $0.startAt, kind: .auto($0)) })
            .sorted { $0.start < $1.start }
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(spacing: 0) {
                        BRSectionHeader(title: "TODAY'S SCHEDULE")
                            .padding(.horizontal, 20)
                            .padding(.bottom, 16)
                        VStack(spacing: 1) {
                            ForEach(ScheduleItem.sampleSchedule) { ScheduleRow(item: $0) }
                        }
                        .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14)
                            .stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1))
                        .padding(.horizontal, 20)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        BRSectionHeader(title: "UPCOMING ON AIR")
                            .padding(.horizontal, 20)
                        if auth.currentUser?.isGuest == true || !auth.isSignedIn {
                            Text("Sign in with your Babson email to see student shows that are booked.")
                                .font(.system(size: 13)).foregroundColor(subColor).padding(.horizontal, 20)
                        }
                        if slots.schedule.isEmpty && slots.autoBlocks.isEmpty {
                            Text(slots.isLoading ? "Loading…" : "Nothing is scheduled yet.")
                                .font(.system(size: 13)).foregroundColor(subColor).padding(.horizontal, 20)
                        }
                        ForEach(timeline) { entry in
                            switch entry.kind {
                            case .slot(let slot): AirSlotRow(slot: slot).padding(.horizontal, 20)
                            case .auto(let block): AutoBlockRow(block: block).padding(.horizontal, 20)
                            }
                        }
                    }
                }
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
            .refreshable { await slots.loadAuto(); if auth.isSignedIn { await slots.refresh() } }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 0) {
                        Text("BABSON ").font(BRFont.display(18))
                            .foregroundColor(scheme == .dark ? .brGold : .brGreen).kerning(3)
                        Text("RADIO").font(BRFont.display(18)).foregroundColor(textColor).kerning(3)
                    }
                }
            }
        }
        .task(id: auth.currentUser?.id) {
            await slots.loadAuto()
            let member = auth.isSignedIn && auth.currentUser?.isGuest != true
            if member { await slots.refresh() }
        }
    }
}
