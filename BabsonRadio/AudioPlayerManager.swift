import AVFoundation
import MediaPlayer
import Combine
#if canImport(UIKit)
import UIKit
#endif

/// What is on air, from the website's /api/nowplaying (which reads AzuraCast).
nonisolated struct NowPlayingInfo: Decodable, Equatable {
    struct Next: Decodable, Equatable { let title: String; let artist: String }
    let configured: Bool
    var title: String
    var artist: String
    let album: String
    let art: String
    var elapsed: Double
    var duration: Double
    let isLive: Bool
    let streamer: String
    let listeners: Int
    var next: Next?
    /// Scheduled show/event on air now, and its color (#RRGGBB, empty = default).
    let showTitle: String?
    let color: String?
    /// Message a host or admin pinned for the current show.
    struct Note: Decodable, Equatable { let headline: String; let message: String }
    let note: Note?
    /// The airing on now (a show or a genre block), used for reactions and ratings. Missing from older servers.
    let occId: String?
    let isShow: Bool?
    let blockTitle: String?
    let showStart: Double?   // milliseconds since 1970
    let showEnd: Double?
    /// A message for everyone, pushed from the station controls.
    struct Announcement: Decodable, Equatable { let text: String; let updatedAt: Double; let until: Double }
    let announcement: Announcement?
    /// For the background pulse: when the song started (unix seconds), its tempo and where its first beat falls. Missing/0 = unknown.
    let playedAt: Double?
    let bpm: Double?
    let beatOffset: Double?
    /// The host's own reaction emojis for this show (empty = the usual ones), and whether ratings are on for it. Missing from older servers.
    let hostEmojis: [String]?
    let ratingsOn: Bool?
    /// A show is on air without track info: title and artist are the show and host names, so there is no song to rate.
    let showOnly: Bool?
    /// Admin switch: show the ON AIR sign even when no show is live.
    let onAirManual: Bool?

    /// ON AIR sign: only for live shows (or the admin's manual switch).
    var onAir: Bool { isLive || (isShow ?? false) || (onAirManual ?? false) }
}

/// Where the beat lands right now: `origin` is when a beat last (or first) fell, in seconds since the reference date.
nonisolated struct BeatClock: Equatable {
    var bpm: Double
    var origin: TimeInterval
    /// 0...1 through the current beat (0 = on the beat).
    func phase(at date: Date) -> Double {
        let beats = (date.timeIntervalSinceReferenceDate - origin) * bpm / 60
        return beats - beats.rounded(.down)
    }
}

class AudioPlayerManager: ObservableObject {

    static let shared = AudioPlayerManager()

    // ─────────────────────────────────────────────────────────────
    // STREAM URL — Asura Icecast mount
    // Format is usually: https://streaming.asuracast.com/your-station-id/stream
    // ─────────────────────────────────────────────────────────────
    private let streamURLString = "https://a12.asurahosting.com:8360/radio.mp3"

    @Published var isPlaying = false
    @Published var nowPlayingTitle = "Babson Radio"
    /// Tempo + beat position of the song on air, or nil (live DJ, or song not analyzed yet).
    @Published var beatClock: BeatClock?

    /// Seconds between the station sending a song and you hearing it (the player's buffer). Raise it if the pulse feels early,
    /// lower it if late. Developers can adjust it live in Profile > Beat delay.
    @Published var beatDelay: Double = {
        let v = UserDefaults.standard.object(forKey: "br_beat_delay") as? Double
        return v ?? 4
    }() {
        didSet {
            UserDefaults.standard.set(beatDelay, forKey: "br_beat_delay")
            if let np = nowPlaying { beatClock = Self.makeBeatClock(np, delay: beatDelay) }
        }
    }

    private static func makeBeatClock(_ np: NowPlayingInfo, delay: Double) -> BeatClock? {
        guard !np.isLive, let bpm = np.bpm, bpm > 0 else { return nil }
        let start: Date
        if let p = np.playedAt, p > 0 { start = Date(timeIntervalSince1970: p) }
        else { start = Date().addingTimeInterval(-np.elapsed) }
        return BeatClock(bpm: bpm, origin: start.timeIntervalSinceReferenceDate + (np.beatOffset ?? 0) + delay)
    }
    @Published var nowPlayingSubtitle = "Live Stream"
    @Published var isBuffering = false
    /// Latest song info (nil until the first successful fetch).
    @Published var nowPlaying: NowPlayingInfo?
    /// When `nowPlaying` was fetched, so the progress bar can run between polls.
    @Published var nowPlayingFetchedAt = Date()
    /// The current cover (decoded), kept across songs until a new one actually arrives.
    @Published var coverImage: UIImage?
    /// The song has no cover yet but one is probably on its way (we poll quickly until it shows up).
    @Published var coverPending = false
    private var lastCoverAt = Date.distantPast
    private var coverHuntUntil = Date.distantPast
    /// How long an old cover stays up while the next song's cover is missing.
    private let coverLinger: TimeInterval = 90
    private let coverHuntWindow: TimeInterval = 120

