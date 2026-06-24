"use client"

// Воронка v2 — конструктор «стадий» (FUNNEL-V2.md, Фаза 1).
// Стадия 1 = Портрет (read-only сводка из spec). Стадии 2…N — редактируемые
// карточки: действие + сообщение-пресет + правило прохода + дожим + hh-статус +
// напоминания. DnD-реордер. Фаза 1 — конструктор без рантайма (ничего не
// исполняет). Видно только владельцу (гейт на странице + 404 на API).

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
  GripVertical, Trash2, ChevronDown, ChevronUp, Plus, Loader2, Target, ExternalLink,
  ClipboardList, PlayCircle, ListChecks, ClipboardCheck, Calendar, FileText,
  ShieldCheck, Phone, MessageSquare, CircleCheck, Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  STAGE_ACTIONS, DOZHIM_LABEL, makeStage, emptyFunnelV2, normalizeFunnelV2,
  type FunnelV2Config, type FunnelV2Stage, type StageActionType,
  type DozhimPreset, type InterviewMode,
} from "@/lib/funnel-v2/types"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "clipboard-list": ClipboardList, "player-play": PlayCircle, "list-check": ListChecks,
  "clipboard-check": ClipboardCheck, "calendar": Calendar, "file-text": FileText,
  "shield-check": ShieldCheck, "phone": Phone, "message": MessageSquare, "circle-check": CircleCheck,
}
function actionMeta(type: StageActionType) {
  return STAGE_ACTIONS.find(a => a.type === type) ?? STAGE_ACTIONS[0]
}
// Действия со скорингом (есть порог балла)
const SCORING_ACTIONS: StageActionType[] = ["prequalification", "test", "task"]
const INTERVIEW_MODES: Array<{ v: InterviewMode; label: string }> = [
  { v: "phone", label: "Телефон" }, { v: "zoom", label: "Zoom" }, { v: "office", label: "Офис" },
]
const DOZHIM_OPTS: DozhimPreset[] = ["off", "soft", "standard", "strong"]

