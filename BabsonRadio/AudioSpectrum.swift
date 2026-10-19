import AVFoundation
import MediaToolbox
import Accelerate
import os

// MARK: - Live spectrum for the equalizer
// A tap on the player's audio (MTAudioProcessingTap) listens to exactly what is being played, runs a 1024 point FFT, and
// publishes 28 log spaced band levels (0...1). The equalizer reads them every frame. If the tap never delivers audio
// (for example the stream type does not allow it), `snapshot` returns nil and the equalizer falls back to its beat-driven motion.

nonisolated final class AudioSpectrum: @unchecked Sendable {
    static let shared = AudioSpectrum()
    static let bands = 28

    /// The knobs for how the equalizer behaves. Change these numbers to taste.
    enum Tuning {
        /// Gain: how far above the song's recent average level a band can go before it hits the top. More headroom = lower gain.
        static let headroomDB: Float = 9
        /// Dynamic range: how many dB below the average a band falls to zero. Smaller = more movement, larger = busier.
        static let rangeDB: Float = 30
        /// Curve: above 1 keeps the middle of the range low so only strong notes climb high.
        static let gamma: Float = 1.7
        /// How fast bars rise (0...1 per update) and how fast they fall (smaller = longer hang time).
        static let attack: Float = 0.7
        static let release: Float = 0.80
        /// How quickly the automatic level follows the song (per update). Slower = more contrast between quiet and loud parts.
        static let followUp: Float = 0.03
        static let followDown: Float = 0.008
    }

    private struct State { var levels = [Float](repeating: 0, count: AudioSpectrum.bands); var stamp = 0.0 }
    private let lock = OSAllocatedUnfairLock(initialState: State())

    func publish(_ levels: [Float]) {
        let now = Date().timeIntervalSinceReferenceDate
        lock.withLock { $0.levels = levels; $0.stamp = now }
    }

    /// The latest band levels, or nil when the tap has not delivered anything in the last third of a second.
    func snapshot(at date: Date) -> [Float]? {
        let t = date.timeIntervalSinceReferenceDate
        return lock.withLock { s in t - s.stamp < 0.35 ? s.levels : nil }
    }

    func clear() { lock.withLock { $0.stamp = 0 } }
}

