import SwiftUI

// MARK: - Who is coming (studio bookings and Host a show)
// A people field with type-ahead from /api/people/suggest (debounced, 2+ letters). Suggestions show a name and a MASKED email; the server
// finds the real email again from the id when the booking or request is saved. Typed "name email" also works. Chips for each guest.
// "Just me" turns the list off. The same rules as the website's lib/guestPicker.ts.

struct GuestChip: Identifiable, Hashable {
    let id: String              // "id:<suggestion id>" or "e:<email>"
    let name: String
    let pickId: String?         // set when picked from the suggestions
    let email: String?          // set only for typed people (the person typed it themselves)
    let masked: String
    let outside: Bool

    /// Under a chip. Never a whole email.
    var label: String { masked + (outside ? " · outside email" : "") }
}

nonisolated struct GuestSuggestion: Decodable, Identifiable, Hashable { let id: String; let name: String; let emailMasked: String; let kind: String }
nonisolated private struct GuestSuggestReply: Decodable { let results: [GuestSuggestion] }

enum GuestLogic {
    static func isOutside(_ email: String) -> Bool { !AuthManager.schoolDomains.contains { email.lowercased().hasSuffix($0) } }

    static func mask(_ email: String) -> String {
        let parts = email.lowercased().split(separator: "@", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
        let user = parts.first ?? ""
        let domain = parts.count > 1 ? parts[1] : ""
        let dot = domain.lastIndex(of: ".")
        let host = dot.map { String(domain[..<$0]) } ?? domain
        let tld = dot.map { String(domain[$0...]) } ?? ""
        return "\(user.prefix(1))***@\(host.prefix(1))***\(tld)"
    }

    static func spotsLeft(_ chips: [GuestChip], capacity: Int) -> Int { max(0, capacity - 1 - chips.count) }

    static func capacityLine(_ chips: [GuestChip], capacity: Int) -> String {
        let left = spotsLeft(chips, capacity: capacity)
        if left == 0 { return "The studio is full at \(capacity) people, counting you." }
        return "\(left) more \(left == 1 ? "person fits" : "people fit") (\(capacity) in the studio, counting you)."
    }

    /// "sam@x.edu", "Sam Lee sam@x.edu", "Sam Lee <sam@x.edu>" or "Sam Lee, sam@x.edu". A name alone is not enough.
    static func parseTyped(_ text: String) -> (chip: GuestChip?, error: String?) {
        let raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return (nil, nil) }
        let pattern = "[A-Za-z0-9._%+\\-]+@[A-Za-z0-9\\-]+(\\.[A-Za-z0-9\\-]+)+"
        guard let range = raw.range(of: pattern, options: .regularExpression) else {
            return (nil, "Pick a name from the list, or type a name and an email, like Sam Lee sam@babson.edu.")
        }
        let email = String(raw[range]).lowercased()
        guard email.count <= 120 else { return (nil, "That email does not look right.") }
        var name = raw.replacingCharacters(in: range, with: " ")
        for c in ["<", ">", ",", ";"] { name = name.replacingOccurrences(of: c, with: " ") }
        name = name.split(separator: " ").joined(separator: " ")
        if name.isEmpty {
            name = (email.split(separator: "@").first.map(String.init) ?? email)
                .replacingOccurrences(of: ".", with: " ").replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ").capitalized
        }
        let chip = GuestChip(id: "e:\(email)", name: String(name.prefix(60)), pickId: nil, email: email, masked: mask(email), outside: isOutside(email))
        return (chip, nil)
    }

    static func chip(from s: GuestSuggestion) -> GuestChip {
        GuestChip(id: "id:\(s.id)", name: String(s.name.prefix(60)), pickId: s.id, email: nil, masked: s.emailMasked, outside: false)
    }

    /// What the server wants: picked people by id, typed people by name and email.
    static func payload(_ chips: [GuestChip]) -> [[String: Any]] {
        chips.map { c in
            if let id = c.pickId { return ["id": id, "name": c.name, "email": ""] }
            return ["name": c.name, "email": c.email ?? ""]
        }
    }

    /// Needed unless "Just me" is on. Returns the sentence to show, or "".
    static func problem(_ chips: [GuestChip], justMe: Bool) -> String {
        if justMe && !chips.isEmpty { return "Choose \"Just me\" or list who is coming, not both." }
        if !justMe && chips.isEmpty { return "Add who is coming with you, or turn on \"Just me\"." }
        return ""
    }
}

struct GuestPicker: View {
    @Binding var chips: [GuestChip]
    @Binding var justMe: Bool
    let capacity: Int

