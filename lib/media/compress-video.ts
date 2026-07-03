// Клиентское пережатие видео/аудио кандидата (Юрий 03.07): файл больше лимита
// не отбрасывается с ошибкой, а пережимается прямо в браузере до проходного
// размера. Без ffmpeg.wasm (тяжёл и валится на телефонах) — только встроенные
// API: <video>/<audio> → canvas.captureStream + AudioContext → MediaRecorder.
//
// «Без потери качества» в браузере строго невозможно (lossless не уменьшит
// файл) — делаем визуально неотличимо: длинная сторона капается на 1920
// (телефонные 4K → FHD — основной выигрыш), битрейт подбирается под целевой
// размер с потолком 8 Mbps и полом 1.2 Mbps.
//
// Перекодирование идёт в РЕАЛЬНОМ времени (ролик проигрывается скрыто) —
// поэтому обязателен onProgress. Файл открывается через blob-URL, звук
// маршрутизируется в MediaStreamDestination (в колонки НЕ идёт).

export class CompressionUnsupportedError extends Error {
  constructor(msg = "Браузер не поддерживает сжатие видео") { super(msg); this.name = "CompressionUnsupportedError" }
}
export class CompressionFailedError extends Error {
  constructor(msg = "Не удалось сжать файл до нужного размера") { super(msg); this.name = "CompressionFailedError" }
}

const AUDIO_BITRATE = 128_000
const MIN_VIDEO_BITRATE = 1_200_000
const MAX_VIDEO_BITRATE = 8_000_000
const MAX_LONG_SIDE = 1920
const CAPTURE_FPS = 30

/** Битрейт видео под целевой размер: 90% бюджета минус аудио, с полом и потолком. */
export function computeVideoBitrate(targetBytes: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new CompressionUnsupportedError("Не удалось определить длительность файла")
  }
  const raw = ((targetBytes * 8) / durationSec) * 0.9 - AUDIO_BITRATE
  return Math.min(MAX_VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, Math.floor(raw)))
}

/** Даунскейл с сохранением пропорций: длинная сторона ≤ MAX_LONG_SIDE, чётные размеры. */
export function fitDimensions(w: number, h: number): { width: number; height: number } {
  const long = Math.max(w, h)
  const k = long > MAX_LONG_SIDE ? MAX_LONG_SIDE / long : 1
  const even = (n: number) => Math.max(2, 2 * Math.round((n * k) / 2))
  return { width: even(w), height: even(h) }
}

function pickSupportedMime(candidates: string[]): string | null {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* Safari бросает на незнакомом */ }
  }
  return null
}

const VIDEO_MIMES = ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', "video/mp4", 'video/webm;codecs="vp9,opus"', "video/webm"]
const AUDIO_MIMES = ["audio/mp4", 'audio/webm;codecs="opus"', "audio/webm"]

interface CompressOpts {
  targetBytes: number
  onProgress?: (pct: number) => void
}
export interface CompressResult { blob: Blob; mime: string }

function loadMedia(el: HTMLMediaElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new CompressionUnsupportedError("Файл не открылся для пережатия")), 20_000)
    el.onloadedmetadata = () => { clearTimeout(to); resolve() }
    el.onerror = () => { clearTimeout(to); reject(new CompressionUnsupportedError("Браузер не смог прочитать этот файл")) }
    el.src = url
    el.load()
  })
}

// Общий прогон: играет media-элемент, пишет поток рекордером до конца ролика.
async function recordPlayback(opts: {
  media: HTMLMediaElement
  stream: MediaStream
  mime: string
  videoBitsPerSecond?: number
  durationSec: number
  onProgress?: (pct: number) => void
  onFrame?: () => void
}): Promise<Blob> {
  const { media, stream, mime, videoBitsPerSecond, durationSec, onProgress, onFrame } = opts
  const chunks: BlobPart[] = []
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    ...(videoBitsPerSecond ? { videoBitsPerSecond } : {}),
    audioBitsPerSecond: AUDIO_BITRATE,
  })
  rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }

  let rafId = 0
  const pump = () => {
    onFrame?.()
    onProgress?.(Math.min(99, Math.round((media.currentTime / durationSec) * 100)))
    if (!media.ended && !media.paused) rafId = requestAnimationFrame(pump)
  }

  return await new Promise<Blob>((resolve, reject) => {
    const finish = () => {
      cancelAnimationFrame(rafId)
      if (rec.state !== "inactive") rec.stop()
    }
    rec.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }))
    rec.onerror = () => { cancelAnimationFrame(rafId); reject(new CompressionFailedError("Ошибка кодирования")) }
    media.onended = finish
    // Страховка от вечного зависания: длительность + 25% + 15с.
    const hardStop = setTimeout(finish, durationSec * 1250 + 15_000)
    rec.onstop = () => { clearTimeout(hardStop); resolve(new Blob(chunks, { type: mime.split(";")[0] })) }
    rec.start(1000)
    media.play().then(() => { rafId = requestAnimationFrame(pump) }).catch(() => {
      clearTimeout(hardStop)
      reject(new CompressionUnsupportedError("Браузер не дал проиграть файл для пережатия"))
    })
  })
}

