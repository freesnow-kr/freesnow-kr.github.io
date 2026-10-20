// 히어로 영상 만들기 (macOS 기본 AVFoundation, ffmpeg 불필요)
// 가로 영상 → H.264 1280px 폭 + AAC 128k + 첫 프레임 포스터
// 사용: swift scripts/make-hero.swift <원본.mp4> public/hero.mp4 public/hero.jpg <시작초> <길이초> <비트레이트>
//   예: swift scripts/make-hero.swift public/2526_main.mp4 public/hero.mp4 public/hero.jpg 0 13.9 2500000
// 끝나고 public/hero.mp4.sb-* 임시 파일이 남으면 지우기
import AVFoundation
import AppKit
let a = CommandLine.arguments
let src = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let start = CMTime(seconds: Double(a[4])!, preferredTimescale: 600)
let dur = CMTime(seconds: Double(a[5])!, preferredTimescale: 600)
let track = src.tracks(withMediaType: .video)[0]

// 영상만(소리 제외) 잘라서 새 컴포지션에
let comp = AVMutableComposition()
let vt = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try! vt.insertTimeRange(CMTimeRange(start: start, duration: dur), of: track, at: .zero)
let srcAudio = src.tracks(withMediaType: .audio).first
if let srcAudio {
	let at = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
	try! at.insertTimeRange(CMTimeRange(start: start, duration: dur), of: srcAudio, at: .zero)
}

// 회전 없이 가로 1280으로 축소
let oriented = track.naturalSize.applying(track.preferredTransform)
let k = 1280 / abs(oriented.width)
let h = 1280.0, w = (abs(oriented.height) * k).rounded()
let rot = CGAffineTransform(scaleX: k, y: k)
let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: vt)
layer.setTransform(track.preferredTransform.concatenating(rot), at: .zero)
let inst = AVMutableVideoCompositionInstruction()
inst.timeRange = CMTimeRange(start: .zero, duration: dur)
inst.layerInstructions = [layer]
let vc = AVMutableVideoComposition()
vc.instructions = [inst]
vc.renderSize = CGSize(width: h, height: w)
vc.frameDuration = CMTime(value: 1, timescale: 30)

let outURL = URL(fileURLWithPath: a[2])
try? FileManager.default.removeItem(at: outURL)
// 비트레이트 직접 지정 (프리셋보다 훨씬 작게)
let reader = try! AVAssetReader(asset: comp)
let rOut = AVAssetReaderVideoCompositionOutput(videoTracks: comp.tracks(withMediaType: .video),
	videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
rOut.videoComposition = vc
reader.add(rOut)
let aOut = comp.tracks(withMediaType: .audio).first.map {
	AVAssetReaderTrackOutput(track: $0, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
}
if let aOut { reader.add(aOut) }
let writer = try! AVAssetWriter(outputURL: outURL, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let wIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
	AVVideoCodecKey: AVVideoCodecType.h264,
	AVVideoWidthKey: Int(h), AVVideoHeightKey: Int(w),
	AVVideoCompressionPropertiesKey: [
		AVVideoAverageBitRateKey: Int(a[6])!,
		AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
		AVVideoMaxKeyFrameIntervalKey: 60,
	],
])
writer.add(wIn)
let aIn = aOut.map { _ in AVAssetWriterInput(mediaType: .audio, outputSettings: [
	AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: 2, AVSampleRateKey: 44100, AVEncoderBitRateKey: 128_000,
]) }
if let aIn { writer.add(aIn) }
reader.startReading()
writer.startWriting()
writer.startSession(atSourceTime: .zero)
let group = DispatchGroup()
func pump(_ input: AVAssetWriterInput, _ output: AVAssetReaderOutput, _ q: String) {
	group.enter()
	input.requestMediaDataWhenReady(on: DispatchQueue(label: q)) {
		while input.isReadyForMoreMediaData {
			if let buf = output.copyNextSampleBuffer() { input.append(buf) } else { input.markAsFinished(); group.leave(); return }
		}
	}
}
pump(wIn, rOut, "v")
if let aIn, let aOut { pump(aIn, aOut, "a") }
group.wait()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
guard writer.status == .completed else { print("write failed:", writer.error as Any); exit(1) }

// 첫 프레임 포스터
let gen = AVAssetImageGenerator(asset: AVURLAsset(url: outURL))
gen.requestedTimeToleranceBefore = .zero
let img = try! gen.copyCGImage(at: .zero, actualTime: nil)
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .jpeg, properties: [.compressionFactor: 0.75])!.write(to: URL(fileURLWithPath: a[3]))
print("ok", img.width, img.height)
