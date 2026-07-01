"use client"

import { useEffect, useRef, useState } from "react"
import { Video as VideoIcon, Mic, Image as ImageIcon, FileText, FileQuestion, Loader2, PictureInPicture2 } from "lucide-react"
import { AiScoreBadge } from "@/components/dashboard/ai-score-badge"
import { cn } from "@/lib/utils"
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
  /** Балл по ответам демо (candidates.demo_answers_score) — оценка первого блока. */
  aiScore?: number | null
  /** Поразбивка по вопросам (candidates.demo_answers_details). */
  answersDetails?: { questionText: string; awarded: number; max: number; comment: string }[] | null
  /** Балл теста (candidates.test_score) — оценка блока-теста (напр. «Путь менеджера»). */
  testScore?: number | null
}

/** Цвет бейджа оценки — как в списке кандидатов (>70 зелёный, ≥40 янтарь, <40 красный). */
function scoreBadgeClass(score: number): string {
  if (score > 70) return "bg-success/10 text-success border-success/20"
  if (score >= 40) return "bg-warning/10 text-warning border-warning/20"
  return "bg-destructive/10 text-destructive border-destructive/20"
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
  demoTitle: string   // имя контент-блока (title демо) — заголовок группы в анкете
  demoOrder: number   // порядок демо (sortOrder) для сортировки групп
}

