"use client"

// Воронка v2 — конструктор «стадий» (FUNNEL-V2.md, Фаза 1).
// Карточка стадии = компактная сводка; клик → Sheet со всеми настройками
// (действие, сообщение/контент, правило прохода+куда зовёт, цепочка дожима,
// hh-статус, интервью). Над списком — тонкая read-only врезка «входной скан
// резюме из Портрета» (НЕ пронумерована, это не стадия воронки); нумерация
// реальных стадий начинается с 1. Конструктор без рантайма. Видно только
// владельцу (гейт на странице + 404 на API).

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
  GripVertical, Trash2, Plus, Loader2, Target, ExternalLink, SlidersHorizontal,
  ClipboardList, PlayCircle, ListChecks, ClipboardCheck, Calendar, FileText,
  ShieldCheck, Phone, MessageSquare, CircleCheck, Check, Link2, Route, Repeat, X,
  Maximize2, Minimize2, Eye, AlertTriangle, Palette, Ban, Gauge, Wand2,
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
  normalizeFunnelV2, dozhimChainFor, dozhimChainForOpened,
  defaultFunnelV2Stages, stageMessages,
  SCORE_GATE_TYPES, SCORE_GATE_FAIL_ACTIONS, DEFAULT_SCORE_GATE_THRESHOLD,
  type FunnelV2Config, type FunnelV2Stage, type StageActionType,
  type DozhimPreset, type InterviewMode, type DozhimTouch,
  type ScoreGate, type ScoreGateType, type ScoreGateFailAction,
} from "@/lib/funnel-v2/types"
import { STAGE_COLOR_CLASSES, type StageColor } from "@/lib/stages"
import type { DripTemplates } from "@/lib/db/schema"
import { renderTemplate } from "@/lib/template-renderer"
import { guardOutgoingMessage } from "@/lib/messaging/outgoing-guard"

// Предпросмотр: тестовые данные для подстановки переменных (как увидит кандидат).
const PREVIEW_VARS: Record<string, string> = {
  name: "Иван", vacancy: "Менеджер по продажам", company: "Company24",
  demo_link: "https://company24.pro/demo/пример",
  test_link: "https://company24.pro/test/пример",
}
interface PreviewRow { stage: string; kind: string; text: string; issues: string[] }
function buildFunnelPreview(stages: FunnelV2Stage[]): PreviewRow[] {
  const rows: PreviewRow[] = []
  const add = (stage: string, kind: string, raw: string) => {
    if (!raw || !raw.trim()) return
    const g = guardOutgoingMessage(renderTemplate(raw, PREVIEW_VARS))
    rows.push({ stage, kind, text: g.text, issues: g.issues })
  }
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]
    const label = `Стадия ${i + 1} · ${s.title?.trim() || (STAGE_ACTIONS.find(a => a.type === s.action)?.label ?? s.action)}`
    const msgs = stageMessages(s)
    msgs.forEach((m, j) => add(label, msgs.length > 1 ? `Сообщение №${j + 1}` : "Сообщение", m))
    ;(s.dozhimChain ?? []).forEach((t, j) => add(label, `Дожим «не открыл» №${j + 1}`, t.text))
    ;(s.dozhimChainOpened ?? []).forEach((t, j) => add(label, `Дожим «не завершил» №${j + 1}`, t.text))
  }
  return rows
}

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

// ── Реестр стадий: палитра цветов (StageColor) и подписи ──────────────────────
// Палитра — те же 13 цветов, что и в общей карте стадий (lib/stages.ts).
const STAGE_COLOR_PALETTE: StageColor[] = [
  "slate", "blue", "indigo", "violet", "purple", "amber",
  "orange", "yellow", "lime", "green", "emerald", "rose", "red",
]
// Читаемая точка-образец цвета для пикера (bg насыщенный, без текста).
const STAGE_COLOR_DOT: Record<StageColor, string> = {
  slate: "bg-slate-500", blue: "bg-blue-500", indigo: "bg-indigo-500",
  violet: "bg-violet-500", purple: "bg-purple-500", amber: "bg-amber-500",
  orange: "bg-orange-500", yellow: "bg-yellow-500", lime: "bg-lime-500",
  green: "bg-green-500", emerald: "bg-emerald-500", rose: "bg-rose-500",
  red: "bg-red-500",
}

// ── Правило прохода по баллу (scoreGate) — подписи ────────────────────────────
const SCORE_GATE_TYPE_LABEL: Record<ScoreGateType, string> = {
  resume: "Резюме", anketa: "Анкета", block2: "Блок 2", test: "Тест", portrait: "Портрет",
}
// «Если не прошёл» — включая «В резерв» (talent pool).
const SCORE_GATE_FAIL_LABEL: Record<ScoreGateFailAction, string> = {
  preliminary_reject: "Предварительный отказ", manual: "Ручное", reject: "Отказ", reserve: "В резерв",
}

