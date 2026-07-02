"use client"

// Воронка 3 — единый конструктор стадий ПОВЕРХ движка Воронки v2.
// НЕ новый движок и НЕ копия данных: тот же конфиг vacancy.descriptionJson.funnelV2
// (GET/PUT /api/modules/hr/vacancies/[id]/funnel-v2), аддитивно расширенный
// полями enabled / rejectText / farewellText / трёхзонный scoreGate.
//
// Макет: слева вертикальный список стадий (drag-порядок, как в v2-билдере),
// справа — разворот выбранной стадии единой карточкой из секций:
//   (1) шапка: тумблер стадии + название + тип
//   (2) «Что видит кандидат»: привязка блока из «Контента»
//   (3) «Проход дальше»: авто/вручную + шкала + порог
//   (4) «Три зоны»: полоса красная/жёлтая/зелёная, два порога, жёлтая зона, авто-отказ красной
//   (5) «Тексты стадии»: приглашение / отказ / прощание
//   (6) «Дожим стадии»: пресет + две ветки касаний (готовые структуры dozhimChain*)
//
// Owner-only (гейт на странице вакансии + owner-404 на API funnel-v2).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  GripVertical, Plus, Loader2, Check, X, Trash2, Repeat, Route, Link2,
  MessageSquare, ClipboardList, PlayCircle, ListChecks, ClipboardCheck,
  Calendar, FileText, ShieldCheck, Phone, CircleCheck, Gauge, Ban,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  STAGE_ACTIONS, DOZHIM_LABEL, makeStage, emptyFunnelV2, normalizeFunnelV2,
  dozhimChainFor, dozhimChainForOpened, isStageEnabled,
  SCORE_GATE_TYPES, SCORE_GATE_FAIL_ACTIONS, DEFAULT_SCORE_GATE_THRESHOLD,
  type FunnelV2Config, type FunnelV2Stage, type StageActionType,
  type DozhimPreset, type DozhimTouch, type ScoreGate, type ScoreGateType,
  type ScoreGateFailAction, type ScoreGateMiddleAction,
} from "@/lib/funnel-v2/types"
import type { DripTemplates } from "@/lib/db/schema"

// ── Справочники подписи (те же смыслы, что в v2-билдере) ─────────────────────
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "clipboard-list": ClipboardList, "player-play": PlayCircle, "list-check": ListChecks,
  "clipboard-check": ClipboardCheck, "calendar": Calendar, "file-text": FileText,
  "shield-check": ShieldCheck, "phone": Phone, "message": MessageSquare, "circle-check": CircleCheck,
}
function actionMeta(type: StageActionType) { return STAGE_ACTIONS.find(a => a.type === type) ?? STAGE_ACTIONS[0] }
const CONTENT_ACTIONS: StageActionType[] = ["demo", "test", "task", "prequalification"]

const SCORE_GATE_TYPE_LABEL: Record<ScoreGateType, string> = {
  resume: "Резюме", anketa: "Анкета", block2: "Блок 2", test: "Тест", portrait: "Портрет",
}
const MIDDLE_ACTION_LABEL: Record<ScoreGateMiddleAction, string> = {
  manual_review: "Ручной разбор", prequalification: "Предквалификация",
}
// «Что делать с непрошедшими» — те же подписи, что в v2-билдере.
const SCORE_GATE_FAIL_LABEL: Record<ScoreGateFailAction, string> = {
  preliminary_reject: "Предварительный отказ", manual: "Ручное", reject: "Отказ", reserve: "В резерв",
}
const DOZHIM_OPTS: DozhimPreset[] = ["off", "soft", "standard", "strong"]
// Типы стадий, где рантайм РЕАЛЬНО запускает дожим (executeStageEntry →
// scheduleV2Dozhim). Для остальных секция «Дожим» — пояснение, не редактор.
const DOZHIM_ACTIONS: StageActionType[] = ["demo", "prequalification", "test", "task"]

interface ContentBlock { id: string; title: string; contentType: string }