export async function compressVideoFile(input: Blob, opts: CompressOpts): Promise<CompressResult> {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") throw new CompressionUnsupportedError()
  const mime = pickSupportedMime(VIDEO_MIMES)
  if (!mime) throw new CompressionUnsupportedError()

  const url = URL.createObjectURL(input)
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  // ВАЖНО: НЕ вешаем в DOM — скрытое перекодирование.
  let audioCtx: AudioContext | null = null
  try {
    await loadMedia(video, url)
    const durationSec = video.duration
    const bitrate = computeVideoBitrate(opts.targetBytes, durationSec)
    const { width, height } = fitDimensions(video.videoWidth || 1280, video.videoHeight || 720)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx || typeof canvas.captureStream !== "function") throw new CompressionUnsupportedError()

    const stream = canvas.captureStream(CAPTURE_FPS)
    // Звук: MediaElementSource → MediaStreamDestination (в колонки не выводим).
    try {
      const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      if (AC) {
        audioCtx = new AC()
        await audioCtx.resume().catch(() => {})
        const src = audioCtx.createMediaElementSource(video)
        const dest = audioCtx.createMediaStreamDestination()
        src.connect(dest)
        for (const t of dest.stream.getAudioTracks()) stream.addTrack(t)
      }
    } catch { /* видео без звука лучше, чем отказ */ }

    const blob = await recordPlayback({
      media: video, stream, mime, videoBitsPerSecond: bitrate, durationSec,
      onProgress: opts.onProgress,
      onFrame: () => { ctx.drawImage(video, 0, 0, width, height) },
    })
    if (blob.size === 0 || blob.size > opts.targetBytes) {
      throw new CompressionFailedError()
    }
    opts.onProgress?.(100)
    return { blob, mime: mime.split(";")[0] }
  } finally {
    try { video.pause() } catch { /* noop */ }
    video.removeAttribute("src")
    URL.revokeObjectURL(url)
    if (audioCtx) void audioCtx.close().catch(() => {})
  }
}

export async function compressAudioFile(input: Blob, opts: CompressOpts): Promise<CompressResult> {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") throw new CompressionUnsupportedError()
  const mime = pickSupportedMime(AUDIO_MIMES)
  if (!mime) throw new CompressionUnsupportedError()

  const url = URL.createObjectURL(input)
  const audio = document.createElement("audio")
  let audioCtx: AudioContext | null = null
  try {
    await loadMedia(audio, url)
    const durationSec = audio.duration
    if (!Number.isFinite(durationSec) || durationSec <= 0) throw new CompressionUnsupportedError("Не удалось определить длительность файла")

    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!AC) throw new CompressionUnsupportedError()
    audioCtx = new AC()
    await audioCtx.resume().catch(() => {})
    const src = audioCtx.createMediaElementSource(audio)
    const dest = audioCtx.createMediaStreamDestination()
    src.connect(dest)

    const blob = await recordPlayback({
      media: audio, stream: dest.stream, mime, durationSec,
      onProgress: opts.onProgress,
    })
    if (blob.size === 0 || blob.size > opts.targetBytes) throw new CompressionFailedError()
    opts.onProgress?.(100)
    return { blob, mime: mime.split(";")[0] }
  } finally {
    try { audio.pause() } catch { /* noop */ }
    audio.removeAttribute("src")
    URL.revokeObjectURL(url)
    if (audioCtx) void audioCtx.close().catch(() => {})
  }
}