// ── Карточка стадии (sortable) ───────────────────────────────────────────────
function StageCard({
  stage, index, onChange, onRemove,
}: {
  stage: FunnelV2Stage
  index: number
  onChange: (s: FunnelV2Stage) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const [open, setOpen] = useState(false)
  const meta = actionMeta(stage.action)
  const Icon = ICONS[meta.icon] ?? MessageSquare
  const isInterview = stage.action === "interview"
  const isScoring = SCORING_ACTIONS.includes(stage.action)

  const patch = (p: Partial<FunnelV2Stage>) => onChange({ ...stage, ...p })
  const patchRule = (p: Partial<FunnelV2Stage["rule"]>) => onChange({ ...stage, rule: { ...stage.rule, ...p } })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-xl border bg-card",
        open ? "border-primary/40" : "border-border",
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      {/* Шапка */}
      <div className="flex items-center gap-2.5 p-3">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground touch-none" aria-label="Перетащить">
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="grid place-items-center w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium shrink-0">{index + 2}</span>
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{stage.title?.trim() || meta.label}</div>
          {!open && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{meta.label}</span>
              {isInterview && stage.interviewMode && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{INTERVIEW_MODES.find(m => m.v === stage.interviewMode)?.label}</span>
              )}
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">дожим: {DOZHIM_LABEL[stage.dozhim].toLowerCase()}</span>
              {stage.hhStatus && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">hh: {stage.hhStatus}</span>}
            </div>
          )}
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground p-1" aria-label={open ? "Свернуть" : "Развернуть"}>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive p-1" aria-label="Удалить стадию">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Тело */}
      {open && (
        <div className="px-3 pb-3 pl-12 space-y-3.5">
          {/* Действие */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Действие — что делает кандидат</Label>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_ACTIONS.map(a => {
                const active = a.type === stage.action
                return (
                  <button
                    key={a.type}
                    type="button"
                    onClick={() => patch(a.type === "interview" ? { ...makeStage("interview", stage.id.slice(3)), id: stage.id, action: "interview", messagePresetId: stage.messagePresetId, title: stage.title } : { action: a.type })}
                    className={cn(
                      "text-xs px-2.5 py-1.5 rounded-md border transition-colors",
                      active ? "bg-blue-500/10 border-blue-400 text-blue-700 dark:text-blue-300 font-medium" : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >{a.label}</button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground/80">{meta.desc}</p>
          </div>

          {/* Параметры интервью */}
          {isInterview && (
            <div className="space-y-2.5 rounded-md border border-dashed p-2.5">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Тип встречи</Label>
                <div className="flex gap-1.5">
                  {INTERVIEW_MODES.map(m => (
                    <button key={m.v} type="button" onClick={() => patch({ interviewMode: m.v })}
                      className={cn("text-xs px-2.5 py-1 rounded-md border", stage.interviewMode === m.v ? "bg-blue-500/10 border-blue-400 text-blue-700 dark:text-blue-300 font-medium" : "border-border text-muted-foreground hover:bg-muted/50")}>{m.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Согласование времени</Label>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={stage.scheduling?.includes("bot") ?? false}
                      onChange={e => patch({ scheduling: e.target.checked ? [...new Set([...(stage.scheduling ?? []), "bot" as const])] : (stage.scheduling ?? []).filter(s => s !== "bot") })} />
                    Бот согласует в чате и пишет в календарь
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={stage.scheduling?.includes("self_link") ?? false}
                      onChange={e => patch({ scheduling: e.target.checked ? [...new Set([...(stage.scheduling ?? []), "self_link" as const])] : (stage.scheduling ?? []).filter(s => s !== "self_link") })} />
                    Ссылка для самозаписи
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Напоминания</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={stage.reminders?.dayBefore ?? false} onChange={e => patch({ reminders: { dayBefore: e.target.checked, morning: stage.reminders?.morning ?? false } })} /> За сутки
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={stage.reminders?.morning ?? false} onChange={e => patch({ reminders: { dayBefore: stage.reminders?.dayBefore ?? false, morning: e.target.checked } })} /> Утром в день встречи
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Сообщение-пресет + дожим */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Сообщение (пресет)</Label>
              <Input value={stage.messagePresetId ?? ""} onChange={e => patch({ messagePresetId: e.target.value || null })} placeholder="напр. «Приветствие»" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Дожим (если молчит)</Label>
              <div className="flex gap-1">
                {DOZHIM_OPTS.map(d => (
                  <button key={d} type="button" onClick={() => patch({ dozhim: d })}
                    className={cn("text-xs px-2 py-1 rounded-md border flex-1", stage.dozhim === d ? "bg-blue-500/10 border-blue-400 text-blue-700 dark:text-blue-300 font-medium" : "border-border text-muted-foreground hover:bg-muted/50")}>{DOZHIM_LABEL[d]}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Правило прохода */}
          <div className="space-y-2 rounded-md border p-2.5">
            <Label className="text-xs text-muted-foreground">Правило прохода</Label>
            <div className="flex items-center justify-between">
              <span className="text-xs">Авто-приглашение прошедших → следующая стадия</span>
              <Switch checked={stage.rule.autoAdvance} onCheckedChange={v => patchRule({ autoAdvance: v })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">Авто-отказ не прошедших</span>
              <Switch checked={stage.rule.autoReject} onCheckedChange={v => patchRule({ autoReject: v })} />
            </div>
            {isScoring && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Порог балла</span>
                <Input type="number" value={stage.rule.threshold ?? ""} onChange={e => patchRule({ threshold: e.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-20 h-7 text-sm" placeholder="—" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Задержка отказа, мин</span>
              <Input type="number" value={stage.rule.rejectDelayMinutes} onChange={e => patchRule({ rejectDelayMinutes: Math.max(0, Number(e.target.value) || 0) })} className="w-20 h-7 text-sm" />
              {stage.rule.rejectDelayMinutes >= 60 && <span className="text-[11px] text-muted-foreground">= {Math.floor(stage.rule.rejectDelayMinutes / 60)} ч{stage.rule.rejectDelayMinutes % 60 ? ` ${stage.rule.rejectDelayMinutes % 60} мин` : ""}</span>}
            </div>
          </div>

          {/* hh-статус + название */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">hh-статус при входе</Label>
              <Input value={stage.hhStatus ?? ""} onChange={e => patch({ hhStatus: e.target.value || undefined })} placeholder="напр. «первичный контакт»" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Название стадии (необяз.)</Label>
              <Input value={stage.title ?? ""} onChange={e => patch({ title: e.target.value || undefined })} placeholder={meta.label} className="h-8 text-sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Стадия 1: Портрет (read-only сводка) ─────────────────────────────────────
interface SpecSummary { upper?: number; lower?: number; autoReject?: boolean; autoInvite?: boolean; stops: string[]; criteriaCount: number }

function PortraitStageCard({ summary, loading, onOpen }: { summary: SpecSummary | null; loading: boolean; onOpen?: () => void }) {
  const empty = !loading && summary && summary.criteriaCount === 0 && summary.stops.length === 0
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium shrink-0">1</span>
        <Target className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Отклик → скан резюме <span className="text-[11px] text-muted-foreground font-normal">· из Портрета</span></div>
        </div>
        {onOpen && (
          <button onClick={onOpen} className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">Открыть Портрет <ExternalLink className="w-3 h-3" /></button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5 pl-9">
        {loading ? (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> загрузка…</span>
        ) : summary ? (<>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">пороги &lt;{summary.lower ?? 40} / {summary.lower ?? 40}–{(summary.upper ?? 75) - 1} / ≥{summary.upper ?? 75}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">авто-отказ {summary.autoReject ? "вкл" : "выкл"}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">авто-приглашение {summary.autoInvite ? "вкл" : "выкл"}</span>
          {summary.stops.length > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">стоп: {summary.stops.join(", ")}</span>}
          {empty && <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground/70">пусто → 100% проходят дальше</span>}
        </>) : (
          <span className="text-[11px] text-muted-foreground/70">Портрет не настроен → проходят все</span>
        )}
      </div>
    </div>
  )
}

// ── Главный конструктор ──────────────────────────────────────────────────────
export function FunnelV2Builder({ vacancyId, onOpenPortrait }: { vacancyId: string; onOpenPortrait?: () => void }) {
  const [config, setConfig] = useState<FunnelV2Config | null>(null)
  const [summary, setSummary] = useState<SpecSummary | null>(null)
  const [specLoading, setSpecLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  // Загрузка конфигурации воронки v2
  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-v2`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { config?: FunnelV2Config } | null) => { if (!cancelled) setConfig(d?.config ? normalizeFunnelV2(d.config) : emptyFunnelV2()) })
      .catch(() => { if (!cancelled) setConfig(emptyFunnelV2()) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  // Загрузка сводки Портрета (стадия 1)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/core/spec/${vacancyId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { spec?: Record<string, unknown> } | null) => {
        if (cancelled) return
        const spec = d?.spec
        if (!spec) { setSummary(null); return }
        const rt = (spec.resumeThresholds ?? {}) as Record<string, unknown>
        const sf = (spec.stopFactors ?? {}) as Record<string, unknown>
        const STOP_LABELS: Record<string, string> = { city: "город", format: "формат", age: "возраст", experience: "опыт", documents: "документы", citizenship: "гражданство", salaryExpectation: "зарплата" }
        const stops = Object.keys(sf).filter(k => sf[k] && (sf[k] as { enabled?: boolean }).enabled !== false).map(k => STOP_LABELS[k] ?? k)
        const nice = Array.isArray(spec.niceToHave) ? spec.niceToHave.length : 0
        const must = Array.isArray(spec.mustHave) ? spec.mustHave.length : 0
        const deal = Array.isArray(spec.dealBreakers) ? spec.dealBreakers.length : 0
        setSummary({
          upper: typeof rt.upperThreshold === "number" ? rt.upperThreshold : undefined,
          lower: typeof rt.lowerThreshold === "number" ? rt.lowerThreshold : undefined,
          autoReject: rt.autoRejectEnabled === true,
          autoInvite: rt.autoInviteEnabled === true,
          stops,
          criteriaCount: nice + must + deal,
        })
      })
      .catch(() => { if (!cancelled) setSummary(null) })
      .finally(() => { if (!cancelled) setSpecLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  // Сохранение (дебаунс)
  const persist = useCallback((next: FunnelV2Config) => {
    setSaveState("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-v2`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: next }),
        })
        if (!res.ok) throw new Error()
        setSaveState("saved")
        setTimeout(() => setSaveState("idle"), 1500)
      } catch { setSaveState("idle"); toast.error("Не удалось сохранить воронку") }
    }, 600)
  }, [vacancyId])

  const update = useCallback((next: FunnelV2Config) => { setConfig(next); persist(next) }, [persist])

  const stages = config?.stages ?? []
  const stageIds = useMemo(() => stages.map(s => s.id), [stages])

  const addStage = (action: StageActionType) => {
    if (!config) return
    const st = makeStage(action, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
    update({ ...config, stages: [...config.stages, st] })
  }
  const changeStage = (i: number, s: FunnelV2Stage) => { if (!config) return; update({ ...config, stages: config.stages.map((x, idx) => idx === i ? s : x) }) }
  const removeStage = (i: number) => { if (!config) return; update({ ...config, stages: config.stages.filter((_, idx) => idx !== i) }) }
  const onDragEnd = (e: DragEndEvent) => {
    if (!config) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = config.stages.findIndex(s => s.id === active.id)
    const to = config.stages.findIndex(s => s.id === over.id)
    if (from < 0 || to < 0) return
    update({ ...config, stages: arrayMove(config.stages, from, to) })
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка…</div>
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Воронка v2 — стадии</h3>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">beta · только для вас</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Конструктор пути кандидата. Пока настраиваете и видите — кандидатов ещё не ведёт.</p>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0 mt-1">
          {saveState === "saving" ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> сохранение…</span>
            : saveState === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3 h-3" /> сохранено</span> : null}
        </span>
      </div>

      {/* Стадия 1 — Портрет */}
      <PortraitStageCard summary={summary} loading={specLoading} onOpen={onOpenPortrait} />

      {/* Стадии 2…N */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5">
            {stages.map((s, i) => (
              <StageCard key={s.id} stage={s} index={i} onChange={(ns) => changeStage(i, ns)} onRemove={() => removeStage(i)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Добавить стадию */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full rounded-xl border border-dashed border-border py-3 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
            <Plus className="w-4 h-4" /> Добавить стадию
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-64">
          {STAGE_ACTIONS.map(a => {
            const Icon = ICONS[a.icon] ?? MessageSquare
            return (
              <DropdownMenuItem key={a.type} className="gap-2 cursor-pointer" onClick={() => addStage(a.type)}>
                <Icon className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm">{a.label}</span>
                  <span className="text-[11px] text-muted-foreground">{a.desc}</span>
                </div>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {stages.length === 0 && (
        <p className="text-xs text-muted-foreground text-center pt-1">Стадия 1 (Портрет) уже есть. Добавьте следующие стадии пути — приветствие, демо, тест, интервью, оффер…</p>
      )}
    </div>
  )
}
