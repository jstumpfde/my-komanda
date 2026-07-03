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
import { Save, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type VacancyTabKey =
  | "page"
  | "sources"
  | "messages"
  | "funnel"
  | "funnel-builder"
  | "spec"
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
  /** Метка времени последней реальной интеракции HR (для per-секционного dirty). */
  getLastInteractionAt: () => number
  /** Опц. кнопка «Далее» в sticky-баре (рядом с «Сохранить настройки»). Секция
   *  ставит её на маунте и снимает на анмаунте. null = нет «Далее». */
  nextAction: { label: string; onClick: () => void | Promise<void> } | null
  setNextAction: (a: { label: string; onClick: () => void | Promise<void> } | null) => void
}

const Ctx = createContext<VacancySettingsCtx | null>(null)

export function VacancySettingsProvider({ children }: { children: ReactNode }) {
  const [pendingChanges, setPendingChanges] = useState<Record<SectionKey, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [nextAction, setNextAction] = useState<{ label: string; onClick: () => void | Promise<void> } | null>(null)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const interactedRef = useRef(false)
  // Метка времени ПОСЛЕДНЕЙ реальной интеракции HR. Секция считает себя dirty
  // только если её baseline установлен РАНЬШЕ последней интеракции — это отсекает
  // ложные срабатывания при до-загрузке данных в секции, открытой после того, как
  // HR уже что-то трогал в другой секции (раньше глобальный флаг метил всё подряд).
  const interactionAtRef = useRef(0)
  const getLastInteractionAt = useCallback(() => interactionAtRef.current, [])
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
      if (!isRealInteraction(e.target)) return
      interactionAtRef.current = Date.now()
      if (!interactedRef.current) {
        interactedRef.current = true
        setHasUserInteracted(true)
      }
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
    getLastInteractionAt,
    nextAction,
    setNextAction,
  }), [pendingCount, hasPending, pendingChanges, markChanged, markSaved, registerSaver, unregisterSaver, saveAll, tabHasPending, saving, hasUserInteracted, getLastInteractionAt, nextAction])

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
  const baselineAtRef = useRef(0)   // когда установлен baseline этой секции
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
  const getLastInteractionAt = ctx?.getLastInteractionAt

  // Bug #82 (исправлено): секция считается dirty ТОЛЬКО если последняя реальная
  // интеракция HR была ПОЗЖЕ установки baseline этой секции. Если изменение
  // watchedValues пришло без интеракции после baseline — это до-загрузка/
  // нормализация данных (parent дотащил initial→state), переносим baseline без
  // markChanged. Раньше использовался глобальный флаг hasUserInteracted, из-за
  // чего секция, открытая ПОСЛЕ правки в другой секции, ложно метилась грязной.
  useEffect(() => {
    if (!loaded) return
    const cur = JSON.stringify(watchedValues)
    if (baselineRef.current === null) {
      baselineRef.current = cur
      baselineAtRef.current = Date.now()
      return
    }
    if (cur === baselineRef.current) {
      markSaved?.(sectionKey)
      return
    }
    const lastInteraction = getLastInteractionAt?.() ?? 0
    if (lastInteraction <= baselineAtRef.current) {
      // Нормализация без интеракции — переносим baseline, не помечаем dirty.
      baselineRef.current = cur
      baselineAtRef.current = Date.now()
      markSaved?.(sectionKey)
      return
    }
    markChanged?.(sectionKey)
  }, [loaded, watchedValues, sectionKey, markChanged, markSaved, getLastInteractionAt])

  // Регистрация saver — вызывает save и сбрасывает baseline.
  useEffect(() => {
    if (!registerSaver) return
    registerSaver(sectionKey, tabKey, async () => {
      await saveRef.current()
      baselineRef.current = JSON.stringify(watchedRef.current)
      baselineAtRef.current = Date.now()
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
    // Один вопрос, без второго. OK — сохранить и перейти; Отмена — остаться
    // (ничего не теряется, можно сохранить кнопкой внизу).
    const save = window.confirm(
      "В этом разделе есть несохранённые изменения.\n\n" +
      "OK — сохранить и перейти.\nОтмена — остаться (изменения не потеряются).",
    )
    if (save) {
      void ctx.saveAll().then(() => doSwitch())
    }
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
  // Рендерим всегда, когда есть контекст (бар монтируется только внутри
  // VacancySettingsProvider, т.е. на вкладке «Настройки»). Это даёт единый
  // вид на всех подтабах: «Сохранить настройки» всегда слева, «Далее» справа.
  if (!ctx) return null
  const label = ctx.pendingCount > 1
    ? `Сохранить настройки (${ctx.pendingCount} изменения)`
    : "Сохранить настройки"
  return (
    <div className={cn(
      "sticky bottom-4 z-40 mt-6 max-w-3xl flex justify-end items-center gap-2 pointer-events-none",
    )}>
      {/* «Сохранить настройки» — всегда, независимо от наличия изменений. */}
      <Button
        onClick={() => { void ctx.saveAll() }}
        disabled={ctx.saving}
        className="pointer-events-auto gap-2 h-11 px-5 text-sm shadow-lg shadow-primary/20"
      >
        {ctx.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {label}
      </Button>
      {ctx.nextAction && (
        <Button
          onClick={() => { void ctx.nextAction?.onClick() }}
          disabled={ctx.saving}
          className="pointer-events-auto gap-1.5 h-11 px-5 text-sm shadow-lg shadow-primary/20"
        >
          {ctx.nextAction.label}
        </Button>
      )}
    </div>
  )
}

/**
 * #20 — ЕДИНАЯ нижняя панель действий для всех табов вакансии.
 *
 * Эталон = таб «Вакансия» (AnketaTab): СПРАВА в ряд [Сохранить] · [Далее → {next}];
 * СНИЗУ-СЛЕВА хлебные крошки [‹ Все вакансии] · [‹ {prev}]. Порядок табов —
 * канонический v2-ряд (Вакансия → Портрет → Контент → Воронка → Сообщения →
 * Дожим → Воронка v2 → Источники → Расписание → Интеграции → Брендинг →
 * Исходящий подбор → Очередь).
 *
 * onSave — необязателен. Когда компонент рендерится внутри VacancySettingsProvider
 * (вкладка «Настройки»), «Сохранить» по умолчанию вызывает ctx.saveAll(); для
 * табов, владеющих собственным сохранением (Вакансия/Контент/…), кнопку
 * «Сохранить» показывает сам таб, а здесь передаётся только навигация.
 */
export function VacancyTabFooter(props: {
  onAllVacancies: () => void
  prevLabel?: string | null
  onPrev?: () => void
  nextLabel?: string | null
  onNext?: () => void
  /** Явный обработчик «Сохранить». Если не задан и есть контекст — ctx.saveAll(). */
  onSave?: () => void | Promise<void>
  saving?: boolean
  /** Показывать кнопку «Сохранить» (по умолчанию — только если есть onSave или контекст). */
  showSave?: boolean
  /** #44: доп. классы обёртки. По умолчанию max-w-3xl (ширина контента конфиг-табов,
   *  как у эталона «Вакансия»). Для широких табов (Кандидаты/Аналитика) можно
   *  передать "max-w-none", чтобы панель растянулась под таблицу. */
  className?: string
}) {
  const ctx = useVacancySettings()
  const { onAllVacancies, prevLabel, onPrev, nextLabel, onNext } = props
  const saveHandler = props.onSave ?? (ctx ? () => ctx.saveAll() : undefined)
  const saving = props.saving ?? ctx?.saving ?? false
  const showSave = props.showSave ?? !!saveHandler
  const saveLabel = ctx && ctx.pendingCount > 1
    ? `Сохранить настройки (${ctx.pendingCount} изменения)`
    : ctx ? "Сохранить настройки" : "Сохранить"
  return (
    // #44: ширина/выравнивание нижней панели = ширина контента табов (max-w-3xl),
    // как у эталона «Вакансия» (AnketaTab). Раньше футер рендерился на всю ширину
    // TabsContent → кнопки прижимались к правому краю viewport, а не к краю
    // контентной колонки. max-w-3xl совпадает с обёрткой секций настроек
    // (space-y-6 max-w-3xl) и линией-разделителем над кнопками.
    // md:mb-20 — резерв под плавающие виджеты (Нэнси + «Чаты» прижаты к низу,
    // md:bottom-1/3): кнопки «Сохранить/Далее» не оказываются под ними при
    // прокрутке в самый низ (Юрий 03.07: виджеты перекрывали кнопки).
    <div className={cn("flex items-center justify-between mt-6 pt-4 border-t gap-3 max-w-3xl md:mb-20", props.className)}>
      {/* Снизу-слева: хлебные крошки навигации */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onAllVacancies}>
          <ChevronLeft className="w-3.5 h-3.5" />
          Все вакансии
        </Button>
        {prevLabel && onPrev && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onPrev}>
            <ChevronLeft className="w-3.5 h-3.5" />
            {prevLabel}
          </Button>
        )}
      </div>
      {/* Справа: [Сохранить] · [Далее → {next}] */}
      <div className="flex items-center gap-3">
        {showSave && saveHandler && (
          <Button size="sm" className="gap-1.5 h-9 text-xs" onClick={() => { void saveHandler() }} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saveLabel}
          </Button>
        )}
        {nextLabel && onNext && (
          <Button size="sm" variant="default" className="gap-1.5 h-9 text-xs" onClick={onNext} disabled={saving}>
            {nextLabel}
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