    /// Set every 5 minutes of listening while signed out; the player screen shows the sign-in invitation.
    @Published var showSignInPrompt = false
    private var previewTimer: Timer?
    private var previewSeconds = 0
    private var previewTotal = 0

    private var pollTask: Task<Void, Never>?
    private var pollUsers = 0
    private var artworkURL = ""
    private var artwork: Any?   // MPMediaItemArtwork (kept as Any so macOS builds don't need UIKit)

    private var player: AVPlayer?
    private var playerItem: AVPlayerItem?
    private var statusObserver: AnyCancellable?

    private init() {
        setupAudioSession()
        setupRemoteControls()
        observeAudioSessionEvents()
    }

    // MARK: - Audio Session (iOS only)

    private func setupAudioSession() {
#if os(iOS)
        do {
            // .allowBluetoothA2DP = stereo BT headphones/speakers (iOS 10+, preferred for music)
            // .allowAirPlay = AirPlay streaming
            // .allowBluetooth (HFP) was deprecated iOS 18 — removed
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.allowBluetoothA2DP, .allowAirPlay]
            )
        } catch {
            print("AudioSession error: \(error)")
        }
#endif
    }

    private func activateAudioSession() {
#if os(iOS)
        do { try AVAudioSession.sharedInstance().setActive(true) }
        catch { print("AudioSession activation error: \(error)") }
#endif
    }

    // MARK: - Interruptions & route changes (calls, Siri, unplugged headphones)

    private var shouldResumeAfterInterruption = false

    private func observeAudioSessionEvents() {
#if os(iOS)
        let nc = NotificationCenter.default
        nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self,
                  let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            switch type {
            case .began:
                self.shouldResumeAfterInterruption = self.isPlaying
                self.player?.pause()
                self.isPlaying = false
                ArtTheme.shared.listening = false
            case .ended:
                let optRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                if AVAudioSession.InterruptionOptions(rawValue: optRaw).contains(.shouldResume),
                   self.shouldResumeAfterInterruption {
                    self.play()   // live stream: reconnect at the live edge, don't resume stale buffer
                }
                self.shouldResumeAfterInterruption = false
            @unknown default: break
            }
        }
        nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
            self?.stop()   // headphones unplugged → pause, as users expect
        }
