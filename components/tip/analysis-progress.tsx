"use client"

// Экран ожидания генерации разбора: смена фраз + прогресс-полоса.
// Показывается пока идёт POST run -> поллинг GET run/[id] (status pending/generating).

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"

const PHRASES = [
  "Считаю формулу…",
  "Разбираю сочетания цифр…",
  "Собираю портрет…",
  "Пишу рекомендации…",
]

// Полоса идёт к 92% сама за ~разумное время ожидания и «зависает», пока не
// придёт status=done — так пользователь не видит откровенно застрявший 100%
// до реального завершения.
const SOFT_CAP = 92
const TICK_MS = 350
const STEP = 1.2

export function AnalysisProgress() {
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [progress, setProgress] = useState(4)

  useEffect(() => {
    const phraseTimer = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % PHRASES.length)
    }, 3200)
    return () => clearInterval(phraseTimer)
  }, [])

  useEffect(() => {
    const progressTimer = setInterval(() => {
      setProgress((p) => (p >= SOFT_CAP ? p : p + STEP))
    }, TICK_MS)
    return () => clearInterval(progressTimer)
  }, [])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/50" />
        <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
          ✨
        </span>
      </div>
      <p
        key={phraseIdx}
        className="animate-in fade-in text-lg font-medium text-stone-700 sm:text-xl"
      >
        {PHRASES[phraseIdx]}
      </p>
      <div className="w-full max-w-xs">
        <Progress value={progress} className="h-2" />
      </div>
      <p className="max-w-sm text-sm text-stone-400">
        Обычно это занимает от 30 секунд до нескольких минут — не закрывайте страницу
      </p>
    </div>
  )
}
