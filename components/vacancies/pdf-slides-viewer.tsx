"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Download } from "lucide-react"
import { cn } from "@/lib/utils"

// Встроенный слайдер PDF-презентации. Получает уже растеризованные на сервере
// картинки-страницы (pages) — поэтому отображение 100% точное, как в исходном
// PDF. Адаптивен: ПК (стрелки/колесо/двойной клик) и мобила (свайп/щипок/
// двойной тап). Листание полистно влево/вправо; по достижении последнего слайда
// зовётся onReachedEnd (используется для разблокировки шага «Далее» в воронке).

export interface PdfSlidesViewerProps {
  pages: string[]
  aspect?: number            // ширина/высота страницы (дефолт 16/9)
  brandColor?: string
  onReachedEnd?: () => void
  fileName?: string
  allowDownload?: boolean
  pdfUrl?: string
  caption?: string
  className?: string
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function PdfSlidesViewer({
  pages,
  aspect = 16 / 9,
  brandColor = "#1d9bf0",
  onReachedEnd,
  fileName,
  allowDownload,
  pdfUrl,
  caption,
  className,
}: PdfSlidesViewerProps) {
  const total = pages.length
  const [idx, setIdx] = useState(0)
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 })
  const zRef = useRef(z)
  zRef.current = z
  const [fs, setFs] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const reachedEnd = useRef(false)

  const fireEndIfLast = useCallback((n: number) => {
    if (n >= total - 1 && !reachedEnd.current) {
      reachedEnd.current = true
      onReachedEnd?.()
    }
  }, [total, onReachedEnd])

  // Если в презентации одна страница — конец достигнут сразу.
  useEffect(() => { fireEndIfLast(idx) }, [idx, fireEndIfLast])

  const go = useCallback((n: number) => {
    const next = clamp(n, 0, total - 1)
    setZ({ s: 1, x: 0, y: 0 })
    setIdx(next)
    fireEndIfLast(next)
  }, [total, fireEndIfLast])

  const next = useCallback(() => go(idx + 1), [go, idx])
  const prev = useCallback(() => go(idx - 1), [go, idx])

  // ─── Зум / панорама ───────────────────────────────────────────────────────
  const clampPan = useCallback((s: number, x: number, y: number) => {
    const r = frameRef.current?.getBoundingClientRect()
    if (!r) return { x, y }
    const mx = (s - 1) * r.width / 2, my = (s - 1) * r.height / 2
    return { x: clamp(x, -mx, mx), y: clamp(y, -my, my) }
  }, [])

  const zoomToPoint = useCallback((target: number, cx: number, cy: number) => {
    const r = frameRef.current?.getBoundingClientRect()
    if (!r) return
    const px = cx - (r.left + r.width / 2), py = cy - (r.top + r.height / 2)
    setZ((cur) => {
      const nx = px - target * (px - cur.x) / cur.s
      const ny = py - target * (py - cur.y) / cur.s
      const p = clampPan(target, nx, ny)
      return { s: target, x: p.x, y: p.y }
    })
  }, [clampPan])

  const resetZoom = useCallback(() => setZ({ s: 1, x: 0, y: 0 }), [])

  // ─── Жесты (touch) ────────────────────────────────────────────────────────
  const pinch = useRef<{ d: number; s: number; x: number; y: number; fx: number; fy: number } | null>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const tap = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null)
  const lastTap = useRef(0)

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1]
      const r = frameRef.current!.getBoundingClientRect()
      const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2
      pinch.current = {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        s: z.s, x: z.x, y: z.y,
        fx: mx - (r.left + r.width / 2), fy: my - (r.top + r.height / 2),
      }
      drag.current = null; tap.current = null
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      tap.current = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false }
      drag.current = z.s > 1.01 ? { x: t.clientX, y: t.clientY, ox: z.x, oy: z.y } : null
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (pinch.current && e.touches.length === 2) {
      // preventDefault не нужен — на кадре стоит touch-action:none
      const a = e.touches[0], b = e.touches[1]
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const p = pinch.current
      const ns = clamp(p.s * d / p.d, 1, 4)
      const nx = p.fx - ns * (p.fx - p.x) / p.s
      const ny = p.fy - ns * (p.fy - p.y) / p.s
      const cp = clampPan(ns, nx, ny)
      setZ({ s: ns, x: cp.x, y: cp.y })
    } else if (drag.current && e.touches.length === 1) {
      const t = e.touches[0]
      const cp = clampPan(z.s, drag.current.ox + (t.clientX - drag.current.x), drag.current.oy + (t.clientY - drag.current.y))
      setZ((cur) => ({ s: cur.s, x: cp.x, y: cp.y }))
      if (tap.current) tap.current.moved = true
    } else if (tap.current && e.touches.length === 1) {
      const t = e.touches[0]
      if (Math.abs(t.clientX - tap.current.x) > 10 || Math.abs(t.clientY - tap.current.y) > 10) tap.current.moved = true
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (pinch.current && e.touches.length < 2) {
      pinch.current = null
      if (z.s < 1.03) resetZoom()
    }
    if (drag.current && e.touches.length === 0) drag.current = null
    if (tap.current && e.touches.length === 0) {
      const c = e.changedTouches[0]
      const dx = c.clientX - tap.current.x, dy = c.clientY - tap.current.y
      const dt = Date.now() - tap.current.t
      if (!tap.current.moved && dt < 300) {
        const now = Date.now()
        if (now - lastTap.current < 300) {
          if (z.s > 1.01) resetZoom(); else zoomToPoint(2.5, c.clientX, c.clientY)
          lastTap.current = 0
        } else lastTap.current = now
      } else if (z.s <= 1.01 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) next(); else prev()
      }
      tap.current = null
    }
  }

  // ─── Жесты (мышь / десктоп) ───────────────────────────────────────────────
  const mdrag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  // Колесо — нативный НЕпассивный слушатель, чтобы preventDefault не ругался
  // («Unable to preventDefault inside passive event listener»).
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < 1) return
      e.preventDefault()
      const s = zRef.current.s
      const target = clamp(s * (e.deltaY < 0 ? 1.15 : 0.87), 1, 4)
      if (target <= 1.01) resetZoom(); else zoomToPoint(target, e.clientX, e.clientY)
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [resetZoom, zoomToPoint])
  const onDblClick = (e: React.MouseEvent) => {
    if (z.s > 1.01) resetZoom(); else zoomToPoint(2.2, e.clientX, e.clientY)
  }
  const onMouseDown = (e: React.MouseEvent) => {
    if (z.s > 1.01) { mdrag.current = { x: e.clientX, y: e.clientY, ox: z.x, oy: z.y } }
  }
  useEffect(() => {
    const mm = (e: MouseEvent) => {
      if (!mdrag.current) return
      const cp = clampPan(z.s, mdrag.current.ox + (e.clientX - mdrag.current.x), mdrag.current.oy + (e.clientY - mdrag.current.y))
      setZ((cur) => ({ s: cur.s, x: cp.x, y: cp.y }))
    }
    const mu = () => { mdrag.current = null }
    window.addEventListener("mousemove", mm)
    window.addEventListener("mouseup", mu)
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu) }
  }, [z.s, clampPan])

  // ─── Полный экран ─────────────────────────────────────────────────────────
  const toggleFs = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      (el.requestFullscreen?.() ?? Promise.reject()).catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
  }, [])
  useEffect(() => {
    const onChange = () => { setFs(Boolean(document.fullscreenElement)); resetZoom() }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [resetZoom])

  // ─── Клавиатура (когда в фокусе/фуллскрин) ────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!fs) return
      if (e.key === "ArrowRight") { e.preventDefault(); next() }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev() }
      else if (e.key === "Escape" && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fs, next, prev])

  if (total === 0) {
    return (
      <div className="rounded-xl bg-gray-100 p-8 text-center text-sm text-gray-400">
        Презентация появится после загрузки PDF
      </div>
    )
  }

  const zoomed = z.s > 1.01

  return (
    <div
      ref={containerRef}
      className={cn(
        "select-none",
        fs ? "fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#0a0f17] p-2 sm:p-4" : "",
        className,
      )}
    >
      <div
        className={cn("relative w-full", fs ? "flex h-full flex-col items-center justify-center" : "")}
        style={fs ? undefined : { maxWidth: "100%" }}
      >
        {/* Кадр со слайдом */}
        <div
          ref={frameRef}
          className={cn(
            "relative w-full overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5",
            fs ? "max-h-full" : "",
          )}
          style={fs
            ? { height: "100%", maxWidth: "100%", aspectRatio: String(aspect), width: "auto", touchAction: "none" }
            : { aspectRatio: String(aspect), touchAction: "none" }}
          onDoubleClick={onDblClick}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {pages.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`Слайд ${i + 1}`}
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
              style={{
                opacity: i === idx ? 1 : 0,
                transform: i === idx ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : undefined,
                transformOrigin: "center center",
                cursor: i === idx && zoomed ? "grab" : undefined,
              }}
            />
          ))}

          {/* Стрелки */}
          {idx > 0 && (
            <button
              type="button"
              onClick={prev}
              aria-label="Назад"
              className="absolute left-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {idx < total - 1 && (
            <button
              type="button"
              onClick={next}
              aria-label="Вперёд"
              className="absolute right-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-white backdrop-blur-sm transition hover:opacity-90"
              style={{ backgroundColor: brandColor }}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Полный экран */}
          <button
            type="button"
            onClick={toggleFs}
            aria-label={fs ? "Свернуть" : "Полный экран"}
            className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
          >
            {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {/* Счётчик */}
          <div className="absolute bottom-2 left-2 z-10 rounded-full bg-black/45 px-2.5 py-0.5 text-xs font-medium tabular-nums text-white backdrop-blur-sm">
            {idx + 1} / {total}
          </div>
        </div>

        {/* Точки + скачать (вне фуллскрина) */}
        {!fs && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {pages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Слайд ${i + 1}`}
                  onClick={() => go(i)}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    i === idx ? "w-5" : "w-2 bg-gray-300 hover:bg-gray-400",
                  )}
                  style={i === idx ? { backgroundColor: brandColor } : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {fs && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Слайд ${i + 1}`}
                onClick={() => go(i)}
                className={cn("h-2 rounded-full transition-all", i === idx ? "w-5" : "w-2 bg-white/30 hover:bg-white/50")}
                style={i === idx ? { backgroundColor: brandColor } : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {!fs && (caption || (allowDownload && pdfUrl)) && (
        <div className="mt-2 flex items-center justify-between gap-3">
          {caption ? <p className="text-sm text-gray-500">{caption}</p> : <span />}
          {allowDownload && pdfUrl && (
            <a
              href={pdfUrl}
              download={fileName || ""}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <Download className="h-4 w-4" /> Скачать PDF
            </a>
          )}
        </div>
      )}
    </div>
  )
}