// ── Общий редактор одной цепочки дожима (ветка А или Б) ──────────────────────
// Работает с ГОТОВОЙ структурой DozhimTouch[] (та же, что в v2-билдере) —
// логика касаний не дублируется, редактируется общий формат.
function DozhimChainEditor({ title, hint, chain, onChange }: {
  title: string
  hint?: string
  chain: DozhimTouch[]
  onChange: (next: DozhimTouch[]) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> {title}</Label>
        <button type="button" onClick={() => onChange([...chain, { text: "", delayDays: 1 }])}
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"><Plus className="w-3 h-3" /> касание</button>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
      {chain.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">Без касаний.</p>
      ) : chain.map((t, i) => (
        <div key={i} className="rounded-md border p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Касание {i + 1} · через</span>
            <Input type="number" value={t.delayDays}
              onChange={e => onChange(chain.map((x, idx) => idx === i ? { ...x, delayDays: Math.max(0, Number(e.target.value) || 0) } : x))}
              className="w-16 h-9" />
            <span className="text-[11px] text-muted-foreground">дн.</span>
            <button type="button" onClick={() => onChange(chain.filter((_, idx) => idx !== i))}
              className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Удалить касание"><X className="w-3.5 h-3.5" /></button>
          </div>
          <Textarea value={t.text} rows={2} placeholder="Текст касания…"
            onChange={e => onChange(chain.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))}
            className="min-h-[56px]" />
        </div>
      ))}
    </div>
  )
}

// ── Полоса «Три зоны»: красная / жёлтая / зелёная ────────────────────────────
function ZoneBar({ lower, upper }: { lower: number; upper: number }) {
  const lo = Math.max(0, Math.min(100, Math.min(lower, upper)))
  const hi = Math.max(0, Math.min(100, upper))
  return (
    <div className="space-y-1">
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-border">
        {lo > 0 && <div className="bg-red-500/70" style={{ width: `${lo}%` }} title={`Красная зона: 0–${lo - 1}`} />}
        {hi > lo && <div className="bg-amber-400/80" style={{ width: `${hi - lo}%` }} title={`Жёлтая зона: ${lo}–${hi - 1}`} />}
        {hi < 100 && <div className="bg-emerald-500/70" style={{ width: `${100 - hi}%` }} title={`Зелёная зона: ${hi}–100`} />}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        {/* Пустые зоны → подписи скрываем вслед за сегментами: красная при
            lower=0, жёлтая при lower==threshold */}
        {lo > 0 && <span className="text-red-600 dark:text-red-400">&lt;{lo} отказ/разбор</span>}
        {hi > lo && <span className="text-amber-600 dark:text-amber-400">{lo}–{hi - 1} жёлтая</span>}
        <span className="text-emerald-600 dark:text-emerald-400">≥{hi} дальше</span>
        <span>100</span>
      </div>
    </div>
  )
}

// ── Строка стадии в левом списке ─────────────────────────────────────────────
function StageRow({ stage, index, selected, onSelect }: {
  stage: FunnelV2Stage; index: number; selected: boolean; onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const meta = actionMeta(stage.action)
  const Icon = ICONS[meta.icon] ?? MessageSquare
  const enabled = isStageEnabled(stage)
  const gate = stage.rule.scoreGate
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg border bg-card transition-colors",
        selected ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40",
        isDragging && "opacity-60 shadow-lg", !enabled && "opacity-55")}>
      <div className="flex items-center gap-2 p-2.5">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground touch-none shrink-0" aria-label="Перетащить"><GripVertical className="w-4 h-4" /></button>
        <span className="grid place-items-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-medium shrink-0">{index + 1}</span>
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <button type="button" onClick={onSelect} className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium truncate">{stage.title?.trim() || meta.label}</div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{meta.label}</span>
            {gate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                {SCORE_GATE_TYPE_LABEL[gate.scoreType]}{typeof gate.thresholdLower === "number" ? ` ${gate.thresholdLower}/${gate.threshold}` : ` ≥${gate.threshold}`} · авто {gate.autoEnabled ? "вкл" : "выкл"}
              </span>
            )}
            {!enabled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 inline-flex items-center gap-0.5"><Ban className="w-2.5 h-2.5" /> выкл</span>}
          </div>
        </button>
      </div>
    </div>
  )
}

