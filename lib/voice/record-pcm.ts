// lib/voice/record-pcm.ts
//
// Запись речи с микрофона в LPCM 16 кГц mono 16-bit для Yandex SpeechKit STT.
//
// Зачем не Web Speech API: браузерное распознавание (webkitSpeechRecognition)
// в Safari требует «живого клика» пользователя на КАЖДЫЙ запуск микрофона —
// поэтому hands-free авто-цикл там невозможен, статус виснет на «Слушаю...».
// Здесь мы сами пишем звук через Web Audio API (работает в Safari/Chrome/
// Yandex Browser одинаково) и отправляем на сервер для распознавания.
//
// Со встроенной детекцией активности голоса (VAD): запись стартует, ждёт речь,
// а после паузы тишины автоматически завершается и отдаёт PCM.

let sharedCtx: AudioContext | null = null
let sharedStream: MediaStream | null = null

const TARGET_RATE = 16000

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === "undefined") return null
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  )
}

export function micSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!getAudioContextClass()
  )
}

// Должна вызываться из обработчика пользовательского жеста (клик по кнопке).
// Переиспользует контекст и поток между циклами «слушания».
//
// ВАЖНО про Safari: getUserMedia должен вызываться СРАЗУ в рамках жеста, без
// предшествующего await — иначе Safari «теряет» активацию жеста и блокирует
// микрофон без запроса. Поэтому getUserMedia идёт ПЕРВЫМ, а resume() —
// уже после (к этому моменту жест не нужен).
//
// Бросает при ошибке доступа к микрофону (NotAllowedError и т.п.), чтобы
// вызыватель показал понятное сообщение. Возвращает false только если в
// браузере нет Web Audio API вовсе.
export async function ensureMic(): Promise<boolean> {
  const Ctx = getAudioContextClass()
  if (!Ctx || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false
  }
  if (!sharedStream) {
    sharedStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  }
  if (!sharedCtx) sharedCtx = new Ctx()
  if (sharedCtx.state === "suspended") {
    try { await sharedCtx.resume() } catch { /* ignore */ }
  }
  return true
}

export function releaseMic(): void {
  try { sharedStream?.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
  sharedStream = null
  try { void sharedCtx?.close() } catch { /* ignore */ }
  sharedCtx = null
}

export interface ListenHandle {
  abort: () => void
}

interface ListenOpts {
  onStart?: () => void
  /** Речь распознана локально как завершённая — отдаём PCM (16 кГц LPCM). */
  onResult: (pcm: ArrayBuffer) => void
  /** За отведённое время речь не началась. */
  onNoSpeech?: () => void
  onError?: (e: unknown) => void
  /** Тишина после речи → завершить (мс). */
  silenceMs?: number
  /** Жёсткий предел длины записи (мс). */
  maxMs?: number
  /** Если речь так и не началась — сдаться (мс). */
  noSpeechMs?: number
  /** Порог громкости (RMS) для детекции голоса. */
  voiceThreshold?: number
}

export function listenOnce(opts: ListenOpts): ListenHandle {
  const {
    onStart, onResult, onNoSpeech, onError,
    silenceMs = 1300, maxMs = 15000, noSpeechMs = 7000,
    voiceThreshold = 0.014,
  } = opts

  let aborted = false
  let finished = false
  let processor: ScriptProcessorNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let mute: GainNode | null = null

  const chunks: Float32Array[] = []
  let speechStarted = false
  let voicedMs = 0
  let lastVoiceMs = 0
  let startMs = 0

  const cleanup = () => {
    try { processor?.disconnect() } catch { /* ignore */ }
    try { source?.disconnect() } catch { /* ignore */ }
    try { mute?.disconnect() } catch { /* ignore */ }
    processor = null
    source = null
    mute = null
  }

  const finish = (emit: boolean) => {
    if (finished) return
    finished = true
    cleanup()
    if (aborted) return
    // Слишком коротко (кашель/щелчок) — считаем как «без речи».
    if (!emit || !speechStarted || voicedMs < 250 || chunks.length === 0) {
      onNoSpeech?.()
      return
    }
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const merged = new Float32Array(total)
    let off = 0
    for (const c of chunks) { merged.set(c, off); off += c.length }
    const srcRate = sharedCtx?.sampleRate ?? TARGET_RATE
    const pcm = floatToLpcm16(downsample(merged, srcRate, TARGET_RATE))
    onResult(pcm)
  }

  void (async () => {
    try {
      const ok = await ensureMic()
      if (!ok) { onError?.(new Error("audio unavailable")); return }
      if (aborted) return
      const ctx = sharedCtx!
      const stream = sharedStream!
      const chunkMs = (4096 / ctx.sampleRate) * 1000

      source = ctx.createMediaStreamSource(stream)
      processor = ctx.createScriptProcessor(4096, 1, 1)
      mute = ctx.createGain()
      mute.gain.value = 0 // не отдавать звук обратно в динамики (без эха)

      startMs = ctx.currentTime * 1000
      lastVoiceMs = startMs
      onStart?.()

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (finished || aborted) return
        const buf = e.inputBuffer.getChannelData(0)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        const t = ctx.currentTime * 1000

        if (rms > voiceThreshold) {
          speechStarted = true
          voicedMs += chunkMs
          lastVoiceMs = t
          chunks.push(new Float32Array(buf))
        } else if (speechStarted) {
          chunks.push(new Float32Array(buf)) // хвост тишины, чтобы не обрезать слова
        }

        if (speechStarted && t - lastVoiceMs > silenceMs) { finish(true); return }
        if (t - startMs > maxMs) { finish(true); return }
        if (!speechStarted && t - startMs > noSpeechMs) { finish(false); return }
      }

      source.connect(processor)
      processor.connect(mute)
      mute.connect(ctx.destination)
    } catch (e) {
      onError?.(e)
    }
  })()

  return {
    abort: () => { aborted = true; finished = true; cleanup() },
  }
}

function downsample(input: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (dstRate >= srcRate) return input
  const ratio = srcRate / dstRate
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio
    const i0 = Math.floor(idx)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = idx - i0
    out[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return out
}

function floatToLpcm16(input: Float32Array): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(input.length * 2))
  for (let i = 0; i < input.length; i++) {
    let s = Math.max(-1, Math.min(1, input[i]))
    s = s < 0 ? s * 0x8000 : s * 0x7fff
    view.setInt16(i * 2, s, true) // little-endian
  }
  return view.buffer
}
