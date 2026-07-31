"use client"

// Баннер пробного периода SalesRadar — показывается на экранах модуля
// AI-РОП (точечно вставлен в существующие page.tsx, см. CLAUDE.md зону).
// Сам себе тянет статус через /api/modules/ai-rop/trial/status (гейт
// requireRopManage) — если запрос упал (обычный менеджер без доступа к
// настройкам, ошибка сети) баннер просто не рисуется, ничего не ломает.
//
// Два состояния: активный триал — «осталось N дней» + кнопка заявки;
// истёкший — мягкая заглушка, доступ к уже собранным данным НЕ теряется
// (баннер не блокирует страницу, только информирует).
import { useEffect, useState } from "react"
import Link from "next/link"
import { Clock3, Sparkles, Loader2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TrialInfo {
  status: "active" | "expired" | "converted"
  daysLeft: number
  daysTotal: number
  requestedAt?: string | null
}

export function TrialBanner() {
  const [trial, setTrial] = useState<TrialInfo | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/modules/ai-rop/trial/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.ok) return
        setTrial(data.trial)
        setRequested(!!data.trial?.requestedAt)
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [])

  async function sendRequest() {
    setRequesting(true)
    try {
      const res = await fetch("/api/modules/ai-rop/trial/request", { method: "POST" })
      if (res.ok) setRequested(true)
    } finally {
      setRequesting(false)
    }
  }

  if (!loaded || !trial || trial.status === "converted") return null

  if (trial.status === "expired") {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex items-start gap-2">
          <Clock3 className="mt-0.5 size-4 shrink-0 text-slate-500" />
          <div className="leading-relaxed">
            <b>Пробный период завершён.</b> Все данные, что мы уже собрали, никуда не делись — вы можете
            их смотреть, но новые каналы и сообщения больше не подключаются.
          </div>
        </div>
        {requested ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" /> Заявка отправлена
          </span>
        ) : (
          <Button size="sm" onClick={sendRequest} disabled={requesting} className="gap-1.5">
            {requesting && <Loader2 className="size-3.5 animate-spin" />} Оставить заявку на подключение
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-300 bg-violet-50/60 p-3 text-sm dark:border-violet-900/40 dark:bg-violet-950/20">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-600" />
        <div className="leading-relaxed">
          <b>Пробный период — осталось {trial.daysLeft} {dayWord(trial.daysLeft)}.</b>{" "}
          Смотрите на своих данных, что упускает команда —{" "}
          <Link href="/ai-rop/onboarding" className="font-medium underline underline-offset-2">мастер подключения</Link>.
        </div>
      </div>
      {requested ? (
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5" /> Заявка отправлена
        </span>
      ) : (
        <Button size="sm" variant="outline" onClick={sendRequest} disabled={requesting} className="gap-1.5">
          {requesting && <Loader2 className="size-3.5 animate-spin" />} Оставить заявку на подключение
        </Button>
      )}
    </div>
  )
}

function dayWord(n: number): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return "дней"
  if (last === 1) return "день"
  if (last >= 2 && last <= 4) return "дня"
  return "дней"
}
