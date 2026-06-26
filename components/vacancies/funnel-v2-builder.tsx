"use client"

// Воронка v2 — конструктор «стадий» (FUNNEL-V2.md, Фаза 1).
// Карточка стадии = компактная сводка; клик → Sheet со всеми настройками
// (действие, сообщение/контент, правило прохода+куда зовёт, цепочка дожима,
// hh-статус, интервью). Стадия 1 = Портрет (read-only из spec). Конструктор
// без рантайма. Видно только владельцу (гейт на странице + 404 на API).

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
  GripVertical, Trash2, Plus, Loader2, Target, ExternalLink, ChevronRight,
  ClipboardList, PlayCircle, ListChecks, ClipboardCheck, Calendar, FileText,
  ShieldCheck, Phone, MessageSquare, CircleCheck, Check, Link2, Route, Repeat, X,
  Maximize2, Minimize2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter,
} from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  STAGE_ACTIONS, DOZHIM_LABEL, STAGE_STATUSES, makeStage, emptyFunnelV2,
  normalizeFunnelV2, dozhimChainFor,
  type FunnelV2Config, type FunnelV2Stage, type StageActionType,
  type DozhimPreset, type InterviewMode, type DozhimTouch,
} from "@/lib/funnel-v2/types"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "clipboard-list": ClipboardList, "player-play": PlayCircle, "list-check": ListChecks,
  "clipboard-check": ClipboardCheck, "calendar": Calendar, "file-text": FileText,
  "shield-check": ShieldCheck, "phone": Phone, "message": MessageSquare, "circle-check": CircleCheck,
}
function actionMeta(type: StageActionType) { return STAGE_ACTIONS.find(a => a.type === type) ?? STAGE_ACTIONS[0] }
const SCORING_ACTIONS: StageActionType[] = ["prequalification", "test", "task"]
const CONTENT_ACTIONS: StageActionType[] = ["demo", "test", "task", "prequalification"]

// Результат «сухого прогона» воронки (lib/funnel-v2/simulate.ts → SimResult)
interface SimTraceEntry {
  step: number
  stageId: string
  title?: string
  action: string
  contentBlock: { demoKind: string; title: string | null; lessons: number } | null
  decision?: string
  scoring?: {
    questions: number
    gradedObjective: number
    hasAiQuestions: boolean
    strong: { scorePercent: number; decision: string }
    weak: { scorePercent: number; decision: string }
  }
  nextStageId: string | null
}
interface SimResult {
  ok: boolean
  error?: string
  vacancy?: { id: string; title: string | null; funnelV2RuntimeEnabled: boolean }
  funnelEnabled?: boolean
  stageCount?: number
  trace?: SimTraceEntry[]
}
const INTERVIEW_MODES: Array<{ v: InterviewMode; label: string }> = [
  { v: "phone", label: "Телефон" }, { v: "zoom", label: "Zoom" }, { v: "office", label: "Офис" },
]
const DOZHIM_OPTS: DozhimPreset[] = ["off", "soft", "standard", "strong"]

interface ContentBlock { id: string; title: string; contentType: string }

