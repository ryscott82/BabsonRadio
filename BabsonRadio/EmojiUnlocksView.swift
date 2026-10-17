import SwiftUI

nonisolated struct EmojiUnlockItem: Decodable, Identifiable {
    let emoji: String; let name: String; let how: String
    let mystery: Bool; let unlocked: Bool
    let progress: Int?; let goal: Int?
    var id: String { emoji }
}
nonisolated struct EmojiUnlockList: Decodable { let items: [EmojiUnlockItem]; let unlocked: Int; let total: Int }

/// Every reaction emoji, which ones you have, and how to get the rest. Secret ones stay a mystery until earned.
struct EmojiUnlocksView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var list: EmojiUnlockList?
    @State private var failed = false

    private var text: Color { scheme == .dark ? .brDkText : .brLtText }
    private var sub: Color { scheme == .dark ? .brDkSub : .brLtSub }
    private var accent: Color { scheme == .dark ? .brGold : .brGreen }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let list {
                    Text("\(list.unlocked) of \(list.total) unlocked")
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(sub)
                    Text("Your five most used show on the main screen. Pull up the drawer to see all of yours.")
                        .font(.system(size: 13)).foregroundColor(sub)
                    ForEach(list.items) { item in row(item) }
                } else if failed {
                    Text("Could not load. Pull down to try again.").font(.system(size: 14)).foregroundColor(sub)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(20)
        }
        .background(scheme == .dark ? Color.brDkBg : Color.brLtBg)
        .navigationTitle("Reaction emojis")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do { list = try await BackendAPI.get("/api/emojis"); failed = false } catch { failed = list == nil }
    }

    @ViewBuilder private func row(_ item: EmojiUnlockItem) -> some View {
        HStack(spacing: 14) {
            ZStack {
                if item.mystery && !item.unlocked {
                    Text("?").font(.system(size: 26, weight: .bold)).foregroundColor(sub)
                } else {
                    ReactionGlyph(emoji: item.emoji, size: 30)
                        .opacity(item.unlocked ? 1 : 0.35)
                        .grayscale(item.unlocked ? 0 : 1)
                }
            }
            .frame(width: 44)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(item.name).font(.system(size: 16, weight: .semibold)).foregroundColor(text)
                    if item.unlocked { Image(systemName: "checkmark.circle.fill").font(.system(size: 13)).foregroundColor(accent) }
                    else { Image(systemName: "lock.fill").font(.system(size: 11)).foregroundColor(sub) }
                }
                Text(item.how).font(.system(size: 13)).foregroundColor(sub).fixedSize(horizontal: false, vertical: true)
                if let p = item.progress, let g = item.goal, !item.unlocked {
                    ProgressView(value: Double(min(p, g)), total: Double(g)).tint(accent).padding(.top, 2)
                    Text("\(min(p, g)) of \(g)").font(.system(size: 11)).foregroundColor(sub)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brCard()
    }
}