#endif
    }

    // MARK: - Playback Controls

    func play() {
        // Also covers lock-screen / Control Center play: live radio needs an account with access.
        // Signed-out visitors can preview the live stream; everyone who is signed in can listen.
        guard AuthManager.shared.canListenLive || !AuthManager.shared.isSignedIn else { return }
        isBuffering = true
        Task { @MainActor in
            // The server decides whether listening is open right now (quiet hours, limits, one device at a time).
            if await ListenGuard.shared.begin() { startPlayback() } else { isBuffering = false }
        }
    }

    private func startPlayback() {
        guard let url = URL(string: streamURLString) else {
            print("Invalid stream URL — update streamURLString in AudioPlayerManager.swift")
            return
        }

        isBuffering = true
        activateAudioSession()

        let item = AVPlayerItem(url: url)
        playerItem = item

        statusObserver = item.publisher(for: \.status)
            .sink { [weak self] status in
                DispatchQueue.main.async {
                    if status == .readyToPlay {
                        self?.isBuffering = false
                        // Let the equalizer listen to what is playing.
                        Task { @MainActor in await SpectrumTap.attach(to: item) }
                    }
                }
            }

        if player == nil {
            player = AVPlayer(playerItem: item)
        } else {
            player?.replaceCurrentItem(with: item)
        }

        player?.play()
        isPlaying = true
        Task { @MainActor in ArtTheme.shared.listening = true }
        startPreviewPrompts()
        startPolling()
        updateNowPlayingInfo()
    }

    func stop() {
        Task { @MainActor in ListenGuard.shared.end() }
        player?.pause()
        isPlaying = false
        isBuffering = false
        Task { @MainActor in ArtTheme.shared.listening = false }
        previewTimer?.invalidate(); previewTimer = nil
        stopPolling()
        updateNowPlayingInfo()
    }

    func toggle() {
        isPlaying ? stop() : play()
    }

    // MARK: - Preview prompt (signed-out listeners)

    private func startPreviewPrompts() {
        previewTimer?.invalidate(); previewTimer = nil
        previewSeconds = 0; previewTotal = 0
        guard !AuthManager.shared.isSignedIn else { return }
        previewTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if AuthManager.shared.isSignedIn { self.previewTimer?.invalidate(); self.previewTimer = nil; return }
                self.previewSeconds += 1; self.previewTotal += 1
                // Signed-out visitors get 10 minutes, then the stream stops and the sign-in invitation shows.
                if self.previewTotal >= 600 { self.stop(); self.showSignInPrompt = true; return }
                if self.previewSeconds >= 300 { self.previewSeconds = 0; self.showSignInPrompt = true }
            }
        }
    }

    // MARK: - Now playing (song info)

    /// Call when a screen that shows the song appears; pair with `stopPolling()`. Playing also keeps it going.
    func startPolling() {
        pollUsers += 1
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshNowPlaying()
                let hunting = (self?.coverHuntUntil ?? .distantPast) > Date()
                try? await Task.sleep(nanoseconds: hunting ? 1_500_000_000 : 12_000_000_000)
            }
        }
    }

    func stopPolling() {
        pollUsers = max(0, pollUsers - 1)
        if pollUsers == 0 && !isPlaying { pollTask?.cancel(); pollTask = nil }
    }

    func refreshNowPlaying() async {
        guard let np: NowPlayingInfo = try? await BackendAPI.get("/api/nowplaying"), np.configured else { return }
        let changed = np.title != nowPlaying?.title || np.artist != nowPlaying?.artist
        nowPlaying = np
        beatClock = Self.makeBeatClock(np, delay: beatDelay)
        nowPlayingFetchedAt = Date()
        if !np.title.isEmpty {
            nowPlayingTitle = np.title
            nowPlayingSubtitle = np.artist
        }
        if changed && np.art.isEmpty { coverHuntUntil = Date().addingTimeInterval(coverHuntWindow) }
        if np.art.isEmpty {
            // No cover yet. Keep the old one for a while; if it was recent, assume the new one is coming and poll fast.
            if coverImage != nil {
                if Date().timeIntervalSince(lastCoverAt) > coverLinger && Date() > coverHuntUntil { clearCover() }
                else if coverHuntUntil < Date() && Date().timeIntervalSince(lastCoverAt) <= coverLinger {
                    coverHuntUntil = Date().addingTimeInterval(coverHuntWindow)
                }
            }
            coverPending = coverHuntUntil > Date()
        } else {
            coverPending = false
            coverHuntUntil = .distantPast
            if np.art != artworkURL { await loadArtwork(np.art) }
        }
        if changed || artworkURL.isEmpty == false { updateNowPlayingInfo() }
        scheduleAdvance(for: np)
    }

    // MARK: - Moving to the next song without waiting for the server

    /// The stream reaches your ears a few seconds after the server's clock, so wait this long past the song's end before swapping the title.
    private let hearDelay: Double = 5
    private var advanceTask: Task<Void, Never>?

    /// When this song's end time passes, show the next song's title and artist right away, then ask the server for the real data.
    private func scheduleAdvance(for np: NowPlayingInfo) {
        advanceTask?.cancel()
        guard !np.isLive, np.duration > 0, np.next != nil else { return }
        let end: Double
        if let started = np.playedAt, started > 0 { end = started + np.duration }
        else { end = nowPlayingFetchedAt.timeIntervalSince1970 + (np.duration - np.elapsed) }
        let wait = end + hearDelay - Date().timeIntervalSince1970
        guard wait < 20 * 60 else { return }
        advanceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(max(0, wait) * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            await self.advanceNow(from: np)
        }
    }

    private func advanceNow(from old: NowPlayingInfo) async {
        guard var cur = nowPlaying, cur.title == old.title, let next = cur.next else { return }
        cur.title = next.title; cur.artist = next.artist; cur.elapsed = 0; cur.duration = 0; cur.next = nil
        nowPlaying = cur
        nowPlayingTitle = next.title
        nowPlayingSubtitle = next.artist
        updateNowPlayingInfo()
        await refreshNowPlaying()
        // Separate task: refreshing reschedules (and cancels) the one that is running this.
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if self?.nowPlaying?.title == next.title { await self?.refreshNowPlaying() }
        }
    }

    private func loadArtwork(_ urlString: String) async {
        guard let url = URL(string: urlString),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let image = UIImage(data: data) else { return }   // keep what we have; the next poll retries
        artworkURL = urlString
        artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        coverImage = image
        lastCoverAt = Date()
        ArtTheme.shared.update(from: image)
    }

    private func clearCover() {
        artworkURL = ""
        artwork = nil
        coverImage = nil
        ArtTheme.shared.update(from: nil)
    }

    // MARK: - Lock Screen / Control Center

    private func setupRemoteControls() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            self?.play(); return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.stop(); return .success
        }
        center.stopCommand.addTarget { [weak self] _ in
            self?.stop(); return .success
        }
    }

    private func updateNowPlayingInfo() {
        var info = [String: Any]()
        info[MPMediaItemPropertyTitle]  = nowPlayingTitle
        // Lock screen and Control Center: the station is always the "artist"; the song's real artist goes in the album line.
        info[MPMediaItemPropertyArtist] = "Babson Radio"
        if !nowPlayingSubtitle.isEmpty && nowPlayingSubtitle != "Babson Radio" { info[MPMediaItemPropertyAlbumTitle] = nowPlayingSubtitle }
        if let art = artwork as? MPMediaItemArtwork { info[MPMediaItemPropertyArtwork] = art }
        info[MPNowPlayingInfoPropertyIsLiveStream] = true
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