// ── Единая сетка «подпись слева фикс.ширины + контрол» для секции «Переход
// дальше» (п.3/4 замечаний Юрия) — одинаковый левый край контролов во всех строках.
function FieldRow({ label, children, align = "center" }: { label: string; children: React.ReactNode; align?: "center" | "top" }) {
  return (
    <div className={cn("flex gap-3", align === "top" ? "items-start" : "items-center justify-between")}>
      <span className={cn("text-xs text-muted-foreground shrink-0 w-[168px]", align === "top" && "pt-2.5")}>{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

interface ContentBlock { id: string; title: string; contentType: string }

// Стадия «включена»? Признак хранится ad-hoc (survive-нормализацию через spread);
// по умолчанию — включена (обратная совместимость: enabled не задан → true).
function isStageEnabled(stage: FunnelV2Stage): boolean {
  return (stage as { enabled?: boolean }).enabled !== false
}
// Краткая сводка гейта по баллу для бейджа карточки: «гейт: Анкета ≥50 · авто выкл».
function scoreGateBadgeText(gate?: ScoreGate): string | null {
  if (!gate) return null
  return `гейт: ${SCORE_GATE_TYPE_LABEL[gate.scoreType]} ≥${gate.threshold} · авто ${gate.autoEnabled ? "вкл" : "выкл"}`
}

// ── Компактная карточка стадии (клик → Sheet) ────────────────────────────────
function StageCard({ stage, index, onOpen, onRemove, onToggleEnabled }: {
  stage: FunnelV2Stage; index: number; onOpen: () => void; onRemove: () => void
  onToggleEnabled: (v: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const meta = actionMeta(stage.action)
  const Icon = ICONS[meta.icon] ?? MessageSquare
  const enabled = isStageEnabled(stage)
  const gateText = scoreGateBadgeText(stage.rule.scoreGate)
  const colorClass = stage.color ? STAGE_COLOR_CLASSES[stage.color] : null
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-xl border bg-card transition-opacity",
        stage.negative ? "border-rose-300/60 dark:border-rose-800/60" : "border-border",
        isDragging && "opacity-60 shadow-lg", !enabled && "opacity-55")}>
      <div className="flex items-center gap-2.5 p-3">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground touch-none" aria-label="Перетащить"><GripVertical className="w-4 h-4" /></button>
        <span className="grid place-items-center w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium shrink-0">{index + 1}</span>
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn("text-sm font-medium truncate px-1.5 py-0.5 rounded-md border", colorClass ?? "border-transparent")}>{stage.title?.trim() || meta.label}</span>
            {stage.negative && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400" title="Негативная (отказная) стадия"><Ban className="w-3 h-3" /> негативная</span>}
            {stage.terminal && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title="Терминальная стадия — из неё нет автоперехода дальше">финал</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{meta.label}</span>
            {stage.action === "interview" && stage.interviewMode && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{INTERVIEW_MODES.find(m => m.v === stage.interviewMode)?.label}</span>}
            {gateText && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{gateText}</span>}
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">дожим: {DOZHIM_LABEL[stage.dozhim].toLowerCase()}</span>
            {stage.hhStatus && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">hh: {stage.hhStatus}</span>}
            {stage.avitoStatus && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">avito: {stage.avitoStatus}</span>}
          </div>
        </button>
        {/* Вкл/выкл стадии — тумблер прямо в реестре */}
        <Switch checked={enabled} onCheckedChange={onToggleEnabled} className="shrink-0 scale-90" aria-label={enabled ? "Выключить стадию" : "Включить стадию"} />
        <button onClick={onOpen} className="shrink-0 grid place-items-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Настроить стадию"><SlidersHorizontal className="w-4 h-4" /></button>
        {/* Удаление отделено от «Настроить» (отступ+разделитель) и приглушено, чтобы не промахнуться; подтверждение — в removeStage */}
        <button onClick={onRemove} className="shrink-0 ml-1 pl-2 border-l border-border/60 text-muted-foreground/40 hover:text-destructive p-1 transition-colors" aria-label="Удалить стадию" title="Удалить стадию"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}

// ── Sheet редактирования стадии ──────────────────────────────────────────────
function StageSheet({ stage, index, allStages, content, onChange, onClose, dripTemplates }: {
  stage: FunnelV2Stage | null
  index: number
  allStages: FunnelV2Stage[]
  content: ContentBlock[]
  onChange: (s: FunnelV2Stage) => void
  onClose: () => void
  dripTemplates?: DripTemplates
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
  const chain: DozhimTouch[] = stage.dozhimChain ?? dozhimChainFor(stage.dozhim, stage.action, dripTemplates)

  const patch = (p: Partial<FunnelV2Stage>) => onChange({ ...stage, ...p })
  const patchRule = (p: Partial<FunnelV2Stage["rule"]>) => onChange({ ...stage, rule: { ...stage.rule, ...p } })
  // Сообщения стадии: эффективный список = messages ?? [messagePresetId] (обратная совместимость).
  // Пишем всегда в messages; messagePresetId (устаревшее) не трогаем при записи.
  const msgList: string[] = stage.messages ?? (stage.messagePresetId ? [stage.messagePresetId] : [""])
  const setMsgList = (next: string[]) => patch({ messages: next })
  const addMessage = () => setMsgList([...msgList, ""])
  const removeMessage = (i: number) => { const next = msgList.filter((_, idx) => idx !== i); setMsgList(next.length > 0 ? next : [""]) }
  const setMessageAt = (i: number, text: string) => setMsgList(msgList.map((m, idx) => idx === i ? text : m))
  const insertPlaceholder = (i: number, ph: string) => setMessageAt(i, `${msgList[i] ?? ""}${ph}`)
  // scoreGate: dropdown «Не гейтить» = убрать объект; иначе патчим поля.
  const gate = stage.rule.scoreGate
  const patchGate = (p: Partial<ScoreGate>) => {
    const base: ScoreGate = gate ?? { scoreType: "resume", threshold: DEFAULT_SCORE_GATE_THRESHOLD, failAction: "preliminary_reject", autoEnabled: false }
    patchRule({ scoreGate: { ...base, ...p } })
  }
  const setGateType = (v: string) => {
    if (v === "none") { patchRule({ scoreGate: undefined }); return }
    patchGate({ scoreType: v as ScoreGateType })
  }
  const setChain = (next: DozhimTouch[]) => onChange({ ...stage, dozhimChain: next })
  // Ветка Б — «открыл, но не досмотрел» (переключается при открытии демо/теста).
  const chainOpened: DozhimTouch[] = stage.dozhimChainOpened ?? dozhimChainForOpened(stage.dozhim, stage.action, dripTemplates)
  const setChainOpened = (next: DozhimTouch[]) => onChange({ ...stage, dozhimChainOpened: next })

  // «куда зовёт»: следующая стадия + остальные стадии (ветвление). Номер = реальный индекс.
  const advanceOptions = [
    { v: "next", label: "Следующая стадия" },
    ...allStages.map((s, i) => ({ s, i })).filter(({ s }) => s.id !== stage.id).map(({ s, i }) => ({ v: s.id, label: `Стадия ${i + 1} · ${s.title?.trim() || actionMeta(s.action).label}` })),
  ]

  return (
    <Sheet open={!!stage} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className={cn("p-0 flex flex-col gap-0", expanded ? "w-screen max-w-none sm:max-w-none" : "w-full sm:max-w-6xl")}>
        <SheetHeader className="px-5 py-4 border-b flex-row items-center justify-between gap-2 space-y-0">
          <SheetTitle className="flex items-center gap-2 text-base min-w-0"><Icon className="w-4 h-4 text-muted-foreground shrink-0" /> <span className="truncate">Стадия {index + 1} · {stage.title?.trim() || meta.label}</span></SheetTitle>
          <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs shrink-0 mr-7" aria-label={expanded ? "Свернуть" : "На весь экран"}>
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{expanded ? "Свернуть" : "На весь экран"}</span>
          </button>
        </SheetHeader>
        <SheetBody className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto w-full max-w-5xl space-y-5">

          {/* Тип этой стадии */}
          <section className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Тип этой стадии</Label>
            <p className="text-[11px] text-muted-foreground/70 -mt-0.5">Стадия — один шаг пути кандидата. Тип задаёт, что кандидат делает на этом шаге. Последовательность шагов — в списке слева.</p>
            <div className="flex flex-wrap gap-1">
              {STAGE_ACTIONS.map(a => {
                const active = a.type === stage.action
                return (
                  <button key={a.type} type="button"
                    onClick={() => patch(a.type === "interview" ? { ...makeStage("interview", stage.id.slice(3)), id: stage.id, action: "interview", messagePresetId: stage.messagePresetId, messages: stage.messages, title: stage.title, hhStatus: stage.hhStatus } : { action: a.type, dozhimChain: dozhimChainFor(stage.dozhim, a.type, dripTemplates), dozhimChainOpened: dozhimChainForOpened(stage.dozhim, a.type, dripTemplates) })}
                    className={cn("text-[11px] px-2 py-1 rounded-md border transition-colors", active ? "bg-blue-500/10 border-blue-400 text-blue-700 dark:text-blue-300 font-medium" : "border-border text-muted-foreground hover:bg-muted/50")}>{a.label}</button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground/80">{meta.desc}</p>
          </section>

          {/* Сообщение / контент */}
          <section className="space-y-2 border-t pt-4">
            <Label className="text-sm font-medium flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Сообщение / контент</Label>
            {!isPrequal && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">Сообщения кандидату (текст)</Label>
                  <button type="button" onClick={addMessage} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"><Plus className="w-3 h-3" /> Добавить сообщение</button>
                </div>
                {msgList.map((m, i) => (
                  <div key={i} className="rounded-md border p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">Сообщение {i + 1}{i === 0 ? " (обязательно)" : ""}</span>
                      {msgList.length > 1 && (
                        <button onClick={() => removeMessage(i)} className="text-muted-foreground hover:text-destructive" aria-label="Удалить сообщение"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                    <Textarea
                      value={m}
                      onChange={e => setMessageAt(i, e.target.value)}
                      placeholder="напр. «Добрый день, {{name}}! …»"
                      className="min-h-[150px] text-base md:text-base"
                    />
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {["{{name}}", (stage.action === "test" || stage.action === "task") ? "{{test_link}}" : "{{demo_link}}", "{{vacancy}}", "{{company}}"].map(ph => (
                        <button key={ph} type="button" onClick={() => insertPlaceholder(i, ph)} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/50 font-mono">{ph}</button>
                      ))}
                    </div>
                  </div>
                ))}
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

          {/* Переход дальше — единый поток: условие прохода → прошёл → не прошёл → авто.
              Презентационное слияние бывших блоков «Правило прохода по баллу» и
              «Правило прохода» — поля и их привязка к scoreGate и rule не менялись. */}
          <section className="space-y-4 border-t pt-4">
            <Label className="text-sm font-medium flex items-center gap-1.5"><Route className="w-4 h-4" /> Переход дальше</Label>

            {/* (а) Условие прохода */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
              <span className="text-xs font-medium flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" /> Условие прохода</span>
              <FieldRow label="Гейт по баллу">
                <Select value={gate?.scoreType ?? "none"} onValueChange={setGateType}>
                  <SelectTrigger className="h-11 text-base"><SelectValue placeholder="Не гейтить" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— не гейтить —</SelectItem>
                    {SCORE_GATE_TYPES.map(t => <SelectItem key={t} value={t}>{SCORE_GATE_TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>
              {gate && (
                <FieldRow label="Порог балла">
                  <div className="flex items-center gap-1.5">
                    <Input type="number" min={0} max={100} value={gate.threshold}
                      onChange={e => patchGate({ threshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-20 h-10 text-base" />
                    <span className="text-[11px] text-muted-foreground w-12">из 100</span>
                  </div>
                </FieldRow>
              )}
              {!gate && <p className="text-[11px] text-muted-foreground/70">Балл на этой стадии не проверяется — кандидаты проходят вручную.</p>}
              <FieldRow label="Критерий прохода">
                <Input value={stage.rule.passCriteria ?? ""} onChange={e => patchRule({ passCriteria: e.target.value || undefined })} placeholder={isScoring ? "напр. «ответил верно ≥ порога»" : "напр. «посмотрел демо»"} className="h-11 text-base" />
              </FieldRow>
              {isContent && (
                <div className="rounded-lg bg-muted/40 p-3 space-y-2.5">
                  <span className="text-xs font-medium">Пороги отбора</span>
                  <FieldRow label="Порог AI-балла">
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min={0} max={100} value={stage.rule.threshold ?? ""} onChange={e => patchRule({ threshold: e.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-20 h-10 text-base" placeholder="—" />
                      <span className="text-[11px] text-muted-foreground w-12">из 100</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="Порог правильных ответов">
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min={0} max={100} value={stage.rule.objThreshold ?? ""} onChange={e => patchRule({ objThreshold: e.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-20 h-10 text-base" placeholder="—" />
                      <span className="text-[11px] text-muted-foreground w-12">%</span>
                    </div>
                  </FieldRow>
                  <p className="text-[11px] text-muted-foreground/80">Отказ, если не пройден <b>любой</b> заданный порог (при включённом авто-отказе ниже). Пустое поле = по этому баллу не отбираем.</p>
                </div>
              )}
            </div>

            {/* (б) Прошёл → */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Прошёл →</span>
              <FieldRow label="Авто-приглашение прошедших">
                <Switch checked={stage.rule.autoAdvance} onCheckedChange={v => patchRule({ autoAdvance: v })} />
              </FieldRow>
              <FieldRow label="Зовём на">
                <Select value={stage.rule.advanceTo ?? "next"} onValueChange={v => patchRule({ advanceTo: v })}>
                  <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>{advanceOptions.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
            </div>

            {/* (в) Не прошёл → */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
              <span className="text-xs font-medium text-rose-700 dark:text-rose-400">Не прошёл →</span>
              <FieldRow label="Авто-отказ не прошедших">
                <Switch checked={stage.rule.autoReject} onCheckedChange={v => patchRule({ autoReject: v })} />
              </FieldRow>
              {gate ? (() => {
                // Слать ли сообщение при непрохождении — настраивается тумблером
                // (можно молча увести на стадию, напр. предв.отказ на разбор, ИЛИ
                // послать мягкое сообщение). Дефолт: для отказа/предв.отказа —
                // слать, для резерва/ручного — молча.
                const failNotify = stage.rule.failNotify ?? (gate.failAction === "preliminary_reject" || gate.failAction === "reject")
                const textLabel = gate.failAction === "preliminary_reject" ? "Текст предварительного отказа (обратимый)"
                  : gate.failAction === "reject" ? "Текст отказа"
                  : "Текст сообщения"
                return (
                  <>
                    <FieldRow label="Отправлять сообщение кандидату">
                      <Switch checked={failNotify} onCheckedChange={v => patchRule({ failNotify: v })} />
                    </FieldRow>
                    {failNotify ? (
                      <FieldRow label={textLabel} align="top">
                        <Textarea value={stage.rule.rejectText ?? ""} onChange={e => patchRule({ rejectText: e.target.value || undefined })} placeholder="Благодарим за интерес. К сожалению…" className="min-h-[110px] text-base md:text-base" />
                      </FieldRow>
                    ) : (
                      <FieldRow label="Сообщение">
                        <p className="text-[11px] text-muted-foreground/70 pt-2.5">не отправляется — кандидат молча уходит на «{SCORE_GATE_FAIL_LABEL[gate.failAction].toLowerCase()}»</p>
                      </FieldRow>
                    )}
                  </>
                )
              })() : (
                <FieldRow label="Текст отказа" align="top">
                  <Textarea value={stage.rule.rejectText ?? ""} onChange={e => patchRule({ rejectText: e.target.value || undefined })} placeholder="Благодарим за интерес. К сожалению…" className="min-h-[110px] text-base md:text-base" />
                </FieldRow>
              )}
              <FieldRow label="Задержка отказа, мин">
                <div className="flex items-center gap-2">
                  <Input type="number" value={stage.rule.rejectDelayMinutes} onChange={e => patchRule({ rejectDelayMinutes: Math.max(0, Number(e.target.value) || 0) })} className="w-24 h-11 text-base" />
                  {stage.rule.rejectDelayMinutes >= 60 && <span className="text-[11px] text-muted-foreground">= {Math.floor(stage.rule.rejectDelayMinutes / 60)} ч{stage.rule.rejectDelayMinutes % 60 ? ` ${stage.rule.rejectDelayMinutes % 60} мин` : ""}</span>}
                </div>
              </FieldRow>
              {gate && (
                <FieldRow label="Если не прошёл (гейт по баллу)">
                  <Select value={gate.failAction} onValueChange={v => patchGate({ failAction: v as ScoreGateFailAction })}>
                    <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCORE_GATE_FAIL_ACTIONS.map(f => <SelectItem key={f} value={f}>{SCORE_GATE_FAIL_LABEL[f]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FieldRow>
              )}
            </div>

            {/* (г) Авто */}
            {gate && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <FieldRow label="Авто" align="top">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground/80 flex-1">когда выключено — двигаешь вручную; включи, когда доверишь баллу.</p>
                    <Switch checked={gate.autoEnabled} onCheckedChange={v => patchGate({ autoEnabled: v })} className="mt-0.5 shrink-0" />
                  </div>
                </FieldRow>
              </div>
            )}
          </section>

          {/* Дожим — цепочка касаний */}
          <section className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-1.5"><Repeat className="w-4 h-4" /> Дожим · ветка «не открыл»</Label>
              <button onClick={() => setChain([...chain, { text: "", delayDays: 1 }])} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"><Plus className="w-3 h-3" /> касание</button>
            </div>
            <div className="flex gap-1">
              {DOZHIM_OPTS.map(d => (
                <button key={d} type="button" onClick={() => onChange({ ...stage, dozhim: d, dozhimChain: dozhimChainFor(d, stage.action, dripTemplates), dozhimChainOpened: dozhimChainForOpened(d, stage.action, dripTemplates) })}
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
                <Textarea value={t.text} onChange={e => setChain(chain.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))} placeholder="Текст касания…" className="min-h-[64px] text-base md:text-base" rows={2} />
              </div>
            ))}
          </section>

          {/* Дожим — ветка «открыл, но не досмотрел» (опционально) */}
          <section className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-1.5"><Repeat className="w-4 h-4" /> Дожим · ветка «открыл, не досмотрел»</Label>
              <button onClick={() => setChainOpened([...chainOpened, { text: "", delayDays: 1 }])} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"><Plus className="w-3 h-3" /> касание</button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">Включается, когда кандидат открыл демо/тест, но не дошёл до конца — заменяет ветку «не открыл». Пусто = после открытия дожим просто прекращается.</p>
            {chainOpened.map((t, i) => (
              <div key={i} className="rounded-md border p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Касание {i + 1} · через</span>
                  <Input type="number" value={t.delayDays} onChange={e => setChainOpened(chainOpened.map((x, idx) => idx === i ? { ...x, delayDays: Math.max(0, Number(e.target.value) || 0) } : x))} className="w-16 h-12 text-base" />
                  <span className="text-[11px] text-muted-foreground">дн.</span>
                  <button onClick={() => setChainOpened(chainOpened.filter((_, idx) => idx !== i))} className="ml-auto text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                </div>
                <Textarea value={t.text} onChange={e => setChainOpened(chainOpened.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))} placeholder="Текст касания (для тех, кто открыл, но не досмотрел)…" className="min-h-[64px] text-base md:text-base" rows={2} />
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
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={stage.reminders?.dayBefore ?? false} onChange={e => patch({ reminders: { dayBefore: e.target.checked, morning: stage.reminders?.morning ?? false, hourBefore: stage.reminders?.hourBefore ?? false } })} /> За сутки</label>
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={stage.reminders?.morning ?? false} onChange={e => patch({ reminders: { dayBefore: stage.reminders?.dayBefore ?? false, morning: e.target.checked, hourBefore: stage.reminders?.hourBefore ?? false } })} /> Утром в день встречи</label>
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={stage.reminders?.hourBefore ?? false} onChange={e => patch({ reminders: { dayBefore: stage.reminders?.dayBefore ?? false, morning: stage.reminders?.morning ?? false, hourBefore: e.target.checked } })} /> За час до встречи</label>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  Часы записи (окна доступности по дням, шаг, макс. в день) — общие для
                  всех вакансий компании.
                </p>
                <a
                  href="/hr/hiring-settings?tab=interview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Настроить часы записи
                </a>
              </div>
            </section>
          )}

          {/* Статус + название */}
          <section className="space-y-2.5 border-t pt-4">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Статус при входе в стадию</Label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] text-muted-foreground shrink-0">hh:</span>
                  <Select value={stage.hhStatus ?? "none"} onValueChange={v => patch({ hhStatus: v === "none" ? undefined : v })}>
                    <SelectTrigger className="h-11 text-base"><SelectValue placeholder="не менять" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— не менять —</SelectItem>
                      {STAGE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] text-muted-foreground shrink-0">Avito:</span>
                  <Select value={stage.avitoStatus ?? "none"} onValueChange={v => patch({ avitoStatus: v === "none" ? undefined : v })}>
                    <SelectTrigger className="h-11 text-base"><SelectValue placeholder="не менять" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— не менять —</SelectItem>
                      {STAGE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Название стадии (необязательно)</Label>
              <Input value={stage.title ?? ""} onChange={e => patch({ title: e.target.value || undefined })} placeholder={meta.label} className="h-12 text-base" />
            </div>
            {/* Цвет стадии (палитра как в карте стадий) */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" /> Цвет стадии</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => patch({ color: undefined })}
                  className={cn("w-7 h-7 rounded-md border grid place-items-center text-muted-foreground", !stage.color ? "border-primary ring-1 ring-primary/40" : "border-border hover:bg-muted/50")}
                  title="Без цвета" aria-label="Без цвета">
                  <X className="w-3.5 h-3.5" />
                </button>
                {STAGE_COLOR_PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => patch({ color: c })}
                    className={cn("w-7 h-7 rounded-md grid place-items-center border", stage.color === c ? "border-primary ring-1 ring-primary/40" : "border-transparent hover:opacity-80")}
                    title={c} aria-label={`Цвет ${c}`}>
                    <span className={cn("w-4 h-4 rounded-full", STAGE_COLOR_DOT[c])} />
                  </button>
                ))}
              </div>
            </div>
            {/* Негативная стадия (отказная) */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs flex items-center gap-1.5"><Ban className="w-3.5 h-3.5 text-rose-500" /> Негативная стадия</span>
                <p className="text-[11px] text-muted-foreground/80">Отказная стадия (напр. предварительный отказ) — помечается отдельно в реестре.</p>
              </div>
              <Switch checked={stage.negative === true} onCheckedChange={v => patch({ negative: v ? true : undefined })} className="mt-0.5 shrink-0" />
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

// ── Врезка «до стадий»: входной скан резюме из Портрета (read-only, НЕ стадия
// воронки — без номера, тонкая строка-справка, чтобы не сливаться с реальной
// стадией 1 «Отклик — скан резюме» ниже) ────────────────────────────────────
interface SpecSummary { upper?: number; lower?: number; rejectAction?: "none" | "pending_manual" | "pending_rejection"; autoInvite?: boolean; stops: string[]; criteriaCount: number }
function PortraitStageCard({ summary, loading, onOpen }: { summary: SpecSummary | null; loading: boolean; onOpen?: () => void }) {
  const empty = !loading && summary && summary.criteriaCount === 0 && summary.stops.length === 0
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 py-1 text-muted-foreground/80">
      <Target className="w-3.5 h-3.5 shrink-0" />
      <span className="text-xs">Входной скан резюме настраивается в Портрете</span>
      {onOpen && <button onClick={onOpen} className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">Открыть Портрет <ExternalLink className="w-3 h-3" /></button>}
      <span className="flex flex-wrap gap-1 ml-auto">
        {loading ? <span className="text-[11px] inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> загрузка…</span>
          : summary ? (<>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/80">пороги &lt;{summary.lower ?? 40} / {summary.lower ?? 40}–{(summary.upper ?? 75) - 1} / ≥{summary.upper ?? 75}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/80">зона отказа: {summary.rejectAction === "pending_rejection" ? "авто-отказ" : summary.rejectAction === "pending_manual" ? "ручной разбор" : "выкл"}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/80">авто-приглашение {summary.autoInvite ? "вкл" : "выкл"}</span>
            {summary.stops.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/80">стоп: {summary.stops.join(", ")}</span>}
            {empty && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/60">пусто → 100% проходят дальше</span>}
          </>) : <span className="text-[10px] text-muted-foreground/60">Портрет не настроен → проходят все</span>}
      </span>
    </div>
  )
}

// ── Главный конструктор ──────────────────────────────────────────────────────
export function FunnelV2Builder({ vacancyId, onOpenPortrait, onOpenChatbot }: { vacancyId: string; onOpenPortrait?: () => void; onOpenChatbot?: () => void }) {
  const [config, setConfig] = useState<FunnelV2Config | null>(null)
  const [summary, setSummary] = useState<SpecSummary | null>(null)
  const [content, setContent] = useState<ContentBlock[]>([])
  const [specLoading, setSpecLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  // Предпросмотр сообщений «как видит кандидат» (client-side, через страж)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Редактируемые платформенные drip-шаблоны (для генерации дефолтных цепочек
  // дожима при выборе пресета). undefined → buildDozhimChain использует код-сид.
  const [dripTemplates, setDripTemplates] = useState<DripTemplates | undefined>(undefined)
  useEffect(() => {
    fetch("/api/modules/hr/company/drip-templates")
      .then(r => r.ok ? r.json() : null)
      .then((d: { templates?: DripTemplates } | null) => { if (d?.templates) setDripTemplates(d.templates) })
      .catch(() => {})
  }, [])

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

  // Флаг рантайма движка v2 (vacancies.funnel_v2_runtime_enabled). Тумблер в шапке.
  const [runtimeEnabled, setRuntimeEnabled] = useState(false)
  const [runtimeBusy, setRuntimeBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-v2`).then(r => r.ok ? r.json() : null)
      .then((d: { config?: FunnelV2Config; runtimeEnabled?: boolean } | null) => {
        if (cancelled) return
        setConfig(d?.config ? normalizeFunnelV2(d.config) : emptyFunnelV2())
        setRuntimeEnabled(d?.runtimeEnabled === true)
      })
      .catch(() => { if (!cancelled) setConfig(emptyFunnelV2()) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  // Переключить движок: пишем только флаг (конфиг не трогаем).
  const toggleRuntime = useCallback(async (val: boolean) => {
    setRuntimeBusy(true)
    const prev = runtimeEnabled
    setRuntimeEnabled(val) // оптимистично
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-v2`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runtimeEnabled: val }),
      })
      if (!res.ok) throw new Error()
      toast.success(val ? "Движок v2 включён для этой вакансии" : "Движок v2 выключен")
    } catch {
      setRuntimeEnabled(prev)
      toast.error("Не удалось переключить движок")
    } finally { setRuntimeBusy(false) }
  }, [vacancyId, runtimeEnabled])

  // Сквозной слой «AI чат-бот»: отвечает кандидатам на ВСЕХ стадиях (не стадия).
  // Когда включён — ведёт переписку сам, дожимы на это время приостанавливаются.
  const [chatbotEnabled, setChatbotEnabled] = useState(false)
  const [chatbotHasPrompt, setChatbotHasPrompt] = useState(false)
  const [chatbotCompanyKilled, setChatbotCompanyKilled] = useState(false)
  const [chatbotBusy, setChatbotBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot`).then(r => r.ok ? r.json() : null)
      .then((d: { enabled?: boolean; prompt?: string; companyKilled?: boolean } | null) => {
        if (cancelled) return
        setChatbotEnabled(d?.enabled === true)
        setChatbotHasPrompt(typeof d?.prompt === "string" && d.prompt.trim().length > 0)
        setChatbotCompanyKilled(d?.companyKilled === true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [vacancyId])
  const toggleChatbot = useCallback(async (val: boolean) => {
    // Без промпта бот молча ничего не делает (см. lib/hh/scan-incoming.ts —
    // гейт требует aiChatbotPrompt непустым). Не даём включить тумблер и
    // создать иллюзию «бот работает», когда он на самом деле не отвечает —
    // ведём в полные настройки, где промпт генерируется.
    if (val && !chatbotHasPrompt) {
      toast.error("Сначала сгенерируйте промпт — откройте «Настроить»")
      onOpenChatbot?.()
      return
    }
    setChatbotBusy(true)
    const prev = chatbotEnabled
    setChatbotEnabled(val) // оптимистично
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-chatbot`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: val }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || "toggle failed")
      toast.success(val ? "AI чат-бот включён" : "AI чат-бот выключен")
    } catch (e) {
      setChatbotEnabled(prev)
      toast.error(e instanceof Error && e.message !== "toggle failed" ? e.message : "Не удалось переключить чат-бот")
    } finally { setChatbotBusy(false) }
  }, [vacancyId, chatbotEnabled, chatbotHasPrompt, onOpenChatbot])

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
        setSummary({ upper: typeof rt.upperThreshold === "number" ? rt.upperThreshold : undefined, lower: typeof rt.lowerThreshold === "number" ? rt.lowerThreshold : undefined, rejectAction: rt.rejectAction === "pending_manual" || rt.rejectAction === "pending_rejection" ? rt.rejectAction as "pending_manual" | "pending_rejection" : rt.autoRejectEnabled === true ? "pending_rejection" : "none", autoInvite: rt.autoInviteEnabled === true, stops, criteriaCount: nice + must + deal })
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
  const toggleStageEnabled = (id: string, val: boolean) => { if (!config) return; update({ ...config, stages: config.stages.map(x => x.id === id ? { ...x, enabled: val } as FunnelV2Stage : x) }) }
  // «Загрузить типовую воронку» — заполнить пустую воронку дефолт-шаблоном пути продаж.
  const loadDefault = () => {
    if (!config) return
    if (config.stages.length > 0) return
    const stages = defaultFunnelV2Stages(`${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
    update({ ...config, stages })
    toast.success("Загружена типовая воронка — отредактируйте под вакансию")
  }
  const removeStage = (id: string) => {
    if (!config) return
    const st = config.stages.find(s => s.id === id)
    // Подтверждение — отмены нет, защищаем от случайного клика
    if (!confirm(`Удалить стадию «${st?.title?.trim() || "без названия"}»? Действие нельзя отменить.`)) return
    if (editingId === id) setEditingId(null)
    update({ ...config, stages: config.stages.filter(s => s.id !== id) })
  }
  const onDragEnd = (e: DragEndEvent) => { if (!config) return; const { active, over } = e; if (!over || active.id === over.id) return; const from = config.stages.findIndex(s => s.id === active.id); const to = config.stages.findIndex(s => s.id === over.id); if (from < 0 || to < 0) return; update({ ...config, stages: arrayMove(config.stages, from, to) }) }

  if (loading) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка…</div>

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Воронка v2 — стадии</h3>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">beta</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Конструктор пути кандидата. Клик по стадии — настройки в панели.{runtimeEnabled ? "" : " Пока не ведёт кандидатов."}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className="text-[11px] text-muted-foreground">
            {saveState === "saving" ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> сохранение…</span>
              : saveState === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3 h-3" /> сохранено</span> : null}
          </span>
          <button type="button" onClick={() => setPreviewOpen(true)} disabled={stages.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted/50 disabled:opacity-40 transition-colors"
            title="Предпросмотр: как сообщения увидит кандидат (на тестовых данных), с проверкой стража">
            <Eye className="w-3.5 h-3.5 text-primary" /> Предпросмотр
          </button>
          <button type="button" onClick={runSim} disabled={stages.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted/50 disabled:opacity-40 transition-colors"
            title="Сухой прогон: пройти воронку тест-кандидатом без записи в БД">
            <PlayCircle className="w-3.5 h-3.5 text-primary" /> Сухой прогон
          </button>
        </div>
      </div>

      {/* Тумблер движка v2: включает рантайм для ЭТОЙ вакансии. По умолчанию
          выключен — кандидаты идут по легаси-пути. Включение = живая автоматика. */}
      <div className={cn("rounded-xl border p-3 flex items-start gap-3", runtimeEnabled ? "border-emerald-300/60 bg-emerald-500/5" : "border-border bg-muted/30")}>
        <Switch checked={runtimeEnabled} onCheckedChange={toggleRuntime} disabled={runtimeBusy || stages.length === 0} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Движок воронки v2</span>
            {runtimeBusy && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            {runtimeEnabled
              ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">включён</span>
              : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">выключен</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stages.length === 0
              ? "Добавьте хотя бы одну стадию, чтобы включить движок."
              : runtimeEnabled
                ? "Новые кандидаты этой вакансии идут по воронке v2 — авто-сообщения, движение по стадиям и дожим выполняются автоматически. Существующие кандидаты остаются на легаси-пути."
                : "Кандидаты идут по легаси-пути. Включите, чтобы НОВЫЕ кандидаты этой вакансии пошли по воронке v2. Это живая автоматика — сообщения уходят кандидатам."}
          </p>
        </div>
      </div>

      <PortraitStageCard summary={summary} loading={specLoading} onOpen={onOpenPortrait} />

      {/* Сквозной слой: AI чат-бот. Не стадия — работает поверх ВСЕХ стадий
          (отвечает кандидатам на любом шаге). Тумблер тут же; промпт/фильтры/
          песочница — в полных настройках («Настроить»). */}
      <div className={cn("rounded-xl border p-3 flex items-start gap-3", chatbotEnabled ? "border-violet-300/60 bg-violet-500/5" : "border-border bg-muted/30")}>
        <Switch checked={chatbotEnabled} onCheckedChange={toggleChatbot} disabled={chatbotBusy} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">🤖 AI чат-бот · сквозной слой</span>
            {chatbotBusy && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            {chatbotEnabled
              ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-400">включён</span>
              : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">выключен</span>}
            {!chatbotHasPrompt && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">нет промпта</span>
            )}
            {chatbotCompanyKilled && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-700 dark:text-red-400">заблокирован компанией</span>
            )}
            {onOpenChatbot && <button onClick={onOpenChatbot} className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">Настроить <ExternalLink className="w-3 h-3" /></button>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Отвечает кандидатам на всех стадиях воронки — это слой поверх стадий, а не отдельный шаг. Когда включён, ведёт переписку сам; дожимы на это время приостанавливаются. Промпт, фильтры и песочница — в «Настроить».
          </p>
          {!chatbotHasPrompt && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
              Бот не будет отвечать, пока не задан промпт — сначала откройте «Настроить» и сгенерируйте его.
            </p>
          )}
          {chatbotCompanyKilled && (
            <p className="text-[11px] text-red-700 dark:text-red-400 mt-1">
              Аварийный рубильник компании перекрывает эту вакансию — бот не отвечает, даже если тут включено.
            </p>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5">
            {stages.map((s, i) => <StageCard key={s.id} stage={s} index={i} onOpen={() => setEditingId(s.id)} onRemove={() => removeStage(s.id)} onToggleEnabled={v => toggleStageEnabled(s.id, v)} />)}
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

      {stages.length === 0 && (
        <div className="rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] p-4 flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-muted-foreground">Воронка пустая. Входной скан резюме уже настроен в Портрете — загрузите типовой путь продаж или соберите стадии вручную.</p>
          <button type="button" onClick={loadDefault}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3.5 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
            <Wand2 className="w-4 h-4" /> Загрузить типовую воронку
          </button>
          <p className="text-[11px] text-muted-foreground/70">7 стадий: демо, путь менеджера, тест-задание, интервью, оффер, нанят. Все авто-гейты выключены — включите, когда доверите баллу.</p>
        </div>
      )}

      <StageSheet stage={editing} index={editingIndex} allStages={stages} content={content} onChange={changeStage} onClose={() => setEditingId(null)} dripTemplates={dripTemplates} />

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col gap-0">
          <SheetHeader className="px-5 py-4 border-b">
            <SheetTitle className="flex items-center gap-2"><Eye className="w-4 h-4 text-primary" /> Предпросмотр сообщений</SheetTitle>
          </SheetHeader>
          <SheetBody className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <p className="text-[11px] text-muted-foreground">Как сообщения увидит кандидат — на тестовых данных (Иван / «Менеджер по продажам» / пример-ссылка). Каждое прогнано через стража: ⚠ значит что-то не подставилось или текст битый.</p>
            {(() => {
              const rows = buildFunnelPreview(stages)
              if (rows.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">Нет текстов сообщений в стадиях.</p>
              const withIssues = rows.filter(r => r.issues.length > 0).length
              return (<>
                <div className={cn("text-xs rounded-md px-2.5 py-1.5", withIssues > 0 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
                  {withIssues > 0 ? `⚠ Найдено проблем: ${withIssues} из ${rows.length} сообщений` : `✓ Все ${rows.length} сообщений корректны`}
                </div>
                {rows.map((r, i) => (
                  <div key={i} className={cn("rounded-md border p-2.5", r.issues.length > 0 && "border-amber-400/60 bg-amber-500/5")}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] text-muted-foreground">{r.stage} · {r.kind}</span>
                      {r.issues.length > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"><AlertTriangle className="w-3 h-3" /> {r.issues.join("; ")}</span>}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{r.text || <span className="text-muted-foreground italic">(пусто после чистки — не отправится)</span>}</p>
                  </div>
                ))}
              </>)
            })()}
          </SheetBody>
        </SheetContent>
      </Sheet>

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