    @Environment(\.colorScheme) private var scheme
    @State private var query = ""
    @State private var suggestions: [GuestSuggestion] = []
    @State private var note = ""
    @FocusState private var focused: Bool

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Who is coming?").font(BRFont.body(16, .semibold)).foregroundColor(text)

            Toggle(isOn: $justMe) { Text("Just me").font(BRFont.body(16, .regular)).foregroundColor(text) }
                .onChange(of: justMe) { _, on in if on { chips = []; suggestions = []; query = "" } }

            if !justMe {
                if !chips.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(chips) { c in
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.name).font(BRFont.body(16, .semibold)).foregroundColor(text)
                                    Text(c.label).font(BRFont.body(14, .regular)).foregroundColor(c.outside ? .brGold : sub)
                                }
                                Spacer(minLength: 0)
                                Button { chips.removeAll { $0.id == c.id } } label: {
                                    Image(systemName: "xmark.circle.fill").font(.system(size: 22)).foregroundColor(sub)
                                        .frame(width: 44, height: 44).contentShape(Rectangle())
                                }
                                .accessibilityLabel("Remove \(c.name)")
                            }
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }

                if GuestLogic.spotsLeft(chips, capacity: capacity) > 0 {
                    HStack {
                        TextField("", text: $query, prompt: Text("Type a name or email").foregroundColor(.brPlaceholder))
                            .textInputAutocapitalization(.words).autocorrectionDisabled()
                            .submitLabel(.done).focused($focused)
                            .onSubmit { addTyped() }
                            .font(BRFont.body(16, .regular))
                        if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                            Button("Add") { addTyped() }.font(BRFont.body(16, .semibold)).frame(minHeight: 44)
                        }
                    }
                    .padding(12).background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 10))

                    if !suggestions.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(suggestions) { s in
                                Button { pick(s) } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(s.name).font(BRFont.body(16, .semibold)).foregroundColor(text)
                                        Text(s.emailMasked).font(BRFont.body(14, .regular)).foregroundColor(sub)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8).padding(.horizontal, 12)
                                    .frame(minHeight: 44).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .background(HWFieldFill()).clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }

                if !note.isEmpty { Text(note).font(BRFont.body(14, .regular)).foregroundColor(.brRed) }
                Text(GuestLogic.capacityLine(chips, capacity: capacity)).font(BRFont.body(14, .regular)).foregroundColor(sub)
                Text("Names and emails go to the E-board list for the studio. Guests are not emailed.")
                    .font(BRFont.body(14, .regular)).foregroundColor(sub)
            }
        }
        // Debounced type-ahead: waits for a pause in typing, then asks once. Cancelled automatically when the text changes again.
        .task(id: query) {
            let q = query.trimmingCharacters(in: .whitespaces)
            note = ""
            guard q.count >= 2, !q.contains("@") else { suggestions = []; return }
            try? await Task.sleep(for: .milliseconds(300))
            if Task.isCancelled { return }
            let encoded = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
            if let r: GuestSuggestReply = try? await BackendAPI.get("/api/people/suggest?q=\(encoded)") {
                suggestions = r.results.filter { s in !chips.contains { $0.id == "id:\(s.id)" } }
            }
        }
    }

    private func pick(_ s: GuestSuggestion) { add(GuestLogic.chip(from: s)) }

    private func addTyped() {
        let r = GuestLogic.parseTyped(query)
        if let e = r.error { note = e; return }
        if let c = r.chip { add(c) }
    }

    private func add(_ chip: GuestChip) {
        if chips.contains(where: { $0.id == chip.id }) { query = ""; suggestions = []; return }
        if GuestLogic.spotsLeft(chips, capacity: capacity) <= 0 { note = "The studio is full at \(capacity) people, counting you."; return }
        chips.append(chip); query = ""; suggestions = []; note = ""
    }
}

// MARK: - Policy box

/// The tick on every request and booking screen. Wording from the studio policy.
struct PolicyBox: View {
    @Binding var agreed: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Button { agreed.toggle() } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: agreed ? "checkmark.square.fill" : "square").font(.system(size: 24))
                    .foregroundColor(agreed ? (scheme == .dark ? .brGold : .brGreen) : (scheme == .dark ? .brDkSub : .brLtSub))
                Text(MembersText.policy).font(BRFont.body(16, .regular)).multilineTextAlignment(.leading)
                    .foregroundColor(scheme == .dark ? .brDkText : .brLtText)
            }
            .frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(agreed ? .isSelected : [])
    }
}
