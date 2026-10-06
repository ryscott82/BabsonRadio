import AVFoundation
import MediaPlayer
import Combine

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
        guard AuthManager.shared.canListenLive else { return }
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
        updateNowPlayingInfo()
    }

    func stop() {
        player?.pause()
        isPlaying = false
        isBuffering = false
        updateNowPlayingInfo()
    }

    func toggle() {
        isPlaying ? stop() : play()
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
        info[MPMediaItemPropertyArtist] = "Babson Radio"
        info[MPNowPlayingInfoPropertyIsLiveStream] = true
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