/// Everything the audio thread needs. Created once per player item and owned by the tap.
nonisolated final class SpectrumTapContext {
    private let n = 1024
    private let ringSize = 2048
    private var sampleRate = 44100.0
    private var isFloat = true
    private var isInterleaved = false
    private var channels = 2
    private var ring: [Float]
    private var head = 0
    private var window: [Float]
    private var windowed: [Float]
    private var real: [Float]
    private var imag: [Float]
    private var mags: [Float]
    private var setup: FFTSetup
    private var ranges: [(lo: Int, hi: Int, tilt: Float)] = []
    private var smooth = [Float](repeating: 0, count: AudioSpectrum.bands)
    private var ref: Float = -60

    init() {
        ring = [Float](repeating: 0, count: 2048)
        window = [Float](repeating: 0, count: 1024)
        windowed = [Float](repeating: 0, count: 1024)
        real = [Float](repeating: 0, count: 512)
        imag = [Float](repeating: 0, count: 512)
        mags = [Float](repeating: 0, count: 512)
        setup = vDSP_create_fftsetup(10, FFTRadix(kFFTRadix2))!
        vDSP_hann_window(&window, vDSP_Length(1024), Int32(vDSP_HANN_NORM))
        buildRanges()
    }

    deinit { vDSP_destroy_fftsetup(setup) }

    func configure(_ f: AudioStreamBasicDescription) {
        sampleRate = f.mSampleRate > 0 ? f.mSampleRate : 44100
        isFloat = (f.mFormatFlags & kAudioFormatFlagIsFloat) != 0
        isInterleaved = (f.mFormatFlags & kAudioFormatFlagIsNonInterleaved) == 0
        channels = max(1, Int(f.mChannelsPerFrame))
        buildRanges()
    }

    private func buildRanges() {
        let count = AudioSpectrum.bands
        let lowF = 50.0, highF = min(13000.0, sampleRate / 2 - 500)
        var out: [(Int, Int, Float)] = []
        for b in 0..<count {
            let f0 = lowF * pow(highF / lowF, Double(b) / Double(count))
            let f1 = lowF * pow(highF / lowF, Double(b + 1) / Double(count))
            let lo = min(n / 2 - 2, max(1, Int(f0 * Double(n) / sampleRate)))
            let hi = min(n / 2 - 1, max(lo + 1, Int(f1 * Double(n) / sampleRate)))
            let center = sqrt(f0 * f1)
            out.append((lo, hi, Float(3.2 * log2(center / 100))))   // a gentle lift for the highs, like a pink noise weighting
        }
        ranges = out
    }

    func ingest(_ abl: UnsafeMutablePointer<AudioBufferList>, frames: Int) {
        let list = UnsafeMutableAudioBufferListPointer(abl)
        guard frames > 0, list.count > 0 else { return }

        // Down-mix to mono into the ring.
        for i in 0..<frames {
            var v: Float = 0
            if isInterleaved, let p = list[0].mData {
                if isFloat {
                    let s = p.assumingMemoryBound(to: Float.self)
                    v = channels > 1 ? (s[i * channels] + s[i * channels + 1]) * 0.5 : s[i]
                } else {
                    let s = p.assumingMemoryBound(to: Int16.self)
                    let a = Float(s[i * channels]) / 32768
                    let b = channels > 1 ? Float(s[i * channels + 1]) / 32768 : a
                    v = (a + b) * 0.5
                }
            } else {
                var sum: Float = 0
                let used = min(2, list.count)
                for c in 0..<used {
                    guard let p = list[c].mData else { continue }
                    if isFloat { sum += p.assumingMemoryBound(to: Float.self)[i] }
                    else { sum += Float(p.assumingMemoryBound(to: Int16.self)[i]) / 32768 }
                }
                v = used > 0 ? sum / Float(used) : 0
            }
            ring[(head + i) & (ringSize - 1)] = v
        }
        head = (head + frames) & (ringSize - 1)
        analyze()
    }

    private func analyze() {
        let start = (head - n + ringSize) & (ringSize - 1)
        for i in 0..<n { windowed[i] = ring[(start + i) & (ringSize - 1)] * window[i] }

        real.withUnsafeMutableBufferPointer { rp in
            imag.withUnsafeMutableBufferPointer { ip in
                var split = DSPSplitComplex(realp: rp.baseAddress!, imagp: ip.baseAddress!)
                windowed.withUnsafeBufferPointer { wp in
                    wp.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: n / 2) {
                        vDSP_ctoz($0, 2, &split, 1, vDSP_Length(n / 2))
                    }
                }
                vDSP_fft_zrip(setup, &split, 1, vDSP_Length(10), FFTDirection(FFT_FORWARD))
                mags.withUnsafeMutableBufferPointer { mp in
                    vDSP_zvmags(&split, 1, mp.baseAddress!, 1, vDSP_Length(n / 2))
                }
            }
        }

        // Band power in dB (with the tilt), then scaled against a slowly falling peak so quiet and loud songs both fill the display.
        var db = [Float](repeating: -120, count: ranges.count)
        var peak: Float = -120
        for (b, r) in ranges.enumerated() {
            var sum: Float = 0
            for k in r.lo...r.hi { sum += mags[k] }
            let power = sum / Float(r.hi - r.lo + 1)
            let amp = sqrt(power) / Float(n)
            let d = 20 * log10(amp + 1e-7) + r.tilt
            db[b] = d
            peak = max(peak, d)
        }
        // The reference follows the song's recent level instead of its instant peak, so hits stand out and quiet parts stay low.
        if peak > ref + 25 { ref = peak }
        ref += (peak - ref) * (peak > ref ? AudioSpectrum.Tuning.followUp : AudioSpectrum.Tuning.followDown)
        var out = [Float](repeating: 0, count: ranges.count)
        if peak > -88 {
            let ceiling = ref + AudioSpectrum.Tuning.headroomDB
            let floor = ceiling - AudioSpectrum.Tuning.rangeDB
            for b in 0..<ranges.count {
                let lin = min(1, max(0, (db[b] - floor) / AudioSpectrum.Tuning.rangeDB))
                let target = pow(lin, AudioSpectrum.Tuning.gamma)
                let old = smooth[b]
                smooth[b] = target > old ? old + (target - old) * AudioSpectrum.Tuning.attack : old * AudioSpectrum.Tuning.release + target * (1 - AudioSpectrum.Tuning.release)
                out[b] = smooth[b]
            }
        }
        AudioSpectrum.shared.publish(out)
    }
}

