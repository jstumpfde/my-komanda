"use client"

// Клиентская логика страницы «Типология» (лендинг + форма, один экран).
// Контракт API — см. системный промпт задачи / README ветки feat/tip:
//   GET  /api/public/tip/me                -> { balanceRuns, prefs }
//   POST /api/public/tip/run               -> 200 {runId,balanceRuns} | 402 {error:'no_balance'} | 400 {error}
//   GET  /api/public/tip/run/[id]          -> { id, status, resultMd?, formula?, shareToken?, error?, context, createdAt }
//   POST /api/public/tip/promo             -> { balanceRuns, runsGranted } | 400 {error}

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { BirthDateInput, isValidBirthDate } from "@/components/tip/birth-date-input"
import { Tile } from "@/components/tip/tile-picker"
import { AnalysisProgress } from "@/components/tip/analysis-progress"
import {
  DEPTHS,
  AUDIENCES,
  getTipContext,
  getTipContextsByGroup,
  type TipDepth,
  type TipAudience,
} from "@/lib/tip/contexts"
import { Loader2 } from "lucide-react"

type Gender = "male" | "female" | "unspecified"

interface Prefs {
  name?: string
  gender?: "male" | "female"
  birthDate?: string
  depth?: TipDepth
  audience?: TipAudience
}

interface RunResponse {
  id: string
  status: "pending" | "generating" | "done" | "error"
  resultMd?: string
  formula?: unknown
  shareToken?: string
  error?: string
  context: string
  createdAt: string
}

const POLL_MS = 2500
const MAIN_TILES = getTipContextsByGroup("main")
const MORE_TILES = getTipContextsByGroup("more")

