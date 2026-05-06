"use client"

import { AlertCircle, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { getVideoEmbedInfo } from "@/lib/video/embed"

interface VideoEmbedProps {
  url:        string
  title?:     string
  className?: string
}

// Универсальный плеер — определяет провайдера и рендерит iframe или <video>.
// Контейнер всегда aspect-video, min-height 240px на мобильных.
export function VideoEmbed({ url, title, className }: VideoEmbedProps) {
  const info = getVideoEmbedInfo(url)

  const wrapperClass = cn(
    "relative w-full aspect-video min-h-[240px] overflow-hidden rounded-lg bg-black",
    className,
  )

  if (info.directUrl) {
    return (
      <div className={wrapperClass}>
        <video
          src={info.directUrl}
          controls
          className="absolute inset-0 w-full h-full object-contain"
          title={title}
        />
      </div>
    )
  }

  if (info.embedUrl) {
    return (
      <>
        <div className={wrapperClass}>
          <iframe
            src={info.embedUrl}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={title ?? "video"}
          />
        </div>
        {info.provider === "yandex_disk" && (
          <p className="mt-1.5 text-[11px] text-muted-foreground italic">
            Если видео не загружается — публикуйте через YouTube/RuTube
          </p>
        )}
      </>
    )
  }

  // unknown — показываем подсказку и кнопку открыть в новой вкладке
  return (
    <div
      className={cn(
        "w-full min-h-[180px] rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4",
        "flex flex-col items-center justify-center gap-2 text-center",
        className,
      )}
    >
      <AlertCircle className="w-5 h-5 text-amber-600" />
      <p className="text-sm font-medium text-amber-900">Не удалось определить тип видео</p>
      {info.originalUrl && (
        <a
          href={info.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 underline underline-offset-2"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Открыть в новой вкладке
        </a>
      )}
    </div>
  )
}
