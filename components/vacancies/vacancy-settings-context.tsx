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
  | "funnel-builder"
  | "followup"
  | "aichatbot"
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
  /**
   * Bug #82: ставится в true только после первого реального input/select/button
   * взаимодействия HR внутри настроек (не на табах). До этого момента любые
   * изменения watchedValues трактуются как программная нормализация (resync
   * initial → state) и НЕ помечают секцию как dirty.
   */
  hasUserInteracted: boolean
}

const Ctx = createContext<VacancySettingsCtx | null>(null)

export function VacancySettingsProvider({ children }: { children: ReactNode }) {
  const [pendingChanges, setPendingChanges] = useState<Record<SectionKey, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const interactedRef = useRef(false)
  const registrations = useRef<Map<SectionKey, Registration>>(new Map())

  // Bug #82: глобальный слушатель «реальной» интеракции HR. Клики на табах,
  // навигации и хедере игнорируются (они только переключают вид, ничего не
  // редактируют). После первой настоящей интеракции флаг навсегда true.
  useEffect(() => {
    if (interactedRef.current) return
    const isRealInteraction = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false
      if (target.closest('[role="tab"], [role="tablist"], nav, header, [data-vacancy-tab]')) return false
      return target.closest(
        'input, textarea, select, button, [role="switch"], [role="combobox"], [role="checkbox"], [role="radio"], [role="menuitem"], [contenteditable="true"]'
      ) != null
    }
    const handler = (e: Event) => {
      if (interactedRef.current) return
      if (!isRealInteraction(e.target)) return
      interactedRef.current = true
      setHasUserInteracted(true)
    }
    document.addEventListener('pointerdown', handler, true)
    document.addEventListener('keydown', handler, true)
    return () => {
      document.removeEventListener('pointerdown', handler, true)
      document.removeEventListener('keydown', handler, true)
    }
  }, [])

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
    hasUserInteracted,
  }), [pendingCount, hasPending, pendingChanges, markChanged, markSaved, registerSaver, unregisterSaver, saveAll, tabHasPending, saving, hasUserInteracted])

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
  const hasUserInteracted = ctx?.hasUserInteracted ?? false

  // Bug #82: baseline ставится на первом рендере с loaded=true. Но parent
  // часто делает resync через useEffect(initial → setState), что меняет
  // watchedValues уже ПОСЛЕ установки baseline — false positive dirty.
  //
  // Решение: пока HR не сделал ни одной реальной интеракции (см. Provider),
  // любые расхождения baseline ≠ current трактуем как программную
  // нормализацию и переносим baseline. Как только interacted=true,
  // переключаемся в обычный режим — реальные правки сразу markChanged.
  useEffect(() => {
    if (!loaded) return
    const cur = JSON.stringify(watchedValues)
    if (baselineRef.current === null) {
      baselineRef.current = cur
      return
    }
    if (cur === baselineRef.current) {
      markSaved?.(sectionKey)
      return
    }
    if (!hasUserInteracted) {
      // Нормализация: parent дотащил данные → state обновился. Перенастраиваем
      // baseline без вызова markChanged.
      baselineRef.current = cur
      markSaved?.(sectionKey)
      return
    }
    markChanged?.(sectionKey)
  }, [loaded, watchedValues, sectionKey, markChanged, markSaved, hasUserInteracted])

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
 * #11: helper для безопасного переключения подтаба. Если в текущем
 * подтабе есть несохранённые изменения — показывает confirm с тремя
 * опциями (через стандартный window.confirm для простоты):
 *   1) Сохранить (saveAll + переключить)
 *   2) Не сохранять (потерять правки + переключить)
 *   3) Отмена (остаться в текущем подтабе)
 * window.confirm даёт только 2 кнопки, поэтому используем последовательно:
 * сначала «Сохранить?» (OK = сохранить и продолжить, Cancel = открыть
 * подвопрос «Отменить переход или потерять правки?»). Это упрощённая
 * версия escape clause из ТЗ #11.
 */
export function useSafeSubTabSwitch(currentTab: VacancyTabKey | null): (next: VacancyTabKey, doSwitch: () => void) => void {
  const ctx = useVacancySettings()
  return (next: VacancyTabKey, doSwitch: () => void) => {
    if (!ctx || !currentTab || next === currentTab) {
      doSwitch()
      return
    }
    if (!ctx.tabHasPending(currentTab)) {
      doSwitch()
      return
    }
    // 1) Save before switching?
    const wantSave = window.confirm(
      "У вас есть несохранённые изменения в текущем разделе. Сохранить перед переходом?\n\n" +
      "OK — сохранить и перейти.\nОтмена — отказаться от сохранения (откроется второй вопрос).",
    )
    if (wantSave) {
      void ctx.saveAll().then(() => doSwitch())
      return
    }
    // 2) Discard or stay?
    const discard = window.confirm(
      "Перейти без сохранения? Несохранённые правки будут потеряны.\n\n" +
      "OK — потерять правки и перейти.\nОтмена — остаться в текущем разделе.",
    )
    if (discard) doSwitch()
  }
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
 * Sticky-кнопка «Сохранить настройки». Прилипает к низу viewport, но
 * горизонтально ограничена max-w-3xl — той же шириной, что и блоки настроек
 * вакансии, — поэтому кнопка стоит у правого края блока, а не у правого
 * края окна. z-40 — выше контента, ниже модалок.
 */
export function VacancyStickySaveBar() {
  const ctx = useVacancySettings()
  if (!ctx || !ctx.hasPending) return null
  const label = ctx.pendingCount > 1
    ? `Сохранить настройки (${ctx.pendingCount} изменения)`
    : "Сохранить настройки"
  return (
    <div className={cn(
      "sticky bottom-4 z-40 mt-6 max-w-3xl flex justify-end pointer-events-none",
    )}>
      <Button
        onClick={() => { void ctx.saveAll() }}
        disabled={ctx.saving}
        className="pointer-events-auto gap-2 h-11 px-5 text-sm shadow-lg shadow-primary/20"
      >
        {ctx.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {label}
      </Button>
    </div>
  )
}
