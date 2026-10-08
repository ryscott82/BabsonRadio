import Foundation

// MARK: - Schedule

struct ScheduleItem: Identifiable {
    let id = UUID()
    let time: String
    let showName: String
    let host: String
    var isLive: Bool = false
}

// MARK: - Show

struct RadioShow: Identifiable {
    let id = UUID()
    let name: String
    let description: String
    let category: ShowCategory
    var episodes: [Episode] = []
}

enum ShowCategory: String, CaseIterable {
    case music       = "Music"
    case interview   = "Interview"
    case podcast     = "Podcast"
    case talk        = "Talk"
    case news        = "News"
}

// MARK: - Episode

struct Episode: Identifiable {
    let id = UUID()
    let title: String
    let showName: String
    let category: ShowCategory
    let duration: String       // e.g. "38 min"
    let dateLabel: String      // e.g. "2 days ago"
    let episodeNumber: Int?
    var youtubeID: String?     // YouTube video ID for video episodes
    var audioURL: String?      // Direct audio URL for audio-only episodes
    var isNew: Bool = false
    var thumbnailColor: ThumbnailColor = .green
}

enum ThumbnailColor: CaseIterable {
    case green, dark, warm
}

// MARK: - Sample Data

extension Episode {
    static let sampleEpisodes: [Episode] = [
        Episode(
            title: "Founders Who Failed First",
            showName: "The Pitch Room",
            category: .podcast,
            duration: "38 min",
            dateLabel: "2 days ago",
            episodeNumber: 12,
            isNew: true,
            thumbnailColor: .green
        ),
        Episode(
            title: "Inside Babson's New E-Lab",
            showName: "Campus Voice",
            category: .interview,
            duration: "24 min",
            dateLabel: "Yesterday",
            episodeNumber: nil,
            thumbnailColor: .dark
        ),
        Episode(
            title: "Underground Hip-Hop Mix Vol. 3",
            showName: "Late Night Sets",
            category: .music,
            duration: "60 min",
            dateLabel: "3 days ago",
            episodeNumber: nil,
            thumbnailColor: .warm
        ),
        Episode(
            title: "How We Raised $500k Before Graduation",
            showName: "The Startup Desk",
            category: .podcast,
            duration: "44 min",
            dateLabel: "1 week ago",
            episodeNumber: 8,
            thumbnailColor: .green
        ),
    ]
}
