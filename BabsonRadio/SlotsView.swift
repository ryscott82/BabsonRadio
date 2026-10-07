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

    private var textColor: Color { scheme == .dark ? .brDkText : .brLtText }
    private var subColor: Color { scheme == .dark ? .brDkSub : .brLtSub }

    private var days: [(day: Date, items: [ScheduleEntry])] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: slots.feed) { cal.startOfDay(for: $0.startAt) }
        return groups.keys.sorted().map { ($0, groups[$0]!.sorted { $0.startAt < $1.startAt }) }
    }

    private func dayTitle(_ d: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "TODAY" }
        if cal.isDateInTomorrow(d) { return "TOMORROW" }
        return d.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()).uppercased()
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    if days.isEmpty {
                        Text(slots.isLoading ? "Loading…" : "Nothing is scheduled yet.")
                            .font(.system(size: 13)).foregroundColor(subColor).padding(.horizontal, 20)
                    }
                    ForEach(days, id: \.day) { group in
                        VStack(alignment: .leading, spacing: 12) {
                            BRSectionHeader(title: dayTitle(group.day)).padding(.horizontal, 20)
                            ForEach(group.items) { entry in
                                Button { selected = entry } label: { ScheduleEntryRow(entry: entry) }
                                    .buttonStyle(.plain)
                                    .padding(.horizontal, 20)
                            }
                        }
                    }
                }
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
            .refreshable { await slots.loadFeed() }
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
        .sheet(item: $selected) { ScheduleDetailView(entry: $0) }
        .task(id: auth.currentUser?.id) { await slots.loadFeed() }
    }
}

private struct ScheduleEntryRow: View {
    let entry: ScheduleEntry
    @Environment(\.colorScheme) var scheme

    private var onNow: Bool { entry.startAt <= Date() && entry.endAt > Date() }

    var body: some View {
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
