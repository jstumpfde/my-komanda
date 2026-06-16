"use client"

import { useEffect, useRef, useState } from "react"
import type { MouseEvent as ReactMouseEvent } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

interface CandidateAvatarProps {
  candidateId: string
  name: string
  photoUrl?: string | null
  colorFrom: string
  colorTo: string
  /** Клик по аватару открывает увеличенный просмотр по центру с ФИО. По умолчанию включено. */
  zoomable?: boolean
}

export function CandidateAvatar({ candidateId, name, photoUrl, colorFrom, colorTo, zoomable = true }: CandidateAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  // Если onLoad успел подменить URL на локальный — используем его.
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  // Защита от повторного POST'а на ту же hh-ссылку при ре-рендере / повторном onLoad.
  const savedRef = useRef<string | null>(null)

  const effective = localUrl ?? photoUrl
  const showPhoto = effective && !imgFailed

  const handleLoad = async () => {
    if (!photoUrl) return
    if (!photoUrl.startsWith("https://img.hhcdn.ru/")) return
    if (savedRef.current === photoUrl) return
    savedRef.current = photoUrl
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/save-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl }),
      })
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { localUrl?: string } | null
        if (data?.localUrl) setLocalUrl(data.localUrl)
      }
    } catch {
      // молча — это opportunistic backfill, основная функциональность не страдает
    }
  }

  // Esc закрывает просмотр, тело страницы не скроллится под оверлеем.
  useEffect(() => {
    if (!zoomOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomOpen(false) }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [zoomOpen])

  // stopPropagation — чтобы клик по аватару не открывал заодно профиль кандидата
  // (карточка/строка/тайл сами по себе кликабельны).
  const openZoom = (e: ReactMouseEvent) => {
    if (!zoomable) return
    e.stopPropagation()
    e.preventDefault()
    setZoomOpen(true)
  }

  const trigger = showPhoto ? (
    <img
      src={effective}
      alt={name}
      className={`w-7 h-7 rounded-full flex-shrink-0 object-cover${zoomable ? " cursor-zoom-in" : ""}`}
      referrerPolicy="no-referrer"
      onLoad={handleLoad}
      onError={() => setImgFailed(true)}
      onClick={zoomable ? openZoom : undefined}
    />
  ) : (
    <div
      className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold${zoomable ? " cursor-zoom-in" : ""}`}
      style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}
      onClick={zoomable ? openZoom : undefined}
    >
      {name.charAt(0)}
    </div>
  )

  return (
    <>
      {trigger}
      {zoomOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => { e.stopPropagation(); setZoomOpen(false) }}
          role="dialog"
          aria-modal="true"
          aria-label={`Фото кандидата: ${name}`}
        >
          <div className="relative flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomOpen(false)}
              className="absolute -top-3 -right-3 rounded-full bg-white/90 p-1.5 text-black shadow-lg transition hover:bg-white"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
            {showPhoto ? (
              <img
                src={effective}
                alt={name}
                referrerPolicy="no-referrer"
                className="max-w-[90vw] max-h-[80vh] rounded-2xl object-contain shadow-2xl"
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-3xl text-white font-bold shadow-2xl"
                style={{
                  width: "min(60vw, 320px)",
                  height: "min(60vw, 320px)",
                  fontSize: "min(24vw, 128px)",
                  background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})`,
                }}
              >
                {name.charAt(0)}
              </div>
            )}
            <p className="max-w-[90vw] text-center text-lg font-semibold text-white drop-shadow">{name}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
