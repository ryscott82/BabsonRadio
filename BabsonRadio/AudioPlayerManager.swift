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
    let title: String
    let artist: String
    let album: String
    let art: String
    let elapsed: Double
    let duration: Double
    let isLive: Bool
    let streamer: String
    let listeners: Int
    let next: Next?
    /// Scheduled show/event on air now, and its color (#RRGGBB, empty = default).
    let showTitle: String?
    let color: String?
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
    @Published var nowPlayingSubtitle = "Live Stream"
    @Published var isBuffering = false
    /// Latest song info (nil until the first successful fetch).
    @Published var nowPlaying: NowPlayingInfo?
    /// When `nowPlaying` was fetched, so the progress bar can run between polls.
    @Published var nowPlayingFetchedAt = Date()

    /// Set every 5 minutes of listening while signed out; the player screen shows the sign-in invitation.
    @Published var showSignInPrompt = false
    private var previewTimer: Timer?
    private var previewSeconds = 0

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
        // Signed-out visitors can preview the live stream; signed-in people need access (students, trial or pass).
        guard AuthManager.shared.canListenLive || !AuthManager.shared.isSignedIn else { return }
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
        startPreviewPrompts()
        startPolling()
        updateNowPlayingInfo()
    }

    func stop() {
        player?.pause()
        isPlaying = false
        isBuffering = false
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
        previewSeconds = 0
        guard !AuthManager.shared.isSignedIn else { return }
        previewTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if AuthManager.shared.isSignedIn { self.previewTimer?.invalidate(); self.previewTimer = nil; return }
                self.previewSeconds += 1
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
                try? await Task.sleep(nanoseconds: 12_000_000_000)
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
        nowPlayingFetchedAt = Date()
        if !np.title.isEmpty {
            nowPlayingTitle = np.title
            nowPlayingSubtitle = np.artist
        }
        if np.art != artworkURL { await loadArtwork(np.art) }
        if changed || artworkURL.isEmpty == false { updateNowPlayingInfo() }
    }

    private func loadArtwork(_ urlString: String) async {
        artworkURL = urlString
        artwork = nil
#if canImport(UIKit)
        guard let url = URL(string: urlString),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let image = UIImage(data: data) else { return }
        artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
#endif
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
        info[MPMediaItemPropertyArtist] = nowPlayingSubtitle.isEmpty ? "Babson Radio" : nowPlayingSubtitle
        if let album = nowPlaying?.album, !album.isEmpty { info[MPMediaItemPropertyAlbumTitle] = album }
        if let art = artwork as? MPMediaItemArtwork { info[MPMediaItemPropertyArtwork] = art }
        info[MPNowPlayingInfoPropertyIsLiveStream] = true
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
