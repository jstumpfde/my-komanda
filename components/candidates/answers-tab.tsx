"use client"

import { Video as VideoIcon, Mic, Image as ImageIcon, FileText, FileQuestion } from "lucide-react"
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

function MediaAnswerView({ media }: { media: MediaAnswer }) {
  // src на самом <video>/<audio> вместо <source type="..."> — браузер
  // сниффит mime по заголовкам ответа, что устойчивее к codec-строкам
  // вида "video/webm;codecs=vp8,opus".
  if (media.mediaType === "video") {
    return (
      <div className="space-y-1">
        <video
          controls
          preload="metadata"
          src={media.url}
          playsInline
          className="w-full rounded-md bg-black max-h-[400px] object-contain"
        />
        <a
          href={media.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
        >
          Открыть в новой вкладке ({media.url})
        </a>
      </div>
    )
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
        {Object.entries(answer).map(([k, v]) => {
          const media = coerceMedia(v)
          return (
            <div key={k} className="text-sm break-words">
              <span className="text-muted-foreground">{k}: </span>
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
          <div key={q.id} className="space-y-1">
            <p className="text-xs font-medium text-foreground break-words">{q.text || q.id}</p>
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
              <p className="text-xs text-muted-foreground/60 italic">Не отвечено</p>
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
            <p className="text-xs text-muted-foreground/60 italic">Не отвечено</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
            {JSON.stringify(e.answer)}
          </p>
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

  const headerTitle = block?.taskTitle || block?.taskDescription || lessonTitle || blockId
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
    <div className="p-3 rounded-lg border border-border/60 bg-muted/40 space-y-2 min-w-0">
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
          <p className="text-xs text-muted-foreground/60 italic">Не отвечено</p>
        )
      ) : ans && typeof ans === "object" ? (
        block
          ? <TaskAnswerView block={block} answer={ans as Record<string, unknown>} />
          : (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(ans, null, 2)}
            </pre>
          )
      ) : (
        <p className="text-xs text-muted-foreground/60 italic">Не отвечено</p>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function AnswersTab({ answers, demoLessons }: AnswersTabProps) {
  const entries = normalizeEntries(answers).filter(Boolean)
  const blockMap = buildBlockMap(demoLessons)

  // Скрываем завершающий маркер из общего количества
  const visible = entries.filter((e) => {
    if (!e || typeof e !== "object") return false
    if ("blockId" in e && (e as { blockId?: string }).blockId === "__complete__") return false
    return true
  })

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileQuestion className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm text-center">Кандидат пока не отвечал на вопросы</p>
      </div>
    )
  }

  // space-y-3 для отступов; min-w-0 чтобы длинный контент не растягивал
  // ширину и не ломал вертикальный скролл родителя.
  return (
    <div className="space-y-3 min-w-0">
      {visible.map((entry, i) => (
        <EntryCard key={i} entry={entry} blockMap={blockMap} />
      ))}
    </div>
  )
}