export default function TipClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Данные формы ──────────────────────────────────────────────────────
  const [birthDate, setBirthDate] = useState("")
  const [name, setName] = useState("")
  const [gender, setGender] = useState<Gender>("unspecified")
  const [contextSlug, setContextSlug] = useState<string>("personal_map")
  const [showMore, setShowMore] = useState(false)
  const [role, setRole] = useState("")
  const [depth, setDepth] = useState<TipDepth>("short")
  const [audience, setAudience] = useState<TipAudience>("self")
  const [pairMode, setPairMode] = useState(false)
  const [secondName, setSecondName] = useState("")
  const [secondBirthDate, setSecondBirthDate] = useState("")

  // ── Служебное состояние ───────────────────────────────────────────────
  const [balanceRuns, setBalanceRuns] = useState<number | null>(null)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")
  const [needsPromo, setNeedsPromo] = useState(false)
  const [promoCode, setPromoCode] = useState("")
  const [promoSubmitting, setPromoSubmitting] = useState(false)
  const [promoError, setPromoError] = useState("")
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedContext = getTipContext(contextSlug)

  // ── Предвыбор контекста из ?context=slug ─────────────────────────────
  useEffect(() => {
    const fromUrl = searchParams.get("context")
    if (fromUrl && getTipContext(fromUrl)) {
      setContextSlug(fromUrl)
      if (getTipContext(fromUrl)?.group === "more") setShowMore(true)
    }
  }, [searchParams])

  // ── Загрузка баланса + prefs (предзаполнение при повторном визите) ───
  useEffect(() => {
    let cancelled = false
    fetch("/api/public/tip/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { balanceRuns?: number; prefs?: Prefs } | null) => {
        if (cancelled || !d) return
        if (typeof d.balanceRuns === "number") setBalanceRuns(d.balanceRuns)
        const p = d.prefs
        if (p) {
          if (p.name) setName(p.name)
          if (p.gender) setGender(p.gender)
          if (p.birthDate) setBirthDate(p.birthDate)
          if (p.depth) setDepth(p.depth)
          if (p.audience) setAudience(p.audience)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPrefsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const pairCapable = selectedContext?.pairCapable ?? false
  const roleCapable = contextSlug === "employee" || contextSlug === "manager"

  const canSubmit = useMemo(() => {
    if (!isValidBirthDate(birthDate)) return false
    if (pairMode && pairCapable) {
      if (!secondBirthDate || !isValidBirthDate(secondBirthDate)) return false
    }
    return true
  }, [birthDate, pairMode, pairCapable, secondBirthDate])

  function startPolling(runId: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/tip/run/${runId}`)
        if (!res.ok) return
        const data: RunResponse = await res.json()
        if (data.status === "done" && data.shareToken) {
          if (pollRef.current) clearInterval(pollRef.current)
          router.push(`/tip/r/${data.shareToken}`)
        } else if (data.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current)
          setSubmitting(false)
          setActiveRunId(null)
          setFormError(data.error || "Не удалось составить разбор. Попробуйте ещё раз — прогон вам вернули.")
        }
      } catch {
        // молча ждём следующего тика — временная сеть/сервер
      }
    }, POLL_MS)
  }

  async function submitRun() {
    setFormError("")
    setNeedsPromo(false)
    if (!isValidBirthDate(birthDate)) {
      setFormError("Укажите корректную дату рождения в формате ДД.ММ.ГГГГ.")
      return
    }
    if (pairMode && pairCapable && (!secondBirthDate || !isValidBirthDate(secondBirthDate))) {
      setFormError("Укажите корректную дату рождения второго человека.")
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim() || undefined,
        gender: gender === "unspecified" ? undefined : gender,
        birthDate,
        context: contextSlug,
        depth,
        audience,
      }
      if (roleCapable && role.trim()) body.role = role.trim()
      if (pairMode && pairCapable) {
        body.second = {
          name: secondName.trim() || undefined,
          birthDate: secondBirthDate,
        }
      }

      const res = await fetch("/api/public/tip/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.status === 402) {
        setSubmitting(false)
        setNeedsPromo(true)
        return
      }
      if (res.status === 400) {
        const d = await res.json().catch(() => ({}))
        setSubmitting(false)
        setFormError(d.error || "Не удалось отправить данные. Проверьте форму.")
        return
      }
      if (!res.ok) {
        setSubmitting(false)
        setFormError("Что-то пошло не так. Попробуйте ещё раз.")
        return
      }

      const d: { runId: string; balanceRuns: number } = await res.json()
      setBalanceRuns(d.balanceRuns)
      setActiveRunId(d.runId)
      startPolling(d.runId)
    } catch {
      setSubmitting(false)
      setFormError("Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.")
    }
  }

  async function submitPromo() {
    if (!promoCode.trim()) return
    setPromoSubmitting(true)
    setPromoError("")
    try {
      const res = await fetch("/api/public/tip/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPromoError(d.error || "Неверный промокод.")
        setPromoSubmitting(false)
        return
      }
      setBalanceRuns(d.balanceRuns)
      setNeedsPromo(false)
      setPromoCode("")
      toast.success(`Начислено разборов: ${d.runsGranted}`)
      setPromoSubmitting(false)
      // Авторетрай запуска разбора после успешного промокода.
      void submitRun()
    } catch {
      setPromoError("Не удалось проверить промокод. Попробуйте ещё раз.")
      setPromoSubmitting(false)
    }
  }

  // ── Экран ожидания генерации ──────────────────────────────────────────
  if (submitting || activeRunId) {
    return <AnalysisProgress />
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-10 sm:pt-14">
      {/* Шапка */}
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">Типология</h1>
        <p className="mt-2 text-base text-stone-600 sm:text-lg">
          Персональный разбор личности по дате рождения
        </p>
        <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-stone-400">
          Это не диагностика и не точное предсказание. Это прикладная поведенческая типология,
          инструмент для размышления, развития и выбора стратегии поведения.
        </p>
        {balanceRuns !== null && balanceRuns > 0 && (
          <Badge variant="secondary" className="mt-4 px-3 py-1 text-sm">
            Доступно разборов: {balanceRuns}
          </Badge>
        )}
      </header>

      <div className="space-y-8">
        {/* ── Данные ── */}
        <section className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tip-birthdate">Дата рождения</Label>
            <BirthDateInput id="tip-birthdate" value={birthDate} onChange={setBirthDate} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tip-name">
              Имя <span className="font-normal text-stone-400">(можно пропустить)</span>
            </Label>
            <Input
              id="tip-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как вас зовут?"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Пол</Label>
            <div className="grid grid-cols-3 gap-2">
              <Tile active={gender === "male"} onClick={() => setGender("male")}>
                Мужчина
              </Tile>
              <Tile active={gender === "female"} onClick={() => setGender("female")}>
                Женщина
              </Tile>
              <Tile active={gender === "unspecified"} onClick={() => setGender("unspecified")}>
                Не указывать
              </Tile>
            </div>
          </div>
        </section>

        {/* ── Контекст ── */}
        <section className="space-y-3">
          <Label>Что хотите получить?</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MAIN_TILES.map((c) => (
              <Tile key={c.slug} active={contextSlug === c.slug} onClick={() => setContextSlug(c.slug)}>
                <span className="text-xl">{c.emoji}</span>
                <span className="leading-tight">{c.title}</span>
              </Tile>
            ))}
          </div>
          {!showMore && (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="w-full rounded-xl border border-dashed border-stone-300 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-50"
            >
              Ещё…
            </button>
          )}
          {showMore && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MORE_TILES.map((c) => (
                <Tile key={c.slug} active={contextSlug === c.slug} onClick={() => setContextSlug(c.slug)}>
                  <span className="text-xl">{c.emoji}</span>
                  <span className="leading-tight">{c.title}</span>
                </Tile>
              ))}
            </div>
          )}

          {roleCapable && (
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="tip-role">
                Роль/должность <span className="font-normal text-stone-400">(необязательно)</span>
              </Label>
              <Input
                id="tip-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Например: менеджер по продажам"
                className="h-11"
              />
            </div>
          )}

          {pairCapable && (
            <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
              <div className="grid grid-cols-2 gap-2">
                <Tile active={!pairMode} onClick={() => setPairMode(false)}>
                  Только про меня
                </Tile>
                <Tile active={pairMode} onClick={() => setPairMode(true)}>
                  Сравнить с другим человеком
                </Tile>
              </div>
              {pairMode && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tip-second-name">
                      Имя человека <span className="font-normal text-stone-400">(опционально)</span>
                    </Label>
                    <Input
                      id="tip-second-name"
                      value={secondName}
                      onChange={(e) => setSecondName(e.target.value)}
                      placeholder="Имя"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tip-second-birthdate">Дата рождения человека</Label>
                    <BirthDateInput
                      id="tip-second-birthdate"
                      value={secondBirthDate}
                      onChange={setSecondBirthDate}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Глубина ── */}
        <section className="space-y-3">
          <Label>Глубина</Label>
          <div className="grid grid-cols-3 gap-2">
            {DEPTHS.map((d) => (
              <Tile key={d.slug} active={depth === d.slug} onClick={() => setDepth(d.slug)} className="text-xs sm:text-sm">
                {d.title}
              </Tile>
            ))}
          </div>
        </section>

        {/* ── Для кого текст ── */}
        <section className="space-y-3">
          <Label>Для кого текст?</Label>
          <div className="grid grid-cols-3 gap-2">
            {AUDIENCES.map((a) => (
              <Tile key={a.slug} active={audience === a.slug} onClick={() => setAudience(a.slug)} className="text-xs sm:text-sm">
                {a.title}
              </Tile>
            ))}
          </div>
        </section>

        {/* ── Ошибки / промокод / кнопка ── */}
        {formError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        )}

        {needsPromo && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-stone-800">
              Разборы закончились. Введите промокод, чтобы продолжить.
            </p>
            <div className="flex gap-2">
              <Input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Промокод"
                className="h-11 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitPromo()
                }}
              />
              <Button onClick={submitPromo} disabled={promoSubmitting || !promoCode.trim()} className="h-11">
                {promoSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Применить"}
              </Button>
            </div>
            {promoError && <p className="text-sm text-red-600">{promoError}</p>}
          </div>
        )}

        <Button
          onClick={submitRun}
          disabled={!canSubmit || submitting || !prefsLoaded}
          size="lg"
          className="h-14 w-full bg-amber-500 text-base font-semibold text-stone-900 hover:bg-amber-400"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Получить разбор"}
        </Button>
      </div>
    </div>
  )
}
