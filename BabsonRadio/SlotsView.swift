import SwiftUI
import PhotosUI
import UIKit

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
    @State private var photoItem: PhotosPickerItem?
    @State private var photoPreview: UIImage?
    @State private var uploaded: UploadedImage?
    @State private var isUploading = false
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
            && conflict == nil && !tooSoon && !isSubmitting && !isUploading
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

                Section("Picture (optional)") {
                    HStack(spacing: 14) {
                        if let photoPreview {
                            Image(uiImage: photoPreview).resizable().scaledToFill()
                                .frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        PhotosPicker(selection: $photoItem, matching: .images) {
                            Text(isUploading ? "Uploading…" : (photoPreview == nil ? "Add a picture" : "Change picture"))
                        }
                        .disabled(isUploading)
                        if photoPreview != nil {
                            Button("Remove", role: .destructive) { photoItem = nil; photoPreview = nil; uploaded = nil }
                        }
                    }
                    Text("Shown to listeners only if your request is approved.")
                        .font(.footnote).foregroundStyle(.secondary)
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
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task { await upload(item) }
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

    private func upload(_ item: PhotosPickerItem) async {
        isUploading = true
        errorText = nil
        defer { isUploading = false }
        do {
            guard let raw = try await item.loadTransferable(type: Data.self),
                  let jpeg = ImageShrinker.jpeg(from: raw) else {
                errorText = "That picture couldn't be used. Try another one. (BR-CLI-004)"
                return
            }
            uploaded = try await BackendAPI.uploadImage(jpeg)
            photoPreview = UIImage(data: jpeg)
        } catch {
            errorText = (error as? BackendError)?.message ?? error.localizedDescription
            photoItem = nil
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
                    audioURL: type == "prerecorded" ? audioURL.trimmingCharacters(in: .whitespaces) : "",
                    image: uploaded
                )
                dismiss()
            } catch {
                errorText = (error as? BackendError)?.message ?? error.localizedDescription
            }
            isSubmitting = false
        }
    }
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
                .font(BRFont.display(28)).foregroundColor(.brGold)
        }
    }
}

/// The item's picture, or generated artwork.
struct ScheduleArt: View {
    let entry: ScheduleEntry
    var body: some View {
        if let url = URL(string: entry.imageUrl), !entry.imageUrl.isEmpty {
            AsyncImage(url: url) { phase in
                if let image = phase.image { image.resizable().scaledToFill() } else { GenreArt(title: entry.title) }
            }
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
    private var canBack: Bool { first > today }
    private var canForward: Bool {
        guard let end = cal.date(byAdding: .day, value: daysShown, to: first),
              let limit = cal.date(byAdding: .day, value: daysLoaded, to: today) else { return false }
        return end < limit
    }

    private func move(_ days: Int) {
        if let d = cal.date(byAdding: .day, value: days, to: first) { first = max(d, today) }
    }

    private var rangeText: String {
        guard let a = shown.first, let b = shown.last else { return "" }
        return "\(a.formatted(.dateTime.month(.abbreviated).day())) – \(b.formatted(.dateTime.month(.abbreviated).day()))".uppercased()
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                controls
                dayHeader
                Divider().overlay(lineColor)
                ScrollViewReader { proxy in
                    ScrollView(showsIndicators: false) {
                        if slots.feed.isEmpty {
                            Text(slots.isLoading ? "Loading…" : "Nothing is scheduled yet.")
                                .font(.system(size: 13)).foregroundColor(subColor).padding(20)
                        } else {
                            grid
                        }
                    }
                    .refreshable { await slots.loadFeed() }
                    .onAppear { scrollToNow(proxy) }
                    .onChange(of: first) { _, _ in scrollToNow(proxy) }
                    .onChange(of: slots.feed.count) { _, _ in scrollToNow(proxy) }
                }
            }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
            .navigationTitle("")
            .profileButton()
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
        .sheet(item: $selected) { ScheduleDetailView(entry: $0) }
        .alert("Reminders", isPresented: Binding(get: { reminders.notice != nil }, set: { if !$0 { reminders.notice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(reminders.notice ?? "") }
        .task(id: auth.currentUser?.id) { await slots.loadFeed() }
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
                .font(.system(size: 13, weight: .semibold))
                .disabled(first == today)
            Spacer()
            Text(rangeText).font(BRFont.display(13)).kerning(2)
                .foregroundColor(scheme == .dark ? .brGold : .brGreen)
        }
        .font(.system(size: 15, weight: .semibold))
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
                        .font(.system(size: 13, weight: .medium)).foregroundColor(textColor)
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
                        .font(.system(size: 10)).foregroundColor(subColor)
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
                    CalendarBlock(entry: e, height: height, onOpen: { selected = e })
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
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if height >= 44 {
                    Text(entry.startAt.formatted(date: .omitted, time: .shortened))
                        .font(.system(size: 9))
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
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                    .lineLimit(1)
                Text((entry.hosts.isEmpty ? "" : "with \(entry.hosts.joined(separator: ", ")) · ") + entry.formatLabel)
                    .font(.system(size: 12))
                    .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                if onNow {
                    Text("ON NOW").font(BRFont.display(10)).kerning(1.5).foregroundColor(.brRed)
                }
                Text("\(entry.startAt.formatted(date: .omitted, time: .shortened)) – \(entry.endAt.formatted(date: .omitted, time: .shortened))")
                    .font(.system(size: 12))
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
                                .font(.system(size: 15))
                                .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        }
                        Text("\(entry.startAt.formatted(.dateTime.weekday(.wide).month(.wide).day()))\n\(entry.startAt.formatted(date: .omitted, time: .shortened)) – \(entry.endAt.formatted(date: .omitted, time: .shortened))")
                            .font(.system(size: 14))
                            .foregroundColor(scheme == .dark ? .brDkSub : .brLtSub)
                        DetailBellRow(entry: entry)
                        if !entry.description.isEmpty {
                            Text(entry.description)
                                .font(.system(size: 15))
                                .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 30)
                }
            }
            .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
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
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundColor(on ? .brGold : (scheme == .dark ? .brDkText : .brLtText))
            .padding(.vertical, 10).padding(.horizontal, 16)
            .brCard()
        }
        .buttonStyle(.plain)
    }
}
