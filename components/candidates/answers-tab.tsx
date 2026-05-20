"use client"

import { useEffect, useRef, useState } from "react"
import { Video as VideoIcon, Mic, Image as ImageIcon, FileText, FileQuestion, Loader2, PictureInPicture2 } from "lucide-react"
import type { Lesson, Block, Question } from "@/lib/course-types"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaAnswer {
  url: string
  mediaType: "video" | "audio" | "photo"
  duration?: number
  size?: number
  mime?: string
}

type AnketaEntry =
  | { question: string; answer: string } // legacy plain pair
  | {
      blockId: string
      answer: string | MediaAnswer | Record<string, unknown>
      answeredAt?: string
      timeSpent?: number
    }

interface AnswersTabProps {
  answers: unknown
  demoLessons: unknown
  candidateId?: string
}

interface QualificationAnswer {
  id:           string
  questionText: string
  answerText:   string | null
  aiVerdict:    "passed" | "failed" | "unclear" | null
  aiReasoning:  string | null
  isCritical:   boolean
  createdAt:    string
}

interface QualificationData {
  status:      "pending" | "passed" | "failed" | "no_answer" | null
  sentAt:      string | null
  completedAt: string | null
  answers:     QualificationAnswer[]
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function normalizeEntries(raw: unknown): AnketaEntry[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as AnketaEntry[]
  if (typeof raw === "object") {
    return Object.values(raw as Record<string, AnketaEntry>)
  }
  return []
}

function isMediaAnswer(v: unknown): v is MediaAnswer {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return typeof o.url === "string" &&
    typeof o.mediaType === "string" &&
    ["video", "audio", "photo"].includes(o.mediaType as string)
}

// Распознаём «медиа» в любых формах: legacy {videoUrl}, {mediaUrl, mediaType},
// строки-URL на /uploads/…, массив вложений. Фоллбэк на расширение файла.
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|webm)(\?|#|$)/i
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)(\?|#|$)/i

function detectMediaTypeFromUrl(url: string): "video" | "audio" | "photo" | null {
  if (VIDEO_EXT.test(url)) return "video"
  if (AUDIO_EXT.test(url)) return "audio"
  if (IMAGE_EXT.test(url)) return "photo"
  return null
}

function coerceMedia(v: unknown): MediaAnswer | MediaAnswer[] | null {
  if (!v) return null

  // Уже стандартный формат
  if (isMediaAnswer(v)) return v

  // Строка-URL вида /uploads/... — пытаемся вывести тип по расширению
  if (typeof v === "string") {
    const trimmed = v.trim()
    if (!trimmed) return null
    const isUrl = trimmed.startsWith("/uploads/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")
    if (!isUrl) return null
    const type = detectMediaTypeFromUrl(trimmed)
    if (!type) return null
    return { url: trimmed, mediaType: type }
  }

  // Массив вложений
  if (Array.isArray(v)) {
    const items = v.map(coerceMedia).filter(Boolean) as MediaAnswer[]
    return items.length > 0 ? items : null
  }

  if (typeof v !== "object") return null
  const o = v as Record<string, unknown>

  // legacy {videoUrl}, {audioUrl}, {imageUrl}/{photoUrl}
  if (typeof o.videoUrl === "string" && o.videoUrl) {
    return { url: o.videoUrl, mediaType: "video", mime: typeof o.mime === "string" ? o.mime : undefined }
  }
  if (typeof o.audioUrl === "string" && o.audioUrl) {
    return { url: o.audioUrl, mediaType: "audio", mime: typeof o.mime === "string" ? o.mime : undefined }
  }
  if (typeof o.imageUrl === "string" && o.imageUrl) {
    return { url: o.imageUrl, mediaType: "photo" }
  }
  if (typeof o.photoUrl === "string" && o.photoUrl) {
    return { url: o.photoUrl, mediaType: "photo" }
  }

  // {mediaUrl, mediaType}
  if (typeof o.mediaUrl === "string" && o.mediaUrl) {
    const mt = typeof o.mediaType === "string" && ["video", "audio", "photo"].includes(o.mediaType)
      ? (o.mediaType as MediaAnswer["mediaType"])
      : detectMediaTypeFromUrl(o.mediaUrl)
    if (mt) return { url: o.mediaUrl, mediaType: mt, mime: typeof o.mime === "string" ? o.mime : undefined }
  }

  // {url, mime} — без mediaType, выводим из URL/mime
  if (typeof o.url === "string" && o.url) {
    const mime = typeof o.mime === "string" ? o.mime.toLowerCase() : ""
    let mt: MediaAnswer["mediaType"] | null = null
    if (mime.startsWith("video/")) mt = "video"
    else if (mime.startsWith("audio/")) mt = "audio"
    else if (mime.startsWith("image/")) mt = "photo"
    else mt = detectMediaTypeFromUrl(o.url)
    if (mt) return { url: o.url, mediaType: mt, mime: typeof o.mime === "string" ? o.mime : undefined }
  }

  // Объект с массивом attachments[]
  if (Array.isArray(o.attachments)) {
    const items = o.attachments.map(coerceMedia).filter(Boolean) as MediaAnswer[]
    if (items.length > 0) return items
  }

  // Last-resort deep scan: рекурсивно идём по любым полям объекта в поисках
  // распознаваемого URL. На случай нестандартных форматов из старых записей.
  const collected: MediaAnswer[] = []
  for (const val of Object.values(o)) {
    const sub = coerceMedia(val)
    if (!sub) continue
    if (Array.isArray(sub)) collected.push(...sub)
    else collected.push(sub)
  }
  if (collected.length > 0) return collected.length === 1 ? collected[0] : collected

  return null
}

interface BlockMapEntry {
  block: Block
  lesson: Lesson
}

function buildBlockMap(lessons: unknown): Map<string, BlockMapEntry> {
  const map = new Map<string, BlockMapEntry>()
  if (!Array.isArray(lessons)) return map
  for (const l of lessons as Lesson[]) {
    if (!l || !Array.isArray(l.blocks)) continue
    for (const b of l.blocks) {
      if (b && typeof b.id === "string") map.set(b.id, { block: b, lesson: l })
    }
  }
  return map
}

function formatAnsweredAt(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleString("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  })
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return ""
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m === 0 ? `${s} сек` : `${m}:${s.toString().padStart(2, "0")}`
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function VideoPlayer({ url }: { url: string }) {
  // preload="metadata" — грузим только заголовок, дальше браузер сам
  // подтягивает байты через Range-запросы (nginx их отдаёт). На canPlay
  // делаем currentTime=0.5 чтобы заменить чёрный первый кадр живым;
  // до canPlay показываем спиннер.
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  // PiP API недоступен в Firefox-mobile и старых WebKit — считаем флаг
  // на mount, чтобы избежать гидрационного несовпадения.
  const [pipAvailable, setPipAvailable] = useState(false)

  useEffect(() => {
    setPipAvailable(typeof document !== "undefined" && !!document.pictureInPictureEnabled)
  }, [])

  const togglePip = async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement === v) {
        await document.exitPictureInPicture()
      } else {
        await v.requestPictureInPicture()
      }
    } catch {
      // Юзер мог отменить prompt, либо браузер заблокировал без user-gesture
    }
  }

  // Авто-PiP при прокрутке внутри Sheet/Dialog: видео уходит из видимости
  // и сейчас играет → активируем PiP. Скролл-контейнер ищем по
  // [data-radix-scroll-area-viewport] либо [role="dialog"]; root=null →
  // fallback на viewport браузера.
  useEffect(() => {
    const container = containerRef.current
    const v = videoRef.current
    if (!container || !v || !pipAvailable) return

    const scrollRoot =
      container.closest('[data-radix-scroll-area-viewport]') ??
      container.closest('[role="dialog"]') ??
      null

    let triggered = false
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const isPlaying = !v.paused && !v.ended && v.readyState >= 2
      if (!entry.isIntersecting && isPlaying && !triggered && document.pictureInPictureElement !== v) {
        triggered = true
        v.requestPictureInPicture().catch(() => { triggered = false })
      }
      if (entry.isIntersecting) {
        triggered = false
      }
    }, { root: scrollRoot, threshold: [0, 0.5, 1] })
    observer.observe(container)
    return () => observer.disconnect()
  }, [pipAvailable])

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        className="relative rounded-md bg-muted/50 mx-auto overflow-hidden"
        style={{ maxWidth: 240, aspectRatio: "9 / 16" }}
      >
        <video
          ref={videoRef}
          controls
          preload="metadata"
          src={url}
          playsInline
          onProgress={(e) => {
            // Не ждём полной загрузки и canPlay: как только в буфере есть
            // 10 секунд — прячем спиннер. UX становится мгновенным даже на
            // больших файлах (видео-визитки до 50 MB).
            const v = e.currentTarget
            if (v.buffered.length > 0 && v.buffered.end(0) >= 10) {
              setReady(true)
            }
          }}
          onCanPlay={(e) => {
            // Fallback для коротких видео (< 10s) — для них onProgress не
            // успеет дойти до порога. Заодно подменяем чёрный первый кадр
            // на живой через seek=0.5s (но только если юзер ещё не скрабил).
            const v = e.currentTarget
            if (!ready && v.duration > 1 && Number.isFinite(v.duration)) {
              v.currentTime = 0.5
            }
            setReady(true)
          }}
          className="block w-full h-full bg-black"
          style={{ objectFit: "cover" }}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 pointer-events-none">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        )}
        {pipAvailable && (
          <button
            type="button"
            onClick={togglePip}
            title="Картинка в картинке"
            className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-7 h-7 rounded-md bg-black/75 text-white ring-1 ring-white/30 hover:bg-black/90 transition-colors backdrop-blur-sm"
          >
            <PictureInPicture2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
      >
        Открыть в новой вкладке ({url})
      </a>
    </div>
  )
}

