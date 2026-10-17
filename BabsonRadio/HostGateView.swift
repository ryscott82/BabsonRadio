import SwiftUI
import Combine

// MARK: - Host gate
// Everything a new host does before booking a show: in-person training, check-in, a 10-question quiz,
// then the four host agreements. Shows `content` (the booking screen) once they are certified and signed.
// The questions and the agreement text come from the server, so the website and the app always match.

nonisolated struct TrainingQuestion: Decodable, Identifiable {
    let id: String
    let q: String
    let options: [String]
}

nonisolated struct HostAgreement: Decodable, Identifiable {
    let id: String
    let title: String
    let intro: String?
    let clauses: [String]
}

nonisolated struct TrainingInfo: Decodable {
    let trained: Bool
    let staff: Bool
    let requested: Bool
    let passPercent: Int
    let checkIn: String            // none | pending | approved
    let conductSigned: Bool
    let questions: [TrainingQuestion]
    let agreements: [HostAgreement]
    let agreementsVersion: String
}

nonisolated struct QuizWrong: Decodable, Identifiable { let id: String; let why: String }
nonisolated struct QuizResult: Decodable {
    let passed: Bool
    let percent: Int
    let passPercent: Int
    let wrong: [QuizWrong]
}

@MainActor
final class HostGateModel: ObservableObject {
    @Published var info: TrainingInfo?
    @Published var error: String?
    @Published var busy = false

    func load() async {
        do { info = try await BackendAPI.get("/api/training"); error = nil }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
    }

    func run(_ work: @escaping () async throws -> Void) async {
        busy = true; error = nil
        do { try await work(); await load() }
        catch { self.error = (error as? BackendError)?.message ?? error.localizedDescription }
        busy = false
    }

    func requestTraining() async { await run { let _: EmptyResponse = try await BackendAPI.post("/api/training/request", [:]) } }
    func checkIn() async { await run { let _: EmptyResponse = try await BackendAPI.post("/api/training/checkin", [:]) } }
    func sign(name: String, version: String) async {
        await run { let _: EmptyResponse = try await BackendAPI.post("/api/host/readiness", ["typedName": name, "accepted": true, "version": version]) }
    }
}

struct HostGateView<Content: View>: View {
    @StateObject private var model = HostGateModel()
    @Environment(\.colorScheme) private var scheme
    @ViewBuilder var content: () -> Content

    @State private var answers: [String: Int] = [:]
    @State private var step = 0
    @State private var result: QuizResult?

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    var body: some View {
        Group {
            if let info = model.info {
                if info.trained && info.conductSigned {
                    content()
                } else if info.trained {
                    AgreementsForm(info: info, busy: model.busy, error: model.error) { name in
                        Task { await model.sign(name: name, version: info.agreementsVersion) }
                    }
                } else if info.checkIn == "approved" && !info.questions.isEmpty {
                    quiz(info)
                } else {
                    training(info)
                }
            } else if let e = model.error {
                Text(e).font(.system(size: 13)).foregroundColor(.brRed).padding(20)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
            }
        }
        .task { await model.load() }
        // While waiting for a director to confirm, check again every few seconds.
        .task(id: model.info?.checkIn) {
            guard model.info?.checkIn == "pending" else { return }
            while !Task.isCancelled && model.info?.checkIn == "pending" {
                try? await Task.sleep(for: .seconds(5))
                await model.load()
            }
        }
    }

    // MARK: Training (in person)