// C callbacks (no captures allowed, so they are plain functions).

private nonisolated func tapContext(_ tap: MTAudioProcessingTap) -> SpectrumTapContext {
    Unmanaged<SpectrumTapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
}

private nonisolated func tapInit(_ tap: MTAudioProcessingTap, _ clientInfo: UnsafeMutableRawPointer?,
                                 _ storageOut: UnsafeMutablePointer<UnsafeMutableRawPointer?>) {
    storageOut.pointee = clientInfo
}

private nonisolated func tapFinalize(_ tap: MTAudioProcessingTap) {
    Unmanaged<SpectrumTapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).release()
}

private nonisolated func tapPrepare(_ tap: MTAudioProcessingTap, _ maxFrames: CMItemCount,
                                    _ format: UnsafePointer<AudioStreamBasicDescription>) {
    tapContext(tap).configure(format.pointee)
}

private nonisolated func tapUnprepare(_ tap: MTAudioProcessingTap) {}

private nonisolated func tapProcess(_ tap: MTAudioProcessingTap, _ numberFrames: CMItemCount, _ flags: MTAudioProcessingTapFlags,
                                    _ bufferList: UnsafeMutablePointer<AudioBufferList>,
                                    _ numberFramesOut: UnsafeMutablePointer<CMItemCount>,
                                    _ flagsOut: UnsafeMutablePointer<MTAudioProcessingTapFlags>) {
    let status = MTAudioProcessingTapGetSourceAudio(tap, numberFrames, bufferList, flagsOut, nil, numberFramesOut)
    guard status == noErr else { return }
    tapContext(tap).ingest(bufferList, frames: Int(numberFramesOut.pointee))
}

enum SpectrumTap {
    /// Hooks the equalizer into a player item. Call once the item is ready to play.
    @MainActor
    static func attach(to item: AVPlayerItem) async {
        guard item.audioMix == nil,
              let track = try? await item.asset.loadTracks(withMediaType: .audio).first else { return }
        let context = SpectrumTapContext()
        var callbacks = MTAudioProcessingTapCallbacks(
            version: kMTAudioProcessingTapCallbacksVersion_0,
            clientInfo: Unmanaged.passRetained(context).toOpaque(),
            init: tapInit, finalize: tapFinalize, prepare: tapPrepare, unprepare: tapUnprepare, process: tapProcess)
        var tap: MTAudioProcessingTap?
        let status = MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks, kMTAudioProcessingTapCreationFlag_PostEffects, &tap)
        guard status == noErr, let tap else {
            Unmanaged<SpectrumTapContext>.fromOpaque(callbacks.clientInfo!).release()
            return
        }
        let params = AVMutableAudioMixInputParameters(track: track)
        params.audioTapProcessor = tap
        let mix = AVMutableAudioMix()
        mix.inputParameters = [params]
        item.audioMix = mix
    }
}
