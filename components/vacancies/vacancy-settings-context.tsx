"use client"

/**
 * ТЗ-1 Часть 2: единая sticky-кнопка «Сохранить настройки» + жёлтые точки на табах
 * + beforeunload-подтверждение.
 *
 * Подсекции (branding, post-demo, schedule, etc.) регистрируют свой save-handler
 * через useRegisterSaver, и помечают изменения через markChanged. Глобальная кнопка
 * вызывает все зарегистрированные save() параллельно для секций с pendingChanges=true.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Save, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type VacancyTabKey =
  | "page"
  | "sources"
  | "messages"
  | "funnel"
  | "followup"
  | "ai"
  | "integrations"

type SectionKey = string

interface Registration {
  tabKey: VacancyTabKey
  save: () => Promise<void>
}

interface VacancySettingsCtx {
  pendingCount: number
  hasPending: boolean
  pendingChanges: Record<SectionKey, boolean>
  markChanged: (key: SectionKey) => void
  markSaved: (key: SectionKey) => void
  registerSaver: (key: SectionKey, tabKey: VacancyTabKey, save: () => Promise<void>) => void
  unregisterSaver: (key: SectionKey) => void
  saveAll: () => Promise<void>
  tabHasPending: (tab: VacancyTabKey) => boolean
  saving: boolean
}

const Ctx = createContext<VacancySettingsCtx | null>(null)

export function VacancySettingsProvider({ children }: { children: ReactNode }) {
  const [pendingChanges, setPendingChanges] = useState<Record<SectionKey, boolean>>({})
  const [saving, setSaving] = useState(false)
  const registrations = useRef<Map<SectionKey, Registration>>(new Map())

  const markChanged = useCallback((key: SectionKey) => {
    setPendingChanges(prev => (prev[key] ? prev : { ...prev, [key]: true }))
  }, [])

  const markSaved = useCallback((key: SectionKey) => {
    setPendingChanges(prev => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const registerSaver = useCallback((key: SectionKey, tabKey: VacancyTabKey, save: () => Promise<void>) => {
    registrations.current.set(key, { tabKey, save })
  }, [])

  const unregisterSaver = useCallback((key: SectionKey) => {
    registrations.current.delete(key)
  }, [])

  const saveAll = useCallback(async () => {
    setSaving(true)
    try {
      const keys = Object.entries(pendingChanges).filter(([, v]) => v).map(([k]) => k)
      await Promise.all(keys.map(k => {
        const reg = registrations.current.get(k)
        return reg ? reg.save().catch(err => console.error(`[saveAll:${k}]`, err)) : Promise.resolve()
      }))
    } finally {
      setSaving(false)
    }
  }, [pendingChanges])

  const tabHasPending = useCallback((tab: VacancyTabKey) => {
    for (const [key, dirty] of Object.entries(pendingChanges)) {
      if (!dirty) continue
      const reg = registrations.current.get(key)
      if (reg?.tabKey === tab) return true
    }
    return false
  }, [pendingChanges])

  const pendingCount = useMemo(
    () => Object.values(pendingChanges).filter(Boolean).length,
    [pendingChanges],
  )
  const hasPending = pendingCount > 0

  // beforeunload — стандартный браузерный диалог.
  useEffect(() => {
    if (!hasPending) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [hasPending])

  const value = useMemo<VacancySettingsCtx>(() => ({
    pendingCount,
    hasPending,
    pendingChanges,
    markChanged,
    markSaved,
    registerSaver,
    unregisterSaver,
    saveAll,
    tabHasPending,
    saving,
  }), [pendingCount, hasPending, pendingChanges, markChanged, markSaved, registerSaver, unregisterSaver, saveAll, tabHasPending, saving])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useVacancySettings(): VacancySettingsCtx | null {
  return useContext(Ctx)
}

/**
 * Регистрирует подсекцию: следит за изменениями watchedValues (любой
 * сериализуемый объект), при изменении после первичной загрузки помечает
 * секцию как dirty. Вызов save() сбрасывает baseline после успешного сохранения.
 */
export function useVacancySectionRegister(opts: {
  sectionKey: SectionKey
  tabKey: VacancyTabKey
  loaded: boolean
  watchedValues: unknown
  save: () => Promise<void>
}) {
  const { sectionKey, tabKey, loaded, watchedValues, save } = opts
  const ctx = useVacancySettings()
  const baselineRef = useRef<string | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save
  const watchedRef = useRef(watchedValues)
  watchedRef.current = watchedValues

  // Стабильные ссылки на коллбэки чтобы не получать ре-эффект при каждом
  // обновлении pendingChanges (ctx.value меняется, но методы стабильны).
  const markChanged = ctx?.markChanged
  const markSaved = ctx?.markSaved
  const registerSaver = ctx?.registerSaver
  const unregisterSaver = ctx?.unregisterSaver

  // Установим baseline при первой загрузке + отслеживание изменений.
  useEffect(() => {
    if (!loaded) return
    if (baselineRef.current === null) {
      baselineRef.current = JSON.stringify(watchedValues)
      return
    }
    const cur = JSON.stringify(watchedValues)
    if (cur !== baselineRef.current) markChanged?.(sectionKey)
    else markSaved?.(sectionKey)
  }, [loaded, watchedValues, sectionKey, markChanged, markSaved])

  // Регистрация saver — вызывает save и сбрасывает baseline.
  useEffect(() => {
    if (!registerSaver) return
    registerSaver(sectionKey, tabKey, async () => {
      await saveRef.current()
      baselineRef.current = JSON.stringify(watchedRef.current)
      markSaved?.(sectionKey)
    })
    return () => unregisterSaver?.(sectionKey)
  }, [sectionKey, tabKey, registerSaver, unregisterSaver, markSaved])
}

/**
 * Жёлтая точка-индикатор для таба, если в нём есть несохранённые изменения.
 * Используется внутри Provider'а.
 */
export function VacancyTabPendingDot({ tab }: { tab: VacancyTabKey }) {
  const ctx = useVacancySettings()
  if (!ctx || !ctx.tabHasPending(tab)) return null
  return (
    <span
      title="У вас есть несохранённые изменения в этом разделе"
      aria-label="Несохранённые изменения"
      className="w-2 h-2 rounded-full bg-amber-500 inline-block"
    />
  )
}

/**
 * Sticky-кнопка «Сохранить настройки» в правом-нижнем углу. Видна только
 * когда есть несохранённые изменения. z-40 — выше контента, ниже модалок.
 */
export function VacancyStickySaveBar() {
  const ctx = useVacancySettings()
  if (!ctx || !ctx.hasPending) return null
  const label = ctx.pendingCount > 1
    ? `Сохранить настройки (${ctx.pendingCount} изменения)`
    : "Сохранить настройки"
  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-40",
      "shadow-lg shadow-primary/20 rounded-lg",
    )}>
      <Button
        onClick={() => { void ctx.saveAll() }}
        disabled={ctx.saving}
        className="gap-2 h-11 px-5 text-sm"
      >
        {ctx.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {label}
      </Button>
    </div>
  )
}
