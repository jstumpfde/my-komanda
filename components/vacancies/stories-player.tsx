"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Volume2, VolumeX, Play } from "lucide-react"
import type { StoriesCard } from "@/lib/course-types"
import { STORIES_CARD_DEFAULT_DURATION_SEC } from "@/lib/course-types"

interface StoriesPlayerProps {
  cards: StoriesCard[]
  /** Показывать ли финальный CTA-слайд после последней карточки. */
  ctaEnabled?: boolean
  /** Текст кнопки на CTA-слайде (приходит из редактируемого поля). */
  ctaText?: string
  /** Подпись над кнопкой (необязательно). */
  ctaCaption?: string
  /** Клик по кнопке CTA. Если задан — вызываем его (напр. handleNext демо →
   *  переход на анкету/отклик). Если НЕ задан (превью HR) — просто закрываем. */
  onCta?: () => void
}

const DEFAULT_CTA_TEXT = "Откликнуться"

export function StoriesPlayer({ cards, ctaEnabled = false, ctaText, ctaCaption, onCta }: StoriesPlayerProps) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const touchStartX = useRef<number | null>(null)

  // CTA-слайд активен только если включён И есть хотя бы одна карточка.
  const hasCta = ctaEnabled && cards.length > 0
  // Общее число «слайдов» = карточки + (опц.) финальный CTA-слайд.
  const totalSlides = cards.length + (hasCta ? 1 : 0)
  // Индекс CTA-слайда (когда index === cards.length при включённом CTA).
  const onCtaSlide = hasCta && index === cards.length

  const current = cards[index]

  const stopTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [])

  const goNext = useCallback(() => {
    stopTimers()
    if (index < totalSlides - 1) {
      // Переход на следующую карточку или на финальный CTA-слайд.
      setIndex(i => i + 1)
      setProgress(0)
    } else {
      // Последний слайд (последняя карточка без CTA или сам CTA-слайд) — закрываем.
      setOpen(false)
    }
  }, [index, totalSlides, stopTimers])

  const goPrev = useCallback(() => {
    stopTimers()
    if (index > 0) {
      setIndex(i => i - 1)
      setProgress(0)
    }
  }, [index, stopTimers])

  // Запуск прогресс-анимации для фото
  const startPhotoTimer = useCallback(() => {
    stopTimers()
    setProgress(0)
    // Длительность фото-карточки из card.durationSec (1–60с), деф. 15с.
    const durMs = Math.max(1, Math.min(60, current?.durationSec ?? STORIES_CARD_DEFAULT_DURATION_SEC)) * 1000
    startTimeRef.current = performance.now()
    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current
      const p = Math.min(elapsed / durMs, 1)
      setProgress(p)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        goNext()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopTimers, goNext, current])

  // При смене карточки
  useEffect(() => {
    if (!open) return
    // CTA-слайд (current === undefined) — без таймеров, ждёт действия кандидата.
    if (!current) { stopTimers(); setProgress(1); return }
    if (current.mediaType === "image") {
      startPhotoTimer()
    } else {
      // видео: прогресс через timeupdate
      stopTimers()
      setProgress(0)
      if (videoRef.current) {
        videoRef.current.currentTime = 0
        const playPromise = videoRef.current.play()
        if (playPromise) playPromise.catch(() => {})
      }
    }
    return () => stopTimers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index])

  // Esc для закрытия
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  // Блокируем скролл под оверлеем
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [open])

  const handleVideoTimeUpdate = () => {
    const vid = videoRef.current
    if (!vid || !vid.duration) return
    setProgress(vid.currentTime / vid.duration)
  }

  const handleVideoEnded = () => {
    goNext()
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 2) {
      goPrev()
    } else {
      goNext()
    }
  }

  // Свайп
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 40) return
    if (dx < 0) goNext()
    else goPrev()
  }

  const openPlayer = () => {
    setIndex(0)
    setProgress(0)
    setOpen(true)
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground text-center">
        Сторис пусты
      </div>
    )
  }

  const firstCard = cards[0]

  return (
    <>
      {/* Обложка */}
      <button
        onClick={openPlayer}
        className="relative group w-32 h-52 rounded-2xl overflow-hidden border border-border bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Открыть сторис"
      >
        {firstCard.mediaType === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={firstCard.url} alt="" className="w-full h-full object-cover" />
        ) : (
          <video src={firstCard.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        )}
        {/* затемнение + плей */}
        <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center gap-2 transition-opacity group-hover:bg-black/40">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 text-black fill-black ml-0.5" />
          </div>
          <span className="text-white text-xs font-medium drop-shadow">{cards.length} карточек</span>
        </div>
      </button>

      {/* Полноэкранный оверлей */}
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Область карточки (на мобиле — на всю ширину/высоту, на десктопе — max-w-[420px] для верт., шире для гориз.) */}
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Прогресс-полоски (по числу слайдов, включая финальный CTA) */}
            <div className="absolute top-3 left-3 right-3 z-10 flex gap-1">
              {Array.from({ length: totalSlides }).map((_, i) => (
                <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
                  <div
                    className="h-full bg-white transition-none"
                    style={{
                      width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Кнопка закрыть */}
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false) }}
              className="absolute top-8 right-3 z-20 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Кнопка звука (только для видео) */}
            {current?.mediaType === "video" && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMuted(m => !m)
                  if (videoRef.current) videoRef.current.muted = !muted
                }}
                className="absolute top-8 right-14 z-20 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                aria-label={muted ? "Включить звук" : "Выключить звук"}
              >
                {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}

            {onCtaSlide ? (
              /* Финальный CTA-слайд: подпись + крупная кнопка «Откликнуться».
                 Тап-навигация по половинам экрана здесь НЕ нужна — есть кнопка. */
              <div className="relative w-full h-full flex flex-col items-center justify-center gap-6 px-8 text-center">
                {/* «Назад» к карточкам — по тапу в левую часть фона */}
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute inset-y-0 left-0 w-1/3"
                  aria-label="Назад"
                />
                {ctaCaption?.trim() && (
                  <p className="relative z-10 text-white text-xl font-semibold leading-snug max-w-sm drop-shadow">
                    {ctaCaption}
                  </p>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen(false)
                    // Передаём управление демо (переход к отклику/анкете). В превью
                    // HR onCta не задан — просто закрываем плеер.
                    onCta?.()
                  }}
                  className="relative z-10 inline-flex items-center justify-center rounded-2xl bg-white text-black text-lg font-semibold px-10 py-4 shadow-xl hover:bg-white/90 active:scale-[0.98] transition"
                >
                  {ctaText?.trim() || DEFAULT_CTA_TEXT}
                </button>
              </div>
            ) : (
              <>
                {/* Медиа */}
                <div
                  className="relative w-full h-full flex items-center justify-center cursor-pointer"
                  onClick={handleOverlayClick}
                >
                  {current.mediaType === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={current.url}
                      alt={current.caption || ""}
                      className="max-w-full max-h-full object-contain select-none"
                      style={{ maxWidth: "min(420px, 100vw)", maxHeight: "100vh" }}
                      draggable={false}
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      src={current.url}
                      className="max-w-full max-h-full object-contain select-none"
                      style={{ maxWidth: "min(100vw, 90vw)", maxHeight: "100vh" }}
                      autoPlay
                      playsInline
                      muted={muted}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onEnded={handleVideoEnded}
                      controls={false}
                    />
                  )}
                </div>

                {/* Подпись */}
                {current.caption && (
                  <div className="absolute bottom-6 left-0 right-0 px-5 text-center pointer-events-none z-10">
                    <span className="inline-block bg-black/60 text-white text-sm rounded-xl px-4 py-2 leading-snug backdrop-blur-sm">
                      {current.caption}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
