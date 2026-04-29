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
  if (media.mediaType === "video") {
    return (
      <video controls preload="metadata" className="w-full rounded-md bg-black aspect-video">
        <source src={media.url} type={media.mime || "video/webm"} />
      </video>
    )
  }
  if (media.mediaType === "audio") {
    return (
      <audio controls preload="metadata" className="w-full">
        <source src={media.url} type={media.mime || "audio/webm"} />
      </audio>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media.url} alt="Ответ кандидата" className="w-full rounded-md max-h-96 object-contain bg-muted" />
  )
}

function TaskAnswerView({ block, answer }: { block: Block; answer: Record<string, unknown> }) {
  const questions = Array.isArray(block.questions) ? block.questions : []
  if (questions.length === 0) {
    // Fallback — просто покажем JSON-ответ как пары ключ/значение
    return (
      <div className="space-y-1.5">
        {Object.entries(answer).map(([k, v]) => (
          <div key={k} className="text-sm break-words">
            <span className="text-muted-foreground">{k}: </span>
            {isMediaAnswer(v) ? (
              <div className="mt-1"><MediaAnswerView media={v} /></div>
            ) : (
              <span className="text-foreground whitespace-pre-wrap break-words">{String(v ?? "")}</span>
            )}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {questions.map((q: Question) => {
        const v = answer[q.id]
        const isMedia = isMediaAnswer(v)
        const text = !isMedia
          ? (v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? "" : String(v))
          : ""
        return (
          <div key={q.id} className="space-y-1">
            <p className="text-xs font-medium text-foreground break-words">{q.text || q.id}</p>
            {isMedia ? (
              <div className="space-y-1">
                <MediaAnswerView media={v} />
                {v.duration ? (
                  <p className="text-[10px] text-muted-foreground">{formatDuration(v.duration)}</p>
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

function EntryCard({ entry, blockMap }: { entry: AnketaEntry; blockMap: Map<string, BlockMapEntry> }) {
  // legacy: { question, answer } plain pair
  if ("question" in entry && typeof (entry as { question?: unknown }).question === "string") {
    const e = entry as { question: string; answer: unknown }
    const isMedia = isMediaAnswer(e.answer)
    return (
      <div className="p-3 rounded-lg border border-border/60 bg-muted/40 space-y-1.5 min-w-0">
        <div className="flex items-start gap-1.5 text-xs font-medium text-foreground">
          <FileQuestion className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span className="break-words min-w-0">{e.question}</span>
        </div>
        {isMedia ? (
          <MediaAnswerView media={e.answer as MediaAnswer} />
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
  const Icon = isMediaAnswer(ans)
    ? (ans.mediaType === "video" ? VideoIcon : ans.mediaType === "audio" ? Mic : ImageIcon)
    : FileText
  const answeredLabel = formatAnsweredAt(e.answeredAt)

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

      {isMediaAnswer(ans) ? (
        <div className="space-y-1">
          <MediaAnswerView media={ans} />
          {ans.duration ? (
            <p className="text-[10px] text-muted-foreground">{formatDuration(ans.duration)}</p>
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

  return (
    <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1 -mr-1">
      {visible.map((entry, i) => (
        <EntryCard key={i} entry={entry} blockMap={blockMap} />
      ))}
    </div>
  )
}
