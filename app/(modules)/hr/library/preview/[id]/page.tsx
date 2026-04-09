"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, X, Loader2, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Block, Lesson } from "@/lib/course-types"

// ─── Video embed detection (simplified copy) ─────────────────────────────────

function detectVideoEmbed(url: string): { embedUrl: string; service: string } | null {
  if (!url) return null
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`, service: "YouTube" }
  // RuTube
  const rtMatch = url.match(/rutube\.ru\/video\/([a-f0-9]+)/)
  if (rtMatch) return { embedUrl: `https://rutube.ru/play/embed/${rtMatch[1]}`, service: "RuTube" }
  // VK
  const vkMatch = url.match(/vk\.com\/video(-?\d+)_(\d+)/)
  if (vkMatch) return { embedUrl: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}`, service: "VK" }
  return null
}

function sizeToWidth(size: "S" | "M" | "L" | undefined): string {
  if (size === "S") return "50%"
  if (size === "M") return "75%"
  return "100%"
}

// ─── Preview block renderer ──────────────────────────────────────────────────

function PreviewBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "text": {
      const html = block.content?.trim()
      if (!html || html === "<br>") return null
      return <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: html }} />
    }
    case "image": {
      if (!block.imageUrl) return null
      const imgSize = block.imageSize || "L"
      return (
        <div style={{ width: sizeToWidth(imgSize), margin: imgSize !== "L" ? "0 auto" : undefined }}>
          {block.imageTitleTop && <div className="text-xs text-muted-foreground italic mb-1" dangerouslySetInnerHTML={{ __html: block.imageTitleTop }} />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.imageUrl} alt="" className="w-full max-w-full object-cover" />
          {block.imageCaption && <div className="text-xs text-muted-foreground italic mt-1" dangerouslySetInnerHTML={{ __html: block.imageCaption }} />}
        </div>
      )
    }
    case "video": {
      if (!block.videoUrl) return null
      const embed = detectVideoEmbed(block.videoUrl)
      const vidSize = block.videoSize || "L"
      return (
        <div style={{ width: sizeToWidth(vidSize), margin: vidSize !== "L" ? "0 auto" : undefined }}>
          {block.videoTitleTop && <div className="text-xs text-muted-foreground italic mb-1" dangerouslySetInnerHTML={{ __html: block.videoTitleTop }} />}
          <div className="aspect-video bg-black overflow-hidden rounded-xl">
            {embed ? (
              <iframe src={embed.embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="video" />
            ) : (
              <video src={block.videoUrl} controls className="w-full h-full object-contain" />
            )}
          </div>
          {block.videoCaption && <div className="text-xs text-muted-foreground italic mt-1" dangerouslySetInnerHTML={{ __html: block.videoCaption }} />}
        </div>
      )
    }
    case "audio": {
      if (!block.audioUrl) return null
      return (
        <div>
          {block.audioTitle && <p className="text-xs font-medium mb-1">{block.audioTitle}</p>}
          <audio src={block.audioUrl} controls className="w-full" />
          {block.audioCaption && <p className="text-xs text-muted-foreground italic mt-1">{block.audioCaption}</p>}
        </div>
      )
    }
    case "file": {
      if (!block.fileUrl) return null
      return (
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border">
          <FileText className="w-7 h-7 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{block.fileName || "Файл"}</p>
            <a href={block.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Открыть</a>
          </div>
        </div>
      )
    }
    case "info": {
      if (!block.content?.trim()) return null
      const styleColorMap: Record<string, string> = { info: "#3b82f6", success: "#22c55e", warning: "#f97316", error: "#ef4444" }
      const color = block.infoColor || styleColorMap[block.infoStyle] || "#3b82f6"
      const icon = block.infoIcon || "!"
      return (
        <div className="flex gap-3 items-start" style={{ borderLeft: `4px solid ${color}`, background: `${color}1A`, borderRadius: 8, padding: 16 }}>
          <div className="flex-shrink-0 font-bold leading-none mt-0.5" style={{ fontSize: 48, color, minWidth: 52 }}>{icon}</div>
          <div className="flex-1 min-w-0 text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: block.content }} />
        </div>
      )
    }
    case "button": {
      if (!block.buttonText?.trim()) return null
      return (
        <div className="flex justify-center">
          <a href={block.buttonUrl || "#"} target="_blank" rel="noopener noreferrer"
            className={cn("inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-colors",
              block.buttonVariant === "outline" ? "border-2 border-primary text-primary hover:bg-primary/10" : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            style={block.buttonColor ? { backgroundColor: block.buttonColor, borderColor: block.buttonColor, color: "#fff" } : undefined}
          >
            {block.buttonText}
          </a>
        </div>
      )
    }
    default: return null
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const params = useParams()
  const id = params.id as string

  const [lessons, setLessons] = useState<Lesson[]>([])
  const [templateName, setTemplateName] = useState("")
  const [loading, setLoading] = useState(true)
  const [lessonIdx, setLessonIdx] = useState(0)

  useEffect(() => {
    fetch(`/api/demo-templates/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const tmpl = data.data ?? data
        setTemplateName(tmpl.name || "")
        const ls = Array.isArray(tmpl.sections) ? tmpl.sections : []
        setLessons(ls)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
      </div>
    )
  }

  if (lessons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-muted-foreground gap-3">
        <p>Шаблон не найден или пустой</p>
        <Button variant="outline" onClick={() => window.close()}>Закрыть</Button>
      </div>
    )
  }

  const lesson = lessons[lessonIdx]
  const pct = ((lessonIdx + 1) / lessons.length) * 100

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs shrink-0" onClick={() => window.close()}>
            <ChevronLeft className="w-3.5 h-3.5" />Закрыть
          </Button>
          <span className="text-sm font-medium truncate max-w-md text-center flex-1">{templateName}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">Предпросмотр</Badge>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto py-8 px-6">
        {/* Progress */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{lessonIdx + 1} / {lessons.length}</span>
        </div>

        {/* Lesson card */}
        <div className="bg-card rounded-2xl border p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">{lesson.emoji}</span>
            <h1 className="text-2xl font-bold">{lesson.title}</h1>
          </div>
          <div className="space-y-5">
            {lesson.blocks.map((block: Block) => (
              <PreviewBlock key={block.id} block={block} />
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" disabled={lessonIdx === 0} onClick={() => setLessonIdx(lessonIdx - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" />Назад
          </Button>
          {lessonIdx < lessons.length - 1 ? (
            <Button onClick={() => setLessonIdx(lessonIdx + 1)}>
              Далее<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={() => window.close()}>Завершить</Button>
          )}
        </div>
      </div>
    </div>
  )
}
