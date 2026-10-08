import Foundation

// MARK: - Schedule

struct ScheduleItem: Identifiable {
    let id = UUID()
    let time: String
    let showName: String
    let host: String
    var isLive: Bool = false
}

enum ShowCategory: String, CaseIterable {
    case music       = "Music"
    case interview   = "Interview"
    case podcast     = "Podcast"
    case talk        = "Talk"
    case news        = "News"
}