    private func training(_ info: TrainingInfo) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("HOST TRAINING")
                .font(BRFont.display(28)).kerning(2).foregroundColor(text)
            if info.checkIn == "pending" {
                Text("Waiting for a director to confirm you are at training. This updates on its own.")
                    .font(.system(size: 14)).foregroundColor(text)
                ProgressView().padding(.top, 4)
            } else {
                Text("Training happens in person. Then you take a short quiz and sign the host agreements.")
                    .font(.system(size: 14)).foregroundColor(text)
                if info.requested {
                    Text("Requested. A director will reach out.").font(.system(size: 13)).foregroundColor(sub)
                } else {
                    Button { Task { await model.requestTraining() } } label: {
                        Text("Schedule a training")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity).padding(.vertical, 13)
                            .foregroundColor(text)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(scheme == .dark ? Color.brDkBorder : Color.brLtBorder, lineWidth: 1))
                    }
                    .buttonStyle(.plain).disabled(model.busy)
                }
                Button { Task { await model.checkIn() } } label: {
                    Text("I'm at my training")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                        .background(accent)
                        .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain).disabled(model.busy)
            }
            if let e = model.error { Text(e).font(.system(size: 13)).foregroundColor(.brRed) }
        }
        .padding(20)
    }

    // MARK: Quiz

    private func quiz(_ info: TrainingInfo) -> some View {
        let qs = info.questions
        return VStack(alignment: .leading, spacing: 16) {
            if let r = result, !r.passed {
                failed(r, qs)
            } else if step < qs.count {
                let q = qs[step]
                Text("QUESTION \(step + 1) OF \(qs.count)")
                    .font(BRFont.display(16)).kerning(2).foregroundColor(accent)
                Text(q.q).font(.system(size: 17, weight: .semibold)).foregroundColor(text)
                VStack(spacing: 10) {
                    ForEach(Array(q.options.enumerated()), id: \.offset) { i, option in
                        Button { answers[q.id] = i } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: answers[q.id] == i ? "largecircle.fill.circle" : "circle")
                                    .foregroundColor(answers[q.id] == i ? accent : sub)
                                Text(option).font(.system(size: 15)).foregroundColor(text).multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(14).frame(maxWidth: .infinity, alignment: .leading).brCard()
                        }
                        .buttonStyle(.plain)
                    }
                }
                HStack {
                    if step > 0 { Button("Back") { step -= 1 }.foregroundColor(sub) }
                    Spacer()
                    Button { advance(qs, info) } label: {
                        Text(step == qs.count - 1 ? "Submit" : "Next")
                            .font(.system(size: 15, weight: .semibold))
                            .padding(.horizontal, 28).padding(.vertical, 12)
                            .background(accent)
                            .foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .disabled(answers[q.id] == nil || model.busy)
                    .opacity(answers[q.id] == nil ? 0.5 : 1)
                }
            }
            if let e = model.error { Text(e).font(.system(size: 13)).foregroundColor(.brRed) }
        }
        .padding(20)
    }

    private func advance(_ qs: [TrainingQuestion], _ info: TrainingInfo) {
        if step < qs.count - 1 { step += 1; return }
        Task {
            await model.run {
                let r: QuizResult = try await BackendAPI.post("/api/training", ["answers": answers])
                result = r
            }
        }
    }

    private func failed(_ r: QuizResult, _ qs: [TrainingQuestion]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("YOU GOT \(r.percent)%").font(BRFont.display(26)).kerning(2).foregroundColor(.brRed)
            Text("You need \(r.passPercent)%. Here is what to review, then try again.")
                .font(.system(size: 14)).foregroundColor(text)
            ForEach(r.wrong) { w in
                VStack(alignment: .leading, spacing: 4) {
                    Text(qs.first(where: { $0.id == w.id })?.q ?? "").font(.system(size: 13, weight: .semibold)).foregroundColor(text)
                    Text(w.why).font(.system(size: 13)).foregroundColor(sub)
                }
                .padding(14).frame(maxWidth: .infinity, alignment: .leading).brCard()
            }
            Button {
                answers = [:]; step = 0; result = nil
            } label: {
                Text("Try again").font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .background(accent).foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - The four agreements, signed once

private struct AgreementsForm: View {
    let info: TrainingInfo
    let busy: Bool
    let error: String?
    let onSign: (String) -> Void

    @Environment(\.colorScheme) private var scheme
    @State private var ticks: Set<String> = []     // "agreementId#index"
    @State private var name = ""

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    private var allTicked: Bool {
        info.agreements.allSatisfy { a in a.clauses.indices.allSatisfy { ticks.contains("\(a.id)#\($0)") } }
    }
    /// At least two words, like the server checks.
    private var nameOK: Bool { name.trimmingCharacters(in: .whitespaces).split(separator: " ").count >= 2 }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("ONE LAST STEP").font(BRFont.display(28)).kerning(2).foregroundColor(text)
            Text("Read and sign the host agreements.").font(.system(size: 14)).foregroundColor(sub)

            ForEach(info.agreements) { a in
                VStack(alignment: .leading, spacing: 10) {
                    Text(a.title).font(BRFont.display(16)).kerning(2).foregroundColor(accent)
                    if let intro = a.intro { Text(intro).font(.system(size: 12)).foregroundColor(sub) }
                    ForEach(Array(a.clauses.enumerated()), id: \.offset) { i, clause in
                        let key = "\(a.id)#\(i)"
                        Button {
                            if ticks.contains(key) { ticks.remove(key) } else { ticks.insert(key) }
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: ticks.contains(key) ? "checkmark.square.fill" : "square")
                                    .foregroundColor(ticks.contains(key) ? accent : sub)
                                Text(clause).font(.system(size: 13)).foregroundColor(text).multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16).frame(maxWidth: .infinity, alignment: .leading).brCard()
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("SIGN BY TYPING YOUR FULL NAME").font(.system(size: 12, weight: .semibold)).foregroundColor(sub)
                TextField("First Last", text: $name)
                    .textInputAutocapitalization(.words).autocorrectionDisabled()
                    .font(.system(size: 16)).foregroundColor(text)
                    .padding(12)
                    .background(scheme == .dark ? Color.brDkSurface : Color.brLtSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            if let error { Text(error).font(.system(size: 13)).foregroundColor(.brRed) }

            Button { onSign(name.trimmingCharacters(in: .whitespaces)) } label: {
                Text(busy ? "One moment…" : "Sign")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .background(accent).foregroundColor(scheme == .dark ? Color.brDkBg : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(!(allTicked && nameOK) || busy)
            .opacity(allTicked && nameOK ? 1 : 0.5)
        }
        .padding(20)
    }
}