// ── Компактная карточка стадии (клик → Sheet) ────────────────────────────────
function StageCard({ stage, index, onOpen, onRemove }: {
  stage: FunnelV2Stage; index: number; onOpen: () => void; onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const meta = actionMeta(stage.action)
  const Icon = ICONS[meta.icon] ?? MessageSquare
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-xl border border-border bg-card", isDragging && "opacity-60 shadow-lg")}>
      <div className="flex items-center gap-2.5 p-3">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground touch-none" aria-label="Перетащить"><GripVertical className="w-4 h-4" /></button>
        <span className="grid place-items-center w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium shrink-0">{index + 2}</span>
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium truncate">{stage.title?.trim() || meta.label}</div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{meta.label}</span>
            {stage.action === "interview" && stage.interviewMode && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{INTERVIEW_MODES.find(m => m.v === stage.interviewMode)?.label}</span>}
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">дожим: {DOZHIM_LABEL[stage.dozhim].toLowerCase()}</span>
            {stage.hhStatus && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">hh: {stage.hhStatus}</span>}
          </div>
        </button>
        <button onClick={onOpen} className="text-muted-foreground hover:text-foreground p-1" aria-label="Настроить"><ChevronRight className="w-4 h-4" /></button>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive p-1" aria-label="Удалить стадию"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}

// ── Sheet редактирования стадии ──────────────────────────────────────────────
function StageSheet({ stage, index, allStages, content, onChange, onClose }: {
  stage: FunnelV2Stage | null
  index: number
  allStages: FunnelV2Stage[]
  content: ContentBlock[]
  onChange: (s: FunnelV2Stage) => void
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (!stage) return null
  const meta = actionMeta(stage.action)
  const Icon = ICONS[meta.icon] ?? MessageSquare
  const isInterview = stage.action === "interview"
  const isScoring = SCORING_ACTIONS.includes(stage.action)
  const isContent = CONTENT_ACTIONS.includes(stage.action)
  // Предквалификация = чат-бот ведёт диалог сам (startPrequalification), поле
  // «Сообщение кандидату» там не используется → не показываем его (Юрий 26.06).
  const isPrequal = stage.action === "prequalification"
  const chain: DozhimTouch[] = stage.dozhimChain ?? dozhimChainFor(stage.dozhim, stage.action)

  const patch = (p: Partial<FunnelV2Stage>) => onChange({ ...stage, ...p })
  const patchRule = (p: Partial<FunnelV2Stage["rule"]>) => onChange({ ...stage, rule: { ...stage.rule, ...p } })
  const setChain = (next: DozhimTouch[]) => onChange({ ...stage, dozhimChain: next })

  // «куда зовёт»: следующая стадия + остальные стадии (ветвление). Номер = реальный индекс.
  const advanceOptions = [
    { v: "next", label: "Следующая стадия" },
    ...allStages.map((s, i) => ({ s, i })).filter(({ s }) => s.id !== stage.id).map(({ s, i }) => ({ v: s.id, label: `Стадия ${i + 2} · ${s.title?.trim() || actionMeta(s.action).label}` })),
  ]

  return (
    <Sheet open={!!stage} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className={cn("p-0 flex flex-col gap-0", expanded ? "w-screen max-w-none sm:max-w-none" : "w-full sm:max-w-6xl")}>
        <SheetHeader className="px-5 py-4 border-b flex-row items-center justify-between gap-2 space-y-0">
          <SheetTitle className="flex items-center gap-2 text-base min-w-0"><Icon className="w-4 h-4 text-muted-foreground shrink-0" /> <span className="truncate">Стадия {index + 2} · {stage.title?.trim() || meta.label}</span></SheetTitle>
          <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs shrink-0 mr-7" aria-label={expanded ? "Свернуть" : "На весь экран"}>
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{expanded ? "Свернуть" : "На весь экран"}</span>
          </button>
        </SheetHeader>
        <SheetBody className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto w-full max-w-5xl space-y-5">

          {/* Действие */}
          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground">Действие — что делает кандидат</Label>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_ACTIONS.map(a => {
                const active = a.type === stage.action
                return (
                  <button key={a.type} type="button"
                    onClick={() => patch(a.type === "interview" ? { ...makeStage("interview", stage.id.slice(3)), id: stage.id, action: "interview", messagePresetId: stage.messagePresetId, title: stage.title, hhStatus: stage.hhStatus } : { action: a.type })}
                    className={cn("text-xs px-2.5 py-1.5 rounded-md border transition-colors", active ? "bg-blue-500/10 border-blue-400 text-blue-700 dark:text-blue-300 font-medium" : "border-border text-muted-foreground hover:bg-muted/50")}>{a.label}</button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground/80">{meta.desc}</p>
          </section>

          {/* Сообщение / контент */}
          <section className="space-y-2 border-t pt-4">
            <Label className="text-sm font-medium flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Сообщение / контент</Label>
            {!isPrequal && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Сообщение кандидату (текст)</Label>
                <Textarea value={stage.messagePresetId ?? ""} onChange={e => patch({ messagePresetId: e.target.value || null })} placeholder="напр. «Добрый день, {{name}}! …»" className="min-h-[150px] text-base md:text-base" />
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {["{{name}}", (stage.action === "test" || stage.action === "task") ? "{{test_link}}" : "{{demo_link}}", "{{vacancy}}", "{{company}}"].map(ph => (
                    <button key={ph} type="button" onClick={() => patch({ messagePresetId: `${stage.messagePresetId ?? ""}${ph}` })} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/50 font-mono">{ph}</button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground/70"><b className="font-mono">{(stage.action === "test" || stage.action === "task") ? "{{test_link}}" : "{{demo_link}}"}</b> — индивидуальная ссылка кандидату, формируется автоматически.</p>
              </div>
            )}
            {isPrequal && (
              <p className="text-[11px] text-muted-foreground/70">Предквалификация — бот сам ведёт диалог с кандидатом (вопросы из подключённого блока). Отдельное «Сообщение кандидату» здесь не требуется.</p>
            )}
            {isContent && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Подключить блок из «Контента»</Label>
                <Select value={stage.contentBlockId ?? "none"} onValueChange={v => patch({ contentBlockId: v === "none" ? null : v })}>
                  <SelectTrigger className="h-12 text-base"><SelectValue placeholder="не выбрано" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— не подключать —</SelectItem>
                    {content.map(c => <SelectItem key={c.id} value={c.id}>{c.title} <span className="text-muted-foreground">· {c.contentType === "test" || c.contentType === "task" ? "тест" : "демо"}</span></SelectItem>)}
                  </SelectContent>
                </Select>
                {content.length === 0 && <p className="text-[11px] text-muted-foreground/70">Блоков пока нет — создайте во вкладке «Контент».</p>}
              </div>
            )}
          </section>

          {/* Правило прохода */}
          <section className="space-y-2.5 border-t pt-4">
            <Label className="text-sm font-medium flex items-center gap-1.5"><Route className="w-4 h-4" /> Правило прохода</Label>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Критерий прохода</Label>
              <Input value={stage.rule.passCriteria ?? ""} onChange={e => patchRule({ passCriteria: e.target.value || undefined })} placeholder={isScoring ? "напр. «ответил верно ≥ порога»" : "напр. «посмотрел демо»"} className="h-12 text-base" />
            </div>
            {isScoring && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Порог балла</span>
                <Input type="number" value={stage.rule.threshold ?? ""} onChange={e => patchRule({ threshold: e.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-24 h-11 text-base" placeholder="—" />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs">Авто-приглашение прошедших</span>
              <Switch checked={stage.rule.autoAdvance} onCheckedChange={v => patchRule({ autoAdvance: v })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Прошёл → зовём на</Label>
              <Select value={stage.rule.advanceTo ?? "next"} onValueChange={v => patchRule({ advanceTo: v })}>
                <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>{advanceOptions.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs">Авто-отказ не прошедших</span>
              <Switch checked={stage.rule.autoReject} onCheckedChange={v => patchRule({ autoReject: v })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Не прошёл → текст отказа</Label>
              <Textarea value={stage.rule.rejectText ?? ""} onChange={e => patchRule({ rejectText: e.target.value || undefined })} placeholder="Благодарим за интерес. К сожалению…" className="min-h-[110px] text-base md:text-base" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Задержка отказа, мин</span>
              <Input type="number" value={stage.rule.rejectDelayMinutes} onChange={e => patchRule({ rejectDelayMinutes: Math.max(0, Number(e.target.value) || 0) })} className="w-24 h-11 text-base" />
              {stage.rule.rejectDelayMinutes >= 60 && <span className="text-[11px] text-muted-foreground">= {Math.floor(stage.rule.rejectDelayMinutes / 60)} ч{stage.rule.rejectDelayMinutes % 60 ? ` ${stage.rule.rejectDelayMinutes % 60} мин` : ""}</span>}
            </div>
          </section>

          {/* Дожим — цепочка касаний */}
          <section className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-1.5"><Repeat className="w-4 h-4" /> Дожим — цепочка касаний</Label>
              <button onClick={() => setChain([...chain, { text: "", delayDays: 1 }])} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"><Plus className="w-3 h-3" /> касание</button>
            </div>
            <div className="flex gap-1">
              {DOZHIM_OPTS.map(d => (
                <button key={d} type="button" onClick={() => onChange({ ...stage, dozhim: d, dozhimChain: dozhimChainFor(d, stage.action) })}
                  className={cn("text-[11px] px-2 py-1 rounded-md border flex-1", stage.dozhim === d ? "bg-blue-500/10 border-blue-400 text-blue-700 dark:text-blue-300 font-medium" : "border-border text-muted-foreground hover:bg-muted/50")}>{DOZHIM_LABEL[d]}</button>
              ))}
            </div>
            {chain.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70">Без дожима. Выберите пресет или добавьте касание.</p>
            ) : chain.map((t, i) => (
              <div key={i} className="rounded-md border p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Касание {i + 1} · через</span>
                  <Input type="number" value={t.delayDays} onChange={e => setChain(chain.map((x, idx) => idx === i ? { ...x, delayDays: Math.max(0, Number(e.target.value) || 0) } : x))} className="w-16 h-12 text-base" />
                  <span className="text-[11px] text-muted-foreground">дн.</span>
                  <button onClick={() => setChain(chain.filter((_, idx) => idx !== i))} className="ml-auto text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                </div>
                <Textarea value={t.text} onChange={e => setChain(chain.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))} placeholder="Текст касания…" className="min-h-[110px] text-base md:text-base" />
              </div>
            ))}
          </section>

          {/* Интервью */}
          {isInterview && (
            <section className="space-y-2.5 border-t pt-4">
              <Label className="text-sm font-medium flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Интервью</Label>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Тип встречи</Label>
                <div className="flex gap-1.5">
                  {INTERVIEW_MODES.map(m => <button key={m.v} type="button" onClick={() => patch({ interviewMode: m.v })} className={cn("text-xs px-2.5 py-1 rounded-md border", stage.interviewMode === m.v ? "bg-blue-500/10 border-blue-400 text-blue-700 dark:text-blue-300 font-medium" : "border-border text-muted-foreground hover:bg-muted/50")}>{m.label}</button>)}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Согласование времени</Label>
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={stage.scheduling?.includes("bot") ?? false} onChange={e => patch({ scheduling: e.target.checked ? [...new Set([...(stage.scheduling ?? []), "bot" as const])] : (stage.scheduling ?? []).filter(s => s !== "bot") })} /> Бот согласует в чате и пишет в календарь</label>
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={stage.scheduling?.includes("self_link") ?? false} onChange={e => patch({ scheduling: e.target.checked ? [...new Set([...(stage.scheduling ?? []), "self_link" as const])] : (stage.scheduling ?? []).filter(s => s !== "self_link") })} /> Ссылка для самозаписи</label>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Напоминания</Label>
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={stage.reminders?.dayBefore ?? false} onChange={e => patch({ reminders: { dayBefore: e.target.checked, morning: stage.reminders?.morning ?? false } })} /> За сутки</label>
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={stage.reminders?.morning ?? false} onChange={e => patch({ reminders: { dayBefore: stage.reminders?.dayBefore ?? false, morning: e.target.checked } })} /> Утром в день встречи</label>
              </div>
            </section>
          )}

          {/* Статус + название */}
          <section className="space-y-2.5 border-t pt-4">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Статус hh / Avito при входе в стадию</Label>
              <Select value={stage.hhStatus ?? "none"} onValueChange={v => patch({ hhStatus: v === "none" ? undefined : v })}>
                <SelectTrigger className="h-12 text-base"><SelectValue placeholder="не менять" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— не менять —</SelectItem>
                  {STAGE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Название стадии (необязательно)</Label>
              <Input value={stage.title ?? ""} onChange={e => patch({ title: e.target.value || undefined })} placeholder={meta.label} className="h-12 text-base" />
            </div>
          </section>
        </div>
        </SheetBody>
        <SheetFooter className="px-5 py-3 border-t">
          <button onClick={onClose} className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 inline-flex items-center justify-center gap-1.5"><Check className="w-4 h-4" /> Готово</button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ── Стадия 1: Портрет (read-only) ────────────────────────────────────────────
interface SpecSummary { upper?: number; lower?: number; autoReject?: boolean; autoInvite?: boolean; stops: string[]; criteriaCount: number }
function PortraitStageCard({ summary, loading, onOpen }: { summary: SpecSummary | null; loading: boolean; onOpen?: () => void }) {
  const empty = !loading && summary && summary.criteriaCount === 0 && summary.stops.length === 0
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium shrink-0">1</span>
        <Target className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0"><div className="text-sm font-medium">Отклик → скан резюме <span className="text-[11px] text-muted-foreground font-normal">· из Портрета</span></div></div>
        {onOpen && <button onClick={onOpen} className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">Открыть Портрет <ExternalLink className="w-3 h-3" /></button>}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5 pl-9">
        {loading ? <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> загрузка…</span>
          : summary ? (<>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">пороги &lt;{summary.lower ?? 40} / {summary.lower ?? 40}–{(summary.upper ?? 75) - 1} / ≥{summary.upper ?? 75}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">авто-отказ {summary.autoReject ? "вкл" : "выкл"}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">авто-приглашение {summary.autoInvite ? "вкл" : "выкл"}</span>
            {summary.stops.length > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">стоп: {summary.stops.join(", ")}</span>}
            {empty && <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground/70">пусто → 100% проходят дальше</span>}
          </>) : <span className="text-[11px] text-muted-foreground/70">Портрет не настроен → проходят все</span>}
      </div>
    </div>
  )
}

// ── Главный конструктор ──────────────────────────────────────────────────────
export function FunnelV2Builder({ vacancyId, onOpenPortrait }: { vacancyId: string; onOpenPortrait?: () => void }) {
  const [config, setConfig] = useState<FunnelV2Config | null>(null)
  const [summary, setSummary] = useState<SpecSummary | null>(null)
  const [content, setContent] = useState<ContentBlock[]>([])
  const [specLoading, setSpecLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  // Сухой прогон воронки (read-only диагностика — без записи в БД)
  const [simOpen, setSimOpen] = useState(false)
  const [simLoading, setSimLoading] = useState(false)
  const [simResult, setSimResult] = useState<SimResult | null>(null)
  const runSim = useCallback(async () => {
    setSimOpen(true); setSimLoading(true); setSimResult(null)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-v2-sim`, { method: "POST" })
      const data = await res.json() as SimResult
      setSimResult(data)
    } catch {
      setSimResult({ ok: false, error: "Не удалось выполнить прогон" })
    } finally { setSimLoading(false) }
  }, [vacancyId])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-v2`).then(r => r.ok ? r.json() : null)
      .then((d: { config?: FunnelV2Config } | null) => { if (!cancelled) setConfig(d?.config ? normalizeFunnelV2(d.config) : emptyFunnelV2()) })
      .catch(() => { if (!cancelled) setConfig(emptyFunnelV2()) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  // Список контент-блоков (для «подключить демо/тест»)
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

  useEffect(() => {
    let cancelled = false
    fetch(`/api/core/spec/${vacancyId}`).then(r => r.ok ? r.json() : null)
      .then((d: { spec?: Record<string, unknown> } | null) => {
        if (cancelled) return
        const spec = d?.spec; if (!spec) { setSummary(null); return }
        const rt = (spec.resumeThresholds ?? {}) as Record<string, unknown>
        const sf = (spec.stopFactors ?? {}) as Record<string, unknown>
        const STOP_LABELS: Record<string, string> = { city: "город", format: "формат", age: "возраст", experience: "опыт", documents: "документы", citizenship: "гражданство", salaryExpectation: "зарплата" }
        const stops = Object.keys(sf).filter(k => sf[k] && (sf[k] as { enabled?: boolean }).enabled !== false).map(k => STOP_LABELS[k] ?? k)
        const nice = Array.isArray(spec.niceToHave) ? spec.niceToHave.length : 0
        const must = Array.isArray(spec.mustHave) ? spec.mustHave.length : 0
        const deal = Array.isArray(spec.dealBreakers) ? spec.dealBreakers.length : 0
        setSummary({ upper: typeof rt.upperThreshold === "number" ? rt.upperThreshold : undefined, lower: typeof rt.lowerThreshold === "number" ? rt.lowerThreshold : undefined, autoReject: rt.autoRejectEnabled === true, autoInvite: rt.autoInviteEnabled === true, stops, criteriaCount: nice + must + deal })
      })
      .catch(() => { if (!cancelled) setSummary(null) })
      .finally(() => { if (!cancelled) setSpecLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  const persist = useCallback((next: FunnelV2Config) => {
    setSaveState("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-v2`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: next }) })
        if (!res.ok) throw new Error()
        setSaveState("saved"); setTimeout(() => setSaveState("idle"), 1500)
      } catch { setSaveState("idle"); toast.error("Не удалось сохранить воронку") }
    }, 600)
  }, [vacancyId])
  const update = useCallback((next: FunnelV2Config) => { setConfig(next); persist(next) }, [persist])

  const stages = config?.stages ?? []
  const stageIds = useMemo(() => stages.map(s => s.id), [stages])
  const editing = stages.find(s => s.id === editingId) ?? null
  const editingIndex = stages.findIndex(s => s.id === editingId)

  const addStage = (action: StageActionType) => { if (!config) return; const st = makeStage(action, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`); update({ ...config, stages: [...config.stages, st] }); setEditingId(st.id) }
  const changeStage = (s: FunnelV2Stage) => { if (!config) return; update({ ...config, stages: config.stages.map(x => x.id === s.id ? s : x) }) }
  const removeStage = (id: string) => { if (!config) return; if (editingId === id) setEditingId(null); update({ ...config, stages: config.stages.filter(s => s.id !== id) }) }
  const onDragEnd = (e: DragEndEvent) => { if (!config) return; const { active, over } = e; if (!over || active.id === over.id) return; const from = config.stages.findIndex(s => s.id === active.id); const to = config.stages.findIndex(s => s.id === over.id); if (from < 0 || to < 0) return; update({ ...config, stages: arrayMove(config.stages, from, to) }) }

  if (loading) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка…</div>

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Воронка v2 — стадии</h3>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">beta</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Конструктор пути кандидата. Клик по стадии — настройки в панели. Пока не ведёт кандидатов.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className="text-[11px] text-muted-foreground">
            {saveState === "saving" ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> сохранение…</span>
              : saveState === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3 h-3" /> сохранено</span> : null}
          </span>
          <button type="button" onClick={runSim} disabled={stages.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted/50 disabled:opacity-40 transition-colors"
            title="Сухой прогон: пройти воронку тест-кандидатом без записи в БД">
            <PlayCircle className="w-3.5 h-3.5 text-primary" /> Сухой прогон
          </button>
        </div>
      </div>

      <PortraitStageCard summary={summary} loading={specLoading} onOpen={onOpenPortrait} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5">
            {stages.map((s, i) => <StageCard key={s.id} stage={s} index={i} onOpen={() => setEditingId(s.id)} onRemove={() => removeStage(s.id)} />)}
          </div>
        </SortableContext>
      </DndContext>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full rounded-xl border border-dashed border-border py-3 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"><Plus className="w-4 h-4" /> Добавить стадию</button>
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

      {stages.length === 0 && <p className="text-xs text-muted-foreground text-center pt-1">Стадия 1 (Портрет) уже есть. Добавьте следующие — приветствие, демо, тест, интервью, оффер…</p>}

      <StageSheet stage={editing} index={editingIndex} allStages={stages} content={content} onChange={changeStage} onClose={() => setEditingId(null)} />

      <Sheet open={simOpen} onOpenChange={setSimOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><PlayCircle className="w-4 h-4 text-primary" /> Сухой прогон воронки</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {simLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Прогоняю тест-кандидата…</div>
            ) : !simResult ? null : !simResult.ok ? (
              <p className="text-sm text-red-600">{simResult.error ?? "Ошибка"}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Тест-кандидат проходит {simResult.stageCount} стадий. Ничего не пишется в БД — это проверка «как сработает воронка».
                  {" "}Движок {simResult.vacancy?.funnelV2RuntimeEnabled ? "включён" : "выключен (флаг)"}.
                </p>
                {(simResult.trace ?? []).map(t => (
                  <div key={t.stageId} className="rounded-lg border p-2.5 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t.step}</span>
                      <span className="text-sm font-medium">{t.title ?? t.stageId}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.action}</span>
                    </div>
                    {t.contentBlock && (
                      <p className="text-[11px] text-muted-foreground">Контент: «{t.contentBlock.title}» · {t.contentBlock.lessons} {t.contentBlock.lessons === 1 ? "блок" : "блоков"}</p>
                    )}
                    {t.scoring ? (
                      <div className="text-[11px] space-y-0.5">
                        <p className="text-muted-foreground">Вопросов: {t.scoring.questions} (объект.: {t.scoring.gradedObjective}{t.scoring.hasAiQuestions ? " + AI" : ""})</p>
                        <p><span className="text-emerald-600">Сильные ответы {t.scoring.strong.scorePercent}%</span> → {t.scoring.strong.decision}</p>
                        <p><span className="text-red-600">Слабые ответы {t.scoring.weak.scorePercent}%</span> → {t.scoring.weak.decision}</p>
                      </div>
                    ) : (
                      <p className="text-[11px]"><span className="text-muted-foreground">Решение:</span> {t.decision}</p>
                    )}
                    {t.nextStageId && <p className="text-[10px] text-muted-foreground">→ дальше: {t.nextStageId}</p>}
                  </div>
                ))}
                {(simResult.trace ?? []).length === 0 && <p className="text-sm text-muted-foreground">В воронке пока нет стадий для прогона.</p>}
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}