// ── Главный экран «Воронка 3» ────────────────────────────────────────────────
export function FunnelV3Editor({ vacancyId }: { vacancyId: string }) {
  const [config, setConfig] = useState<FunnelV2Config | null>(null)
  const [content, setContent] = useState<ContentBlock[]>([])
  const [dripTemplates, setDripTemplates] = useState<DripTemplates | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  // Конфиг — тот же роут, что v2-билдер (единый источник, никакой копии данных)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-v2`).then(r => r.ok ? r.json() : null)
      .then((d: { config?: FunnelV2Config } | null) => {
        if (cancelled) return
        const cfg = d?.config ? normalizeFunnelV2(d.config) : emptyFunnelV2()
        setConfig(cfg)
        setSelectedId(cfg.stages[0]?.id ?? null)
      })
      .catch(() => { if (!cancelled) setConfig(emptyFunnelV2()) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  // Блоки «Контента» (для привязки contentBlockId) — как в v2-билдере
  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/demos?vacancy_id=${encodeURIComponent(vacancyId)}&list=1`).then(r => r.ok ? r.json() : null)
      .then((d: { data?: Array<{ id: string; title: string; content_type?: string; contentType?: string }> } | Array<{ id: string; title: string; content_type?: string; contentType?: string }> | null) => {
        if (cancelled) return
        const rows = Array.isArray(d) ? d : (d?.data ?? [])
        setContent(rows.map(r => ({ id: r.id, title: r.title || "Без названия", contentType: r.contentType || r.content_type || "presentation" })))
      })
      .catch(() => { if (!cancelled) setContent([]) })
    return () => { cancelled = true }
  }, [vacancyId])

  // Редактируемые drip-шаблоны для дефолтных цепочек дожима (как в v2-билдере)
  useEffect(() => {
    fetch("/api/modules/hr/company/drip-templates")
      .then(r => r.ok ? r.json() : null)
      .then((d: { templates?: DripTemplates } | null) => { if (d?.templates) setDripTemplates(d.templates) })
      .catch(() => {})
  }, [])

  // Автосохранение (debounce) — тот же PUT, что v2-билдер
  const persist = useCallback((next: FunnelV2Config) => {
    setSaveState("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-v2`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: next }),
        })
        if (!res.ok) throw new Error()
        setSaveState("saved"); setTimeout(() => setSaveState("idle"), 1500)
      } catch { setSaveState("idle"); toast.error("Не удалось сохранить воронку") }
    }, 600)
  }, [vacancyId])
  const update = useCallback((next: FunnelV2Config) => { setConfig(next); persist(next) }, [persist])

  const stages = useMemo(() => config?.stages ?? [], [config])
  const stageIds = useMemo(() => stages.map(s => s.id), [stages])
  const selected = stages.find(s => s.id === selectedId) ?? null
  const selectedIndex = stages.findIndex(s => s.id === selectedId)

  const patchStage = (id: string, p: Partial<FunnelV2Stage>) => {
    if (!config) return
    update({ ...config, stages: config.stages.map(s => s.id === id ? { ...s, ...p } : s) })
  }
  const addStage = (action: StageActionType) => {
    if (!config) return
    const st = makeStage(action, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
    update({ ...config, stages: [...config.stages, st] })
    setSelectedId(st.id)
  }
  const removeStage = (id: string) => {
    if (!config) return
    const st = config.stages.find(s => s.id === id)
    if (!confirm(`Удалить стадию «${st?.title?.trim() || actionMeta(st?.action ?? "message").label}»? Действие нельзя отменить.`)) return
    const nextStages = config.stages.filter(s => s.id !== id)
    update({ ...config, stages: nextStages })
    if (selectedId === id) setSelectedId(nextStages[0]?.id ?? null)
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (!config) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = config.stages.findIndex(s => s.id === active.id)
    const to = config.stages.findIndex(s => s.id === over.id)
    if (from < 0 || to < 0) return
    update({ ...config, stages: arrayMove(config.stages, from, to) })
  }

  if (loading) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка…</div>

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Воронка 3 — конструктор стадий</h3>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">owner</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Единый экран поверх движка Воронки v2 — тот же конфиг и рантайм, редактирование по стадиям.
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0 mt-1">
          {saveState === "saving" ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> сохранение…</span>
            : saveState === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3 h-3" /> сохранено</span> : null}
        </span>
      </div>

      {/* Все стадии выключены: движок не обрабатывает новых кандидатов
          автоматически (process-queue оставляет их на ручном разборе). */}
      {stages.length > 0 && stages.every(s => !isStageEnabled(s)) && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Все стадии выключены — новые кандидаты не обрабатываются автоматически и остаются на ручном разборе. Включите хотя бы одну стадию.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* ── Слева: список стадий ── */}
        <div className="w-full lg:w-80 shrink-0 space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {stages.map((s, i) => (
                  <StageRow key={s.id} stage={s} index={i} selected={s.id === selectedId} onSelect={() => setSelectedId(s.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full rounded-lg border border-dashed border-border py-2.5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                <Plus className="w-4 h-4" /> Добавить стадию
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-64">
              {STAGE_ACTIONS.map(a => { const Icon = ICONS[a.icon] ?? MessageSquare; return (
                <DropdownMenuItem key={a.type} className="gap-2 cursor-pointer" onClick={() => addStage(a.type)}>
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <div className="flex flex-col"><span className="text-sm">{a.label}</span><span className="text-[11px] text-muted-foreground">{a.desc}</span></div>
                </DropdownMenuItem>
              )})}
            </DropdownMenuContent>
          </DropdownMenu>
          {stages.length === 0 && (
            <p className="text-[11px] text-muted-foreground/70 px-1">
              Стадий пока нет — добавьте первую или соберите воронку во вкладке «Воронка v2» (конфиг общий).
            </p>
          )}
        </div>

        {/* ── Справа: разворот выбранной стадии ── */}
        <div className="flex-1 min-w-0 w-full">
          {!selected ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Выберите стадию слева или добавьте новую.
            </div>
          ) : (
            <StageDetail
              key={selected.id}
              stage={selected}
              index={selectedIndex}
              allStages={stages}
              content={content}
              dripTemplates={dripTemplates}
              onPatch={p => patchStage(selected.id, p)}
              onRemove={() => removeStage(selected.id)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Правая карточка: все секции стадии ───────────────────────────────────────
function StageDetail({ stage, index, allStages, content, dripTemplates, onPatch, onRemove }: {
  stage: FunnelV2Stage
  index: number
  allStages: FunnelV2Stage[]
  content: ContentBlock[]
  dripTemplates?: DripTemplates
  onPatch: (p: Partial<FunnelV2Stage>) => void
  onRemove: () => void
}) {
  const meta = actionMeta(stage.action)
  const Icon = ICONS[meta.icon] ?? MessageSquare
  const enabled = isStageEnabled(stage)
  const isContent = CONTENT_ACTIONS.includes(stage.action)
  const isPrequal = stage.action === "prequalification"
  // security_check/reference_check — no-op в executeStageEntry (сообщений при
  // входе нет); hired шлёт ТОЛЬКО «Прощание» → поле «Приглашение» было бы
  // мёртвым, показываем пояснение.
  const isNoopAction = stage.action === "security_check" || stage.action === "reference_check" || stage.action === "hired"

  // «Выключенный хвост»: после этой стадии в конфиге есть стадии, но все
  // выключены — прошедшие предыдущую включённую стадию зависнут на ручном
  // разборе (движок НЕ ставит hired). Предупреждаем при выключении и показываем
  // постоянную плашку.
  const stagesAfter = index >= 0 ? allStages.slice(index + 1) : []
  // every на пустом массиве = true — НАМЕРЕННО: выключение ПОСЛЕДНЕЙ стадии
  // тоже создаёт выключенный хвост для предыдущей включённой (кандидаты
  // зависнут на ручном разборе). Для единственной стадии дублирует верхний
  // баннер «все стадии выключены» — это ок.
  const disabledTail = stagesAfter.every(s => !isStageEnabled(s))
  const toggleEnabled = (v: boolean) => {
    if (!v && disabledTail) {
      toast.warning("После этой стадии не остаётся включённых — кандидаты, прошедшие предыдущую стадию, зависнут на ручном разборе.")
    }
    onPatch({ enabled: v ? undefined : false })
  }

  const patchRule = (p: Partial<FunnelV2Stage["rule"]>) => onPatch({ rule: { ...stage.rule, ...p } })
  const gate = stage.rule.scoreGate
  const patchGate = (p: Partial<ScoreGate>) => {
    const base: ScoreGate = gate ?? { scoreType: "resume", threshold: DEFAULT_SCORE_GATE_THRESHOLD, failAction: "preliminary_reject" as ScoreGateFailAction, autoEnabled: false }
    patchRule({ scoreGate: { ...base, ...p } })
  }

  // Сообщения стадии (приглашение): messages ?? [messagePresetId] — та же
  // обратная совместимость, что в v2-билдере; пишем всегда в messages.
  const msgList: string[] = stage.messages ?? (stage.messagePresetId ? [stage.messagePresetId] : [""])
  const setMsgList = (next: string[]) => onPatch({ messages: next })

  // Смена типа стадии: пересобираем дефолтные цепочки дожима под новый тип
  // (как в v2-билдере), остальные поля стадии сохраняем.
  const changeAction = (t: StageActionType) => onPatch({
    action: t,
    dozhimChain: dozhimChainFor(stage.dozhim, t, dripTemplates),
    dozhimChainOpened: dozhimChainForOpened(stage.dozhim, t, dripTemplates),
  })

  // Дожим: эффективные цепочки (заданные ИЛИ дефолт пресета) — готовые структуры
  const chainA: DozhimTouch[] = stage.dozhimChain ?? dozhimChainFor(stage.dozhim, stage.action, dripTemplates)
  const chainB: DozhimTouch[] = stage.dozhimChainOpened ?? dozhimChainForOpened(stage.dozhim, stage.action, dripTemplates)

  const threeZones = typeof gate?.thresholdLower === "number"

  return (
    <div className="rounded-xl border border-border bg-card divide-y">
      {/* (1) Шапка: тумблер + название + тип */}
      <section className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={toggleEnabled} aria-label={enabled ? "Выключить стадию" : "Включить стадию"} />
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">Стадия {index + 1}</span>
          {!enabled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">выключена — кандидаты проскакивают дальше</span>}
          <button type="button" onClick={onRemove} className="ml-auto text-muted-foreground/50 hover:text-destructive transition-colors" aria-label="Удалить стадию" title="Удалить стадию"><Trash2 className="w-4 h-4" /></button>
        </div>
        {!enabled && disabledTail && (
          <p className="rounded-md border border-amber-400/60 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            После этой стадии не остаётся включённых: кандидаты, прошедшие предыдущую включённую стадию, останутся на ручном разборе (движок НЕ помечает их «Нанят»).
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Название стадии</Label>
            <Input value={stage.title ?? ""} onChange={e => onPatch({ title: e.target.value || undefined })} placeholder={meta.label} className="h-10" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Тип стадии</Label>
            <Select value={stage.action} onValueChange={v => changeAction(v as StageActionType)}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_ACTIONS.map(a => <SelectItem key={a.type} value={a.type}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* (2) Что видит кандидат */}
      <section className="p-4 space-y-2">
        <Label className="text-sm font-medium flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Что видит кандидат</Label>
        {isContent ? (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Блок из «Контента»</Label>
            <Select value={stage.contentBlockId ?? "none"} onValueChange={v => onPatch({ contentBlockId: v === "none" ? null : v })}>
              <SelectTrigger className="h-10"><SelectValue placeholder="не выбрано" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— не подключать —</SelectItem>
                {content.map(c => <SelectItem key={c.id} value={c.id}>{c.title} · {c.contentType === "test" || c.contentType === "task" ? "тест" : "демо"}</SelectItem>)}
              </SelectContent>
            </Select>
            {content.length === 0 && <p className="text-[11px] text-muted-foreground/70">Блоков пока нет — создайте во вкладке «Контент».</p>}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/70">Для типа «{meta.label}» контент-блок не подключается — кандидат получает только сообщения стадии.</p>
        )}
      </section>

      {/* (3) Проход дальше */}
      <section className="p-4 space-y-3">
        <Label className="text-sm font-medium flex items-center gap-1.5"><Route className="w-4 h-4" /> Проход дальше</Label>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Шкала (по какому баллу)</Label>
            <Select value={gate?.scoreType ?? "none"} onValueChange={v => {
              if (v === "none") { patchRule({ scoreGate: undefined }); return }
              patchGate({ scoreType: v as ScoreGateType })
            }}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Не гейтить" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— вручную, без гейта —</SelectItem>
                {SCORE_GATE_TYPES.map(t => <SelectItem key={t} value={t}>{SCORE_GATE_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {gate && (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Порог прохода (зелёная зона)</Label>
              <div className="flex items-center gap-1.5">
                <Input type="number" min={0} max={100} value={gate.threshold}
                  onChange={e => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                    patchGate({ threshold: v, ...(typeof gate.thresholdLower === "number" && gate.thresholdLower > v ? { thresholdLower: v } : {}) })
                  }}
                  className="w-24 h-10" />
                <span className="text-[11px] text-muted-foreground">из 100</span>
              </div>
            </div>
          )}
        </div>
        {gate && !threeZones && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Что делать с непрошедшими</Label>
            <Select value={gate.failAction} onValueChange={v => patchGate({ failAction: v as ScoreGateFailAction })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCORE_GATE_FAIL_ACTIONS.map(f => <SelectItem key={f} value={f}>{SCORE_GATE_FAIL_LABEL[f]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {gate && threeZones && (
          <p className="text-[11px] text-muted-foreground/70">Действия с непрошедшими задаются зонами ниже (жёлтая / красная).</p>
        )}
        {gate ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="min-w-0">
              <span className="text-xs font-medium">Автоматический проход</span>
              <p className="text-[11px] text-muted-foreground/80">Выключено — кандидатов двигаешь вручную; включи, когда доверишь баллу.</p>
            </div>
            <Switch checked={gate.autoEnabled} onCheckedChange={v => patchGate({ autoEnabled: v })} className="shrink-0" />
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/70">Балл на этой стадии не проверяется — кандидатов двигаешь вручную.</p>
        )}
      </section>

      {/* (4) Три зоны */}
      {gate && (
        <section className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-medium flex items-center gap-1.5"><Gauge className="w-4 h-4" /> Три зоны</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{threeZones ? "включены" : "две зоны (только порог прохода)"}</span>
              <Switch checked={threeZones}
                onCheckedChange={v => patchGate({ thresholdLower: v ? Math.max(0, gate.threshold - 20) : undefined })} />
            </div>
          </div>
          {threeZones ? (
            <>
              <ZoneBar lower={gate.thresholdLower!} upper={gate.threshold} />
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Нижний порог (красная / жёлтая)</Label>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" min={0} max={gate.threshold} value={gate.thresholdLower!}
                      onChange={e => patchGate({ thresholdLower: Math.max(0, Math.min(gate.threshold, Number(e.target.value) || 0)) })}
                      className="w-24 h-10" />
                    <span className="text-[11px] text-muted-foreground">≤ {gate.threshold}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Жёлтая зона (между порогами)</Label>
                  <Select value={gate.middleAction ?? "manual_review"} onValueChange={v => patchGate({ middleAction: v as ScoreGateMiddleAction })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MIDDLE_ACTION_LABEL) as ScoreGateMiddleAction[]).map(m => (
                        <SelectItem key={m} value={m}>{MIDDLE_ACTION_LABEL[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {gate.middleAction === "prequalification" && (
                    <>
                      <p className="text-[11px] text-muted-foreground/70">Кандидат уйдёт на ближайшую включённую стадию «Предквалификация» НИЖЕ текущей (дальше по списку); если её нет — ручной разбор.</p>
                      {!stagesAfter.some(s => s.action === "prequalification" && isStageEnabled(s)) && (
                        <p className="rounded-md border border-amber-400/60 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
                          Ниже текущей нет включённой стадии «Предквалификация» — жёлтая зона фактически уйдёт на ручной разбор. Добавьте стадию ниже или выберите «Ручной разбор».
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="min-w-0">
                  <span className="text-xs font-medium text-rose-700 dark:text-rose-400">Авто-отказ красной зоны</span>
                  <p className="text-[11px] text-muted-foreground/80">Выключено — красная зона уходит на ручной разбор с пометкой; включено — отказ автоматически (текст — «Отказ» ниже).</p>
                </div>
                <Switch checked={gate.autoRejectRed === true} onCheckedChange={v => patchGate({ autoRejectRed: v ? true : undefined })} className="shrink-0" />
              </div>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              Включите, чтобы разделить непрошедших на красную (сильно ниже порога) и жёлтую (пограничные) зоны с разными действиями.
            </p>
          )}
        </section>
      )}

      {/* (5) Тексты стадии */}
      <section className="p-4 space-y-3">
        <Label className="text-sm font-medium flex items-center gap-1.5"><MessageSquare className="w-4 h-4" /> Тексты стадии</Label>
        {isNoopAction ? (
          <p className="text-[11px] text-muted-foreground/70">
            Тип «{meta.label}» пока не отправляет сообщений при входе — поле «Приглашение» не используется.
            {stage.action === "hired" && " На этой стадии кандидату уходит только «Прощание» ниже."}
          </p>
        ) : !isPrequal ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">Приглашение (сообщения кандидату при входе в стадию)</Label>
              <button type="button" onClick={() => setMsgList([...msgList, ""])} className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"><Plus className="w-3 h-3" /> сообщение</button>
            </div>
            {msgList.map((m, i) => (
              <div key={i} className="rounded-md border p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">Сообщение {i + 1}</span>
                  {msgList.length > 1 && (
                    <button type="button" onClick={() => { const next = msgList.filter((_, idx) => idx !== i); setMsgList(next.length > 0 ? next : [""]) }}
                      className="text-muted-foreground hover:text-destructive" aria-label="Удалить сообщение"><X className="w-3.5 h-3.5" /></button>
                  )}
                </div>
                <Textarea value={m} onChange={e => setMsgList(msgList.map((x, idx) => idx === i ? e.target.value : x))}
                  placeholder="напр. «Добрый день, {{name}}! …»" className="min-h-[90px]" />
                <div className="flex flex-wrap gap-1">
                  {["{{name}}", (stage.action === "test" || stage.action === "task") ? "{{test_link}}" : "{{demo_link}}", "{{vacancy}}", "{{company}}"].map(ph => (
                    <button key={ph} type="button" onClick={() => setMsgList(msgList.map((x, idx) => idx === i ? `${x}${ph}` : x))}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/50 font-mono">{ph}</button>
                  ))}
                </div>
              </div>
            ))}
            {msgList.length > 1 && (
              <p className="text-[11px] text-muted-foreground/70">Несколько сообщений уйдут кандидату одним сообщением (по абзацам).</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/70">Предквалификация — бот сам ведёт диалог (вопросы из подключённого блока), отдельное приглашение не требуется.</p>
        )}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Отказ (не прошёл стадию)</Label>
          <Textarea value={stage.rejectText ?? ""} onChange={e => onPatch({ rejectText: e.target.value || undefined })}
            placeholder="Пусто — используется текст из правила прохода или стандартный текст отказа вакансии" className="min-h-[80px]" />
          <div className="flex flex-wrap gap-1">
            {["{{name}}", "{{vacancy}}", "{{company}}"].map(ph => (
              <button key={ph} type="button" onClick={() => onPatch({ rejectText: `${stage.rejectText ?? ""}${ph}` })}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/50 font-mono">{ph}</button>
            ))}
          </div>
          {/* Честная подпись: при какой конфигурации текст РЕАЛЬНО отправляется.
              Зеркалирует порядок ДВИЖКА: при включённом авто-гейте
              evaluateScoreGate ТЕРМИНАЛЕН — легаси-шаг autoReject выполняется
              только пока балл шкалы гейта не посчитан. */}
          {(() => {
            const legacyAutoReject = stage.rule.autoReject === true &&
              (typeof stage.rule.threshold === "number" || typeof stage.rule.objThreshold === "number")
            const gateAuto = gate?.autoEnabled === true
            // Легаси-ветка — ТОЛЬКО когда авто-гейт не активен (иначе движок её не выполняет).
            if (legacyAutoReject && !gateAuto) {
              return <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Отправляется не прошедшим порог авто-отказа (включён в правиле стадии — вкладка «Воронка v2»).
                Текст: этот «Отказ» → текст правила прохода → стандартный текст отказа вакансии.
              </p>
            }
            // Оба включены: приоритет у гейта — говорим об этом честно.
            const bothNote = legacyAutoReject && gateAuto
              ? <p className="text-[11px] text-muted-foreground/70">Легаси-порог авто-отказа тоже включён: приоритет у гейта по баллу; легаси-порог сработает только пока балл шкалы гейта не посчитан.</p>
              : null
            if (!gate) return <p className="text-[11px] text-muted-foreground/70">Сейчас не отправляется: гейт по баллу не настроен.</p>
            if (!gateAuto) return <p className="text-[11px] text-muted-foreground/70">Сейчас не отправляется: «Автоматический проход» выключен.</p>
            if (threeZones) {
              return <>
                {gate.autoRejectRed === true
                  ? <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Отправляется кандидатам красной зоны (авто-отказ красной зоны включён).</p>
                  : <p className="text-[11px] text-muted-foreground/70">Сейчас не отправляется: красная зона уходит на ручной разбор без сообщения.</p>}
                {bothNote}
              </>
            }
            return <>
              {gate.failAction === "reject"
                ? <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Отправляется не прошедшим порог (действие «Отказ»).</p>
                : <p className="text-[11px] text-muted-foreground/70">Сейчас не отправляется: действие «{SCORE_GATE_FAIL_LABEL[gate.failAction].toLowerCase()}» без сообщения.</p>}
              {bothNote}
            </>
          })()}
        </div>
        {stage.action === "hired" && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Прощание (финал воронки)</Label>
            <Textarea value={stage.farewellText ?? ""} onChange={e => onPatch({ farewellText: e.target.value || undefined })}
              placeholder="Пусто — прощание не отправляется" className="min-h-[80px]" />
            <p className="text-[11px] text-muted-foreground/70">Отправляется кандидату при входе в стадию «Нанят».</p>
          </div>
        )}
      </section>

      {/* (6) Дожим стадии — редактор только для типов, где рантайм РЕАЛЬНО
          запускает дожим (executeStageEntry → scheduleV2Dozhim: demo,
          prequalification, test, task). Для остальных — честное пояснение. */}
      {!DOZHIM_ACTIONS.includes(stage.action) ? (
        <section className="p-4 space-y-2">
          <Label className="text-sm font-medium flex items-center gap-1.5"><Repeat className="w-4 h-4" /> Дожим стадии</Label>
          <p className="text-[11px] text-muted-foreground/70">
            Для типа «{meta.label}» рантайм не запускает дожим — цепочки касаний не отправляются.
            Дожим работает на стадиях: Демонстрация, Предквалификация, Тест-вопросы, Тест-задание.
          </p>
        </section>
      ) : (
      <section className="p-4 space-y-3">
        <Label className="text-sm font-medium flex items-center gap-1.5"><Repeat className="w-4 h-4" /> Дожим стадии</Label>
        <div className="flex gap-1">
          {DOZHIM_OPTS.map(d => (
            <button key={d} type="button"
              onClick={() => onPatch({ dozhim: d, dozhimChain: dozhimChainFor(d, stage.action, dripTemplates), dozhimChainOpened: dozhimChainForOpened(d, stage.action, dripTemplates) })}
              className={cn("text-[11px] px-2 py-1 rounded-md border flex-1 transition-colors",
                stage.dozhim === d ? "bg-primary/10 border-primary text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/50")}>
              {DOZHIM_LABEL[d]}
            </button>
          ))}
        </div>
        <DozhimChainEditor
          title="Ветка «не открыл»"
          chain={chainA}
          onChange={next => onPatch({ dozhimChain: next })}
        />
        <DozhimChainEditor
          title="Ветка «открыл, не завершил»"
          hint="Включается, когда кандидат открыл демо/тест, но не дошёл до конца. Пусто = после открытия дожим прекращается."
          chain={chainB}
          onChange={next => onPatch({ dozhimChainOpened: next })}
        />
      </section>
      )}
    </div>
  )
}