function MediaAnswerView({ media }: { media: MediaAnswer }) {
  // src на самом <video>/<audio> вместо <source type="..."> — браузер
  // сниффит mime по заголовкам ответа, что устойчивее к codec-строкам
  // вида "video/webm;codecs=vp8,opus".
  if (media.mediaType === "video") {
    return <VideoPlayer url={media.url} />
  }
  if (media.mediaType === "audio") {
    return (
      <audio
        controls
        preload="metadata"
        src={media.url}
        className="w-full"
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media.url} alt="Ответ кандидата" className="w-full rounded-md max-h-96 object-contain bg-muted" />
  )
}

function MediaList({ media }: { media: MediaAnswer | MediaAnswer[] }) {
  const items = Array.isArray(media) ? media : [media]
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      {items.map((m, i) => (
        <MediaAnswerView key={`${m.url}-${i}`} media={m} />
      ))}
    </div>
  )
}

function TaskAnswerView({ block, answer }: { block: Block; answer: Record<string, unknown> }) {
  const questions = Array.isArray(block.questions) ? block.questions : []
  if (questions.length === 0) {
    // Fallback — просто покажем JSON-ответ как пары ключ/значение
    return (
      <div className="space-y-1.5">
        {Object.entries(answer).map(([k, v], idx) => {
          const media = coerceMedia(v)
          // Технический ключ q-1778... HR-у не нужен — показываем
          // нейтральный «Ответ N» вместо. data-question-id оставляем
          // в DOM для дебага.
          const label = isTechnicalQuestionId(k) ? `Ответ ${idx + 1}` : k
          return (
            <div key={k} className="text-sm break-words" data-question-id={k}>
              <span className="text-muted-foreground">{label}: </span>
              {media ? (
                <div className="mt-1"><MediaList media={media} /></div>
              ) : (
                <span className="text-foreground whitespace-pre-wrap break-words">{String(v ?? "")}</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {questions.map((q: Question) => {
        const v = answer[q.id]
        const media = coerceMedia(v)
        const duration = !Array.isArray(media) && media && typeof v === "object" && v != null
          ? (v as { duration?: number }).duration
          : undefined
        const text = !media
          ? (v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? "" : String(v))
          : ""
        return (
          <div key={q.id} className="space-y-1" data-question-id={q.id}>
            <p className="text-xs font-medium text-foreground break-words">{humaniseQuestionLabel(q.text, "Вопрос")}</p>
            {media ? (
              <div className="space-y-1">
                <MediaList media={media} />
                {duration ? (
                  <p className="text-[10px] text-muted-foreground">{formatDuration(duration)}</p>
                ) : null}
              </div>
            ) : text.trim() ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{text}</p>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">нет ответа</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function pickFirstMediaType(media: MediaAnswer | MediaAnswer[]): MediaAnswer["mediaType"] {
  return Array.isArray(media) ? media[0].mediaType : media.mediaType
}

// Только блоки, в которые кандидат реально что-то отвечает: task (вопросы)
// и media (запись/загрузка). Все остальные — info/text/video/image/file/button —
// это просмотр контента, не ответ. Их в табе «Ответы» показывать не нужно.
const ANSWERABLE_BLOCK_TYPES = new Set<string>(["task", "media"])

// Сессия 7a: технические идентификаторы вопросов (q-1778750542831,
// q-..-0t, q-..-ky) HR-у в карточке не нужны. Если ничего человеческого
// нет — показываем нейтральный fallback вместо ID.
const TECH_QUESTION_ID_RE = /^q-\d+(?:-[a-z0-9]+)*$/i
function isTechnicalQuestionId(s: string | null | undefined): boolean {
  return typeof s === "string" && TECH_QUESTION_ID_RE.test(s)
}
function humaniseQuestionLabel(raw: string | null | undefined, fallback = "Вопрос"): string {
  if (!raw) return fallback
  if (isTechnicalQuestionId(raw)) return fallback
  return raw
}

function isViewMarkerOnly(answer: unknown): boolean {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false
  const o = answer as Record<string, unknown>
  // Если есть медиа или текстовые поля — это реальный ответ, не маркер просмотра.
  if (coerceMedia(o)) return false
  // Маркер «кандидат пролистал блок»: { viewed: true } и ничего полезного больше.
  const meaningfulKeys = Object.keys(o).filter(
    (k) => k !== "viewed" && k !== "viewedAt" && k !== "timeSpent"
  )
  return meaningfulKeys.length === 0
}

function EntryCard({ entry, blockMap }: { entry: AnketaEntry; blockMap: Map<string, BlockMapEntry> }) {
  // legacy: { question, answer } plain pair
  if ("question" in entry && typeof (entry as { question?: unknown }).question === "string") {
    const e = entry as { question: string; answer: unknown }
    const media = coerceMedia(e.answer)
    if (process.env.NODE_ENV !== "production" && !media && e.answer && typeof e.answer === "object") {
      console.log("[answers-tab] non-media object answer (legacy):", e.answer)
    }
    return (
      <div className="p-3 rounded-lg border border-border/60 bg-muted/40 space-y-1.5 min-w-0">
        <div className="flex items-start gap-1.5 text-xs font-medium text-foreground">
          <FileQuestion className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span className="break-words min-w-0">{e.question}</span>
        </div>
        {media ? (
          <MediaList media={media} />
        ) : typeof e.answer === "string" ? (
          e.answer.trim() ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{e.answer}</p>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">нет ответа</p>
          )
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">нет ответа</p>
        )}
      </div>
    )
  }

  const e = entry as { blockId?: string; answer?: unknown; answeredAt?: string }
  const blockId = typeof e.blockId === "string" ? e.blockId : ""

  // Skip the synthetic "completion" marker — он не несёт ответа.
  if (blockId === "__complete__") return null

  const ans = e.answer
  const mapped = blockMap.get(blockId)
  const lessonTitle = mapped?.lesson?.title || ""
  const block = mapped?.block

  // Технический blockId как fallback HR не нужен — лучше «Без названия».
  // Сам ID остаётся в DOM data-атрибуте для дебага.
  const headerTitle = block?.taskTitle || block?.taskDescription || lessonTitle || humaniseQuestionLabel(blockId, "Без названия")
  const directMedia = coerceMedia(ans)
  const Icon = directMedia
    ? (() => {
        const t = pickFirstMediaType(directMedia)
        return t === "video" ? VideoIcon : t === "audio" ? Mic : ImageIcon
      })()
    : FileText
  const answeredLabel = formatAnsweredAt(e.answeredAt)
  const directDuration = !Array.isArray(directMedia) && ans && typeof ans === "object"
    ? (ans as { duration?: number }).duration
    : undefined

  if (process.env.NODE_ENV !== "production" && !directMedia && ans && typeof ans === "object" && !block) {
    console.log("[answers-tab] non-media object answer (no block):", { blockId, answer: ans })
  }

  return (
    <div className="p-3 rounded-lg border border-border/60 bg-muted/40 space-y-2 min-w-0" data-block-id={blockId}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0">
          <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span className="text-xs font-medium text-foreground break-words min-w-0">{headerTitle}</span>
        </div>
        {answeredLabel && (
          <span className="text-[10px] text-muted-foreground shrink-0">{answeredLabel}</span>
        )}
      </div>

      {directMedia ? (
        <div className="space-y-1">
          <MediaList media={directMedia} />
          {directDuration ? (
            <p className="text-[10px] text-muted-foreground">{formatDuration(directDuration)}</p>
          ) : null}
        </div>
      ) : typeof ans === "string" ? (
        ans.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{ans}</p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">нет ответа</p>
        )
      ) : ans && typeof ans === "object" ? (
        block
          ? <TaskAnswerView block={block} answer={ans as Record<string, unknown>} />
          : <p className="text-xs text-muted-foreground/60 italic">нет ответа</p>
      ) : (
        <p className="text-xs text-muted-foreground/60 italic">нет ответа</p>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

function PrequalificationSection({ candidateId }: { candidateId?: string }) {
  const [data, setData] = useState<QualificationData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!candidateId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/modules/hr/candidates/${candidateId}/qualification`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setData(d as QualificationData) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [candidateId])

  // Если предкв не запускалась — раздел показываем как «не задействована»,
  // но компактно (одна строка). Это даёт HR понять «у этого кандидата
  // мидл-уровень не был, или ещё не дошло».
  if (loading) {
    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">Загружаем результат предквалификации…</p>
      </div>
    )
  }
  if (!data || !data.status || data.answers.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="text-sm font-medium mb-1">Предквалификация</p>
        <p className="text-xs text-muted-foreground">Не запускалась для этого кандидата.</p>
      </div>
    )
  }

  const critical = data.answers.filter(a => a.isCritical)
  const criticalPassed = critical.filter(a => a.aiVerdict === "passed").length
  const verdictBadge = (v: QualificationAnswer["aiVerdict"]) => {
    if (v === "passed") return <span className="text-[10px] inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">🟢 Подходит</span>
    if (v === "failed") return <span className="text-[10px] inline-flex items-center gap-1 bg-destructive/10 text-destructive border border-destructive/20 rounded px-1.5 py-0.5">🔴 Не подходит</span>
    if (v === "unclear") return <span className="text-[10px] inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">⚪ Неясно</span>
    return <span className="text-[10px] text-muted-foreground">Ожидаем ответ</span>
  }
  const summary = (() => {
    if (data.status === "passed")    return `AI-вердикт: подходит (${criticalPassed} из ${critical.length} критичных вопросов прошли)`
    if (data.status === "failed")    return "AI-вердикт: отказ"
    if (data.status === "no_answer") return "Кандидат не ответил в срок — отправили демо без квалификации"
    return "Ожидаем ответ кандидата"
  })()

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div>
        <p className="text-sm font-medium mb-0.5">Предквалификация</p>
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>
      <div className="space-y-2">
        {data.answers.map((a) => (
          <div key={a.id} className="rounded-md border bg-background p-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium break-words">
                {a.questionText}
                {a.isCritical && <span className="ml-1.5 text-[10px] text-destructive">★ критичный</span>}
              </p>
              {verdictBadge(a.aiVerdict)}
            </div>
            {a.answerText && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {a.answerText}
              </p>
            )}
            {a.aiReasoning && (
              <p className="text-[10px] text-muted-foreground/80 italic">AI: {a.aiReasoning}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnswersTab({ answers, demoLessons, candidateId }: AnswersTabProps) {
  const entries = normalizeEntries(answers).filter(Boolean)
  const blockMap = buildBlockMap(demoLessons)

  // Оставляем только реальные ответы кандидата: task/media-блоки и legacy-пары
  // {question, answer}. Маркеры просмотра (viewed: true для info/text/video/…)
  // и системные записи (__complete__) — отбрасываем.
  const visible = entries.filter((e) => {
    if (!e || typeof e !== "object") return false
    // legacy {question, answer} — всегда оставляем
    if ("question" in e && typeof (e as { question?: unknown }).question === "string") return true
    const blockId = "blockId" in e ? (e as { blockId?: string }).blockId : ""
    if (!blockId || blockId === "__complete__") return false
    const mapped = blockMap.get(blockId)
    // Если блок известен и он не отвечательный (info/text/video/image/file/button) — пропускаем
    if (mapped?.block?.type && !ANSWERABLE_BLOCK_TYPES.has(mapped.block.type)) return false
    // Если ответ — только { viewed: true } без полезных полей — пропускаем
    if (isViewMarkerOnly((e as { answer?: unknown }).answer)) return false
    return true
  })

  // Раздел «Предквалификация» (Сессия 9). Реальные ответы и AI-вердикт.
  const prequalSection = <PrequalificationSection candidateId={candidateId} />

  if (visible.length === 0) {
    return (
      <div className="space-y-3 min-w-0">
        {prequalSection}
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileQuestion className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm text-center">Кандидат пока не отвечал на вопросы</p>
        </div>
      </div>
    )
  }

  // space-y-3 для отступов; min-w-0 чтобы длинный контент не растягивал
  // ширину и не ломал вертикальный скролл родителя.
  return (
    <div className="space-y-4 min-w-0">
      {prequalSection}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Финальная анкета
        </p>
        <div className="space-y-3">
          {visible.map((entry, i) => (
            <EntryCard key={i} entry={entry} blockMap={blockMap} />
          ))}
        </div>
      </div>
    </div>
  )
}