function buildBlockMap(demoLessons: unknown): Map<string, BlockMapEntry> {
  const map = new Map<string, BlockMapEntry>()
  if (!Array.isArray(demoLessons)) return map

  // Форматы demoLessons:
  //   - [{ title, lessons: [...] }, ...]  — НОВЫЙ (json_build_object per демо, с именем блока)
  //   - [[lesson, ...], ...]              — старый json_agg массивов
  //   - [lesson, ...]                     — совсем старый плоский
  demoLessons.forEach((demoEntry, demoOrder) => {
    let demoTitle = ""
    let lessons: unknown[] = []
    if (demoEntry && typeof demoEntry === "object" && !Array.isArray(demoEntry) && "lessons" in demoEntry) {
      const de = demoEntry as { title?: unknown; lessons?: unknown }
      demoTitle = typeof de.title === "string" ? de.title : ""
      lessons = Array.isArray(de.lessons) ? de.lessons : []
    } else if (Array.isArray(demoEntry)) {
      lessons = demoEntry
    } else {
      lessons = [demoEntry]
    }
    for (const l of lessons as Lesson[]) {
      if (!l || !Array.isArray(l.blocks)) continue
      for (const b of l.blocks) {
        if (b && typeof b.id === "string") map.set(b.id, { block: b, lesson: l, demoTitle, demoOrder })
      }
    }
  })
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
  // Кадр-обложка: подменяем чёрный первый кадр на живой с ~15-й секунды.
  const posterAppliedRef = useRef(false)
  const startedRef = useRef(false)
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
            // на живой КАДР-ОБЛОЖКУ с ~15-й секунды (или с середины для коротких).
            // Играть будем с начала — сброс в onPlay.
            const v = e.currentTarget
            if (!posterAppliedRef.current && !startedRef.current && v.duration > 1 && Number.isFinite(v.duration)) {
              posterAppliedRef.current = true
              v.currentTime = Math.min(15, v.duration / 2)
            }
            setReady(true)
          }}
          onPlay={(e) => {
            // Первый запуск — играем с начала, а не с кадра-обложки (15с).
            const v = e.currentTarget
            if (!startedRef.current) {
              startedRef.current = true
              if (posterAppliedRef.current) v.currentTime = 0
            }
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
          ? (v == null ? ""
              : Array.isArray(v) ? v.join(", ")
              : typeof v === "object" ? ""
              : (() => {
                  const s = String(v)
                  // multiple-choice ответы хранятся через ||| — показываем через запятую
                  return s.includes("|||") ? s.split("|||").filter(Boolean).join(", ") : s
                })())
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

// F4: видео-интервью — субключи вида "<blockId>_vi_<idx>".
const VIDEO_INTERVIEW_SUB_RE = /^(.+)_vi_(\d+)$/
function parseVideoInterviewKey(blockId: string): { baseId: string; idx: number } | null {
  const m = VIDEO_INTERVIEW_SUB_RE.exec(blockId)
  if (!m) return null
  return { baseId: m[1], idx: parseInt(m[2], 10) }
}

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

// F4: карточка одного видео-ответа на вопрос интервью.
// Отображается в сгруппированной секции «Видео-интервью».
function VideoInterviewEntryCard({ entry, label }: { entry: AnketaEntry; label: string }) {
  const e = entry as { blockId?: string; answer?: unknown; answeredAt?: string }
  const ans = e.answer
  const media = coerceMedia(ans)
  const answeredLabel = formatAnsweredAt(e.answeredAt)
  const directDuration = !Array.isArray(media) && ans && typeof ans === "object"
    ? (ans as { duration?: number }).duration
    : undefined

  return (
    <div className="p-3 rounded-lg border border-border/60 bg-muted/40 space-y-2 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0">
          <VideoIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span className="text-xs font-medium text-foreground break-words min-w-0">{label}</span>
        </div>
        {answeredLabel && (
          <span className="text-[10px] text-muted-foreground shrink-0">{answeredLabel}</span>
        )}
      </div>
      {media ? (
        <div className="space-y-1">
          <MediaList media={media} />
          {directDuration ? (
            <p className="text-[10px] text-muted-foreground">{formatDuration(directDuration)}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/60 italic">нет ответа</p>
      )}
    </div>
  )
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
          : (() => {
              // Блок не найден в карте (демо обновилось/id изменился), но ответы есть —
              // рендерим пары ключ→значение, технические q-... ключи подписываем «Ответ N».
              const pairs = Object.entries(ans as Record<string, unknown>).filter(([, v]) => v != null && v !== "")
              if (pairs.length === 0) return <p className="text-xs text-muted-foreground/60 italic">нет ответа</p>
              return (
                <div className="space-y-1.5">
                  {pairs.map(([k, v], idx) => {
                    const media = coerceMedia(v)
                    // Значения, разделённые ||| — множественный выбор (multiple-choice).
                    const textVal = typeof v === "string" && v.includes("|||")
                      ? v.split("|||").filter(Boolean).join(", ")
                      : typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : String(v ?? "")
                    const label = isTechnicalQuestionId(k) ? `Ответ ${idx + 1}` : k
                    return (
                      <div key={k} className="text-sm break-words" data-question-id={k}>
                        <span className="text-xs font-medium text-foreground">{label}: </span>
                        {media ? (
                          <div className="mt-1"><MediaList media={media} /></div>
                        ) : (
                          <span className="text-muted-foreground whitespace-pre-wrap break-words">{textVal}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()
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

  // Если предкв не запускалась — раздел не показываем совсем.
  // «Не запускалась» — информация для HR избыточна и путает.
  if (loading) {
    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">Загружаем результат предквалификации…</p>
      </div>
    )
  }
  if (!data || !data.status || data.answers.length === 0) {
    // Предквалификация не применялась к этому кандидату — скрываем раздел.
    return null
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

/** Есть ли в ответе медиа (видео-визитка / аудио / фото). Такие ответы идут
 *  ВНИЗУ своего блока (после текстовых), решение Юрия 01.07. */
function entryHasMedia(entry: AnketaEntry): boolean {
  const media = coerceMedia((entry as { answer?: unknown }).answer)
  if (!media) return false
  return Array.isArray(media) ? media.length > 0 : true
}

export function AnswersTab({ answers, demoLessons, candidateId, aiScore, answersDetails, testScore }: AnswersTabProps) {
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
    // F4: видео-интервью субключи (_vi_N) — это медиа-ответы, всегда показываем
    if (parseVideoInterviewKey(blockId)) {
      if (isViewMarkerOnly((e as { answer?: unknown }).answer)) return false
      return true
    }
    const mapped = blockMap.get(blockId)
    // Если блок известен и он не отвечательный (info/text/video/image/file/button) — пропускаем
    if (mapped?.block?.type && !ANSWERABLE_BLOCK_TYPES.has(mapped.block.type)) return false
    // Если ответ — только { viewed: true } без полезных полей — пропускаем
    if (isViewMarkerOnly((e as { answer?: unknown }).answer)) return false
    return true
  })

  // Раздел «Предквалификация» (Сессия 9). Реальные ответы и AI-вердикт.
  const prequalSection = <PrequalificationSection candidateId={candidateId} />

  // Группировка по КОНТЕНТ-БЛОКАМ (демо): заголовок группы = имя блока из «Контента»
  // (title демо), группы в порядке sortOrder. Внутри блока — сначала текстовые
  // ответы (как отвечал), затем медиа (видео-визитка/аудио/фото) — ВНИЗУ своего
  // блока (Юрий 01.07). Видео-интервью _vi_N считаем медиа и резолвим по baseId.
  interface DemoGroup { title: string; order: number; text: AnketaEntry[]; media: AnketaEntry[] }
  const groupsByKey = new Map<string, DemoGroup>()
  for (const e of visible) {
    const rawBlockId = "blockId" in (e as object) ? (e as { blockId?: string }).blockId ?? "" : ""
    const viKey = parseVideoInterviewKey(rawBlockId)
    const effectiveBlockId = viKey ? viKey.baseId : rawBlockId
    const mapped = blockMap.get(effectiveBlockId)
    const order = mapped?.demoOrder ?? 999
    const title = mapped?.demoTitle || "Ответы"
    const key = `${order}:::${title}`
    let g = groupsByKey.get(key)
    if (!g) { g = { title, order, text: [], media: [] }; groupsByKey.set(key, g) }
    if (viKey || entryHasMedia(e)) g.media.push(e)
    else g.text.push(e)
  }
  // Медиа внутри блока: _vi_N по порядку idx, остальные — как есть.
  for (const g of groupsByKey.values()) {
    g.media.sort((a, b) => {
      const ai = parseVideoInterviewKey((a as { blockId?: string }).blockId ?? "")?.idx ?? 0
      const bi = parseVideoInterviewKey((b as { blockId?: string }).blockId ?? "")?.idx ?? 0
      return ai - bi
    })
  }
  const orderedGroups = [...groupsByKey.values()].sort((a, b) => a.order - b.order)

  // Бэдж общей AI-оценки за ответы демо (зелёный ≥70, жёлтый ≥40, красный <40)
  // + поразбивка по вопросам из demo_answers_details (если есть).
  const scoreBadge = aiScore != null ? (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">AI-оценка ответов</span>
        <span className={cn("inline-flex items-center justify-center rounded-md border font-bold px-2.5 h-8 min-w-[2.5rem] text-base", scoreBadgeClass(aiScore!))}>{aiScore}</span>
      </div>
      {Array.isArray(answersDetails) && answersDetails.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
          {answersDetails.map((d, i) => (
            <div key={i} className="text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="text-foreground/90 min-w-0">{d.questionText}</span>
                <span className="shrink-0 font-semibold text-muted-foreground tabular-nums">
                  {d.awarded} / {d.max}
                </span>
              </div>
              {d.comment && <p className="text-muted-foreground mt-0.5">{d.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null

  if (visible.length === 0) {
    return (
      <div className="space-y-3 min-w-0">
        {scoreBadge}
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
      {scoreBadge}
      {prequalSection}

      {/* Ответы сгруппированы по КОНТЕНТ-БЛОКАМ (демо). Заголовок группы = имя блока
          из «Контента» (title демо). Внутри блока: текстовые ответы сверху, затем
          медиа (видео-визитка/аудио/фото) — ВНИЗУ своего блока (Юрий 01.07). */}
      {orderedGroups.map((g, gi) => {
        // Оценка блока в шапке: блок 1 — сверху (общий scoreBadge); последний блок
        // (блок-тест, напр. «Путь менеджера») — его test_score. Цвет как в списке.
        // 2-балльная модель (анкета + тест); per-block scoring для N блоков — отдельно.
        const headerScore = orderedGroups.length > 1 && gi === orderedGroups.length - 1 ? testScore : null
        return (
        <div key={`grp-${gi}`} className="space-y-2 mt-8 pt-6 border-t border-border/60 first:mt-0 first:pt-0 first:border-t-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{g.title}</p>
            {headerScore != null && (
              <span className={cn("inline-flex items-center justify-center rounded-md border font-bold px-2 h-6 min-w-[2rem] text-sm", scoreBadgeClass(headerScore))}>{headerScore}</span>
            )}
          </div>
          <div className="space-y-3">
            {g.text.map((entry, i) => (
              <EntryCard key={`t-${i}`} entry={entry} blockMap={blockMap} />
            ))}
            {g.media.map((entry, i) => {
              const bid = (entry as { blockId?: string }).blockId ?? ""
              const viKey = parseVideoInterviewKey(bid)
              return viKey
                ? <VideoInterviewEntryCard key={`m-${i}`} entry={entry} label={`Вопрос ${viKey.idx + 1}`} />
                : <EntryCard key={`m-${i}`} entry={entry} blockMap={blockMap} />
            })}
          </div>
        </div>
        )
      })}
    </div>
  )
}
