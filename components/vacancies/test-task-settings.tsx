"use client"

// Блок воронки «Тестовое задание» (Этап 2.6 — связан с табом «Тест»).
// Источник правды — запись demos с kind='test' (та же, что и таб «Тест»):
//   контент теста → lessonsJson, настройки блока → postDemoSettings
//   (testTaskInstructions / testDeadlineDays / testResponseFormat +
//    Этап 2: testCheckMode / testAiPrompt / testPassingScore / testAfterMessage).
// Загрузка: GET /api/modules/hr/demos?vacancy_id=X&kind=test
// Сохранение: POST (если записи нет) + PUT /api/modules/hr/demos/[id].
// DEPRECATED: vacancy.descriptionJson.testTask (/test-task route) — читается
// как fallback для старых вакансий, пока их не пересохранили в новом UI.

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Loader2, Save, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

type ResponseFormat = "text" | "file" | "both"
type CheckMode = "auto" | "assisted" | "manual"
// Формат практики: влияет только на дефолтный текст сообщения кандидату.
// Хранится в postDemoSettings.testPracticeFormat (в том же jsonb).
// "none" = обычное тестовое без оплаты (дефолт, существующее поведение).
type PracticeFormat = "none" | "paid_task" | "mini_gph"

const PRACTICE_FORMAT_LABELS: Record<PracticeFormat, string> = {
  none:      "Обычное тестовое (без оплаты)",
  paid_task: "Оплачиваемое тестовое задание",
  mini_gph:  "Мини-ГПХ (практика 1–2 недели)",
}

// Дефолтные тексты сообщения после теста для форматов с оплатой.
// «none» — не меняет дефолт afterMessage (пусто → HR заполнит сам).
const PRACTICE_FORMAT_DEFAULT_MESSAGES: Record<Exclude<PracticeFormat, "none">, string> = {
  paid_task:
    "{{name}}, благодарим за выполнение тестового задания по вакансии «{{vacancy}}»! " +
    "Мы рассмотрим вашу работу и свяжемся с вами. " +
    "Условия оплаты за выполненное задание обсудим при приглашении.",
  mini_gph:
    "{{name}}, благодарим за интерес к вакансии «{{vacancy}}»! " +
    "Следующий шаг — короткая оплачиваемая практика (1–2 недели) по договору ГПХ. " +
    "Условия и детали обсудим при приглашении.",
}

interface Props {
  vacancyId: string
  onSaved?: () => void
}

const CHECK_MODE_HINT: Record<CheckMode, string> = {
  auto:     "AI оценивает ответ и сам переводит кандидата в «Тест пройден»/«Тест не пройден» по проходному баллу.",
  assisted: "AI оценивает ответ и показывает балл, но решение принимает HR кнопками «Принять»/«Отклонить».",
  manual:   "AI не оценивает. HR проверяет ответ полностью вручную.",
}

// Дефолты тест-дожима (дублируют lib/messaging/test-invite.ts — тот server-only,
// импортировать в клиент нельзя). Используются для нового пустого состояния.
const DEFAULT_REMINDER_ITEMS: { day: number; text: string }[] = [
  { day: 1, text: "{{name}}, напоминаем про тест по вакансии «{{vacancy}}» — пройдите, пожалуйста, по ссылке:\n\n{{test_link}}\n\nЭто займёт немного времени." },
  { day: 3, text: "{{name}}, тест по «{{vacancy}}» ещё ждёт вас 🙂 Ссылка та же:\n\n{{test_link}}\n\nЕсли возникли вопросы — напишите здесь, помогу." },
  { day: 6, text: "{{name}}, последнее напоминание про тест по «{{vacancy}}». Если позиция интересна — пройдите, пожалуйста:\n\n{{test_link}}" },
]

export function TestTaskSettings({ vacancyId, onSaved }: Props) {
  const [taskText, setTaskText] = useState("")
  const [deadlineDays, setDeadlineDays] = useState(3)
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>("text")
  // Этап 2.
  const [checkMode, setCheckMode] = useState<CheckMode>("assisted")
  const [aiPrompt, setAiPrompt] = useState("")
  const [passingScore, setPassingScore] = useState(70)
  const [afterMessage, setAfterMessage] = useState("")
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderItems, setReminderItems] = useState<{ day: number; text: string }[]>(
    DEFAULT_REMINDER_ITEMS.map((it) => ({ ...it })),
  )
  // Формат практики (F5): хранится в postDemoSettings.testPracticeFormat.
  const [practiceFormat, setPracticeFormat] = useState<PracticeFormat>("none")
  const [demoId, setDemoId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    ;(async () => {
      try {
        // 1. Источник правды — запись demos kind='test' (та же, что таб «Тест»).
        const demoRes = await fetch(`/api/modules/hr/demos?vacancy_id=${encodeURIComponent(vacancyId)}&kind=test`)
        const demoJson = demoRes.ok ? await demoRes.json() : null
        const rows = demoJson?.data ?? demoJson
        const demo = Array.isArray(rows) ? rows[0] : null
        let applied = false
        if (demo?.id && !cancelled) {
          setDemoId(demo.id)
          const pds = (demo.postDemoSettings && typeof demo.postDemoSettings === "object") ? demo.postDemoSettings : null
          if (pds) {
            if (typeof pds.testTaskInstructions === "string") { setTaskText(pds.testTaskInstructions); applied = true }
            if (typeof pds.testDeadlineDays === "number") { setDeadlineDays(pds.testDeadlineDays); applied = true }
            if (pds.testResponseFormat === "file" || pds.testResponseFormat === "both" || pds.testResponseFormat === "text") {
              setResponseFormat(pds.testResponseFormat); applied = true
            }
            // Этап 2. testCheckMode: undefined → assisted (обратная совместимость).
            if (pds.testCheckMode === "auto" || pds.testCheckMode === "assisted" || pds.testCheckMode === "manual") {
              setCheckMode(pds.testCheckMode); applied = true
            } else if (pds.testAiCheck === false) {
              // Старые записи без режима: aiCheck=false → manual.
              setCheckMode("manual"); applied = true
            }
            if (typeof pds.testAiPrompt === "string") { setAiPrompt(pds.testAiPrompt); applied = true }
            if (typeof pds.testPassingScore === "number") { setPassingScore(pds.testPassingScore); applied = true }
            if (typeof pds.testAfterMessage === "string") { setAfterMessage(pds.testAfterMessage); applied = true }
            if (typeof pds.testReminderEnabled === "boolean") { setReminderEnabled(pds.testReminderEnabled); applied = true }
            if (pds.testPracticeFormat === "paid_task" || pds.testPracticeFormat === "mini_gph") {
              setPracticeFormat(pds.testPracticeFormat); applied = true
            }
            if (Array.isArray(pds.testReminderDays) && pds.testReminderDays.length > 0) {
              const msgs = Array.isArray(pds.testReminderMessages) ? pds.testReminderMessages : []
              setReminderItems(pds.testReminderDays.map((d: unknown, i: number) => ({
                day:  Math.max(1, Math.min(365, Number(d) || 1)),
                text: typeof msgs[i] === "string" ? msgs[i] : (DEFAULT_REMINDER_ITEMS[i]?.text ?? ""),
              })))
              applied = true
            }
          }
        }
        // 2. Fallback на legacy descriptionJson.testTask (старые вакансии).
        if (!applied && !cancelled) {
          const legacyRes = await fetch(`/api/modules/hr/vacancies/${vacancyId}/test-task`)
          const legacyJson = legacyRes.ok ? await legacyRes.json() : null
          const cfg = legacyJson?.config
          if (cfg && typeof cfg === "object" && !cancelled) {
            if (typeof cfg.taskText === "string") setTaskText(cfg.taskText)
            if (typeof cfg.deadlineDays === "number") setDeadlineDays(cfg.deadlineDays)
            if (cfg.responseFormat === "file" || cfg.responseFormat === "both" || cfg.responseFormat === "text") {
              setResponseFormat(cfg.responseFormat)
            }
          }
        }
      } catch { /* оставляем дефолты */ }
      finally { if (!cancelled) setLoaded(true) }
    })()
    return () => { cancelled = true }
  }, [vacancyId])

  const save = async () => {
    setSaving(true)
    try {
      // Создаём запись demos kind='test', если её ещё нет (общая с табом «Тест»).
      let id = demoId
      if (!id) {
        const createRes = await fetch("/api/modules/hr/demos", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ vacancy_id: vacancyId, kind: "test", title: "Тестовое задание", lessons_json: [] }),
        })
        if (!createRes.ok) throw new Error("Не удалось создать запись теста")
        const created = await createRes.json()
        id = (created.data ?? created).id
        setDemoId(id)
      }
      const res = await fetch(`/api/modules/hr/demos/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ post_demo_settings: {
          testTaskInstructions: taskText,
          testDeadlineDays:     deadlineDays,
          testResponseFormat:   responseFormat,
          // Этап 2.
          testCheckMode:        checkMode,
          testAiPrompt:         aiPrompt,
          testPassingScore:     passingScore,
          testAfterMessage:     afterMessage,
          testReminderEnabled:  reminderEnabled,
          testReminderDays:     [...reminderItems].sort((a, b) => a.day - b.day).map((it) => it.day),
          testReminderMessages: [...reminderItems].sort((a, b) => a.day - b.day).map((it) => it.text),
          // backward-compat: старый флаг держим в синхроне (manual = AI выкл).
          testAiCheck:          checkMode !== "manual",
          // Формат практики (F5).
          testPracticeFormat:   practiceFormat,
        } }),
      })
      if (!res.ok) throw new Error("Не удалось сохранить")
      toast.success("Тестовое задание сохранено")
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Тестовое задание</CardTitle>
        <CardDescription>
          Отдельная ступень воронки: задание → ответ кандидата → проверка.
          Применяется после анкеты, до интервью.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ─── Формат практики (F5) ──────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs">Формат практики</Label>
          <p className="text-xs text-muted-foreground">
            Влияет на дефолтный текст сообщения кандидату. Выберите «без оплаты» для обычного тест-задания.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            {(["none", "paid_task", "mini_gph"] as PracticeFormat[]).map((fmt) => (
              <label
                key={fmt}
                className="flex items-start gap-2.5 cursor-pointer group"
              >
                <input
                  type="radio"
                  name="practiceFormat"
                  value={fmt}
                  checked={practiceFormat === fmt}
                  onChange={() => {
                    setPracticeFormat(fmt)
                    // Подставляем дефолтный текст сообщения если поле пустое
                    if (fmt !== "none" && afterMessage.trim() === "") {
                      setAfterMessage(PRACTICE_FORMAT_DEFAULT_MESSAGES[fmt])
                    }
                  }}
                  className="mt-0.5 shrink-0 accent-primary"
                />
                <span className="text-sm leading-snug group-hover:text-primary transition-colors">
                  {PRACTICE_FORMAT_LABELS[fmt]}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t pt-3">
          <Label className="text-xs">Текст задания для кандидата</Label>
          <Textarea
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            placeholder="Опишите, что кандидат должен сделать..."
            rows={8}
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Срок выполнения (дней)</Label>
          <Input
            type="number"
            value={deadlineDays}
            onChange={(e) => setDeadlineDays(Number(e.target.value) || 3)}
            min={1}
            max={30}
            className="h-9 text-sm w-24"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Формат ответа</Label>
          <Select value={responseFormat} onValueChange={(v) => setResponseFormat(v as ResponseFormat)}>
            <SelectTrigger className="h-9 text-sm w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Текстовый ответ</SelectItem>
              <SelectItem value="file">Файл (PDF/DOC/ZIP)</SelectItem>
              <SelectItem value="both">Текст или файл</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ─── Этап 2: AI-проверка ──────────────────────────── */}
        <div className="space-y-2 border-t pt-3">
          <Label className="text-xs">Проверка ответа</Label>
          <Select value={checkMode} onValueChange={(v) => setCheckMode(v as CheckMode)}>
            <SelectTrigger className="h-9 text-sm w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Автоматически (AI решает)</SelectItem>
              <SelectItem value="assisted">AI оценивает, HR решает</SelectItem>
              <SelectItem value="manual">Только вручную (без AI)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{CHECK_MODE_HINT[checkMode]}</p>
        </div>

        {checkMode !== "manual" && (
          <>
            <div className="space-y-2">
              <Label className="text-xs">Критерии оценки для AI</Label>
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Например: оцени полноту ответа, релевантность опыту, качество аргументации. Если пусто — используется стандартный промпт."
                rows={4}
                className="text-sm"
              />
            </div>

            {checkMode === "auto" && (
              <div className="space-y-2">
                <Label className="text-xs">Проходной балл (0–100)</Label>
                <Input
                  type="number"
                  value={passingScore}
                  onChange={(e) => setPassingScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  min={0}
                  max={100}
                  className="h-9 text-sm w-24"
                />
                <p className="text-xs text-muted-foreground">
                  Балл ≥ проходного → «Тест пройден», иначе → «Тест не пройден».
                </p>
              </div>
            )}
          </>
        )}

        <div className="space-y-2 border-t pt-3">
          <Label className="text-xs">Сообщение после теста (опционально)</Label>
          <Textarea
            value={afterMessage}
            onChange={(e) => setAfterMessage(e.target.value)}
            placeholder="Например: {{name}}, спасибо за выполнение задания по «{{vacancy}}»! Свяжемся с вами в ближайшее время."
            rows={3}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Отправляется в hh-чат при прохождении теста. Плейсхолдеры: {"{{name}}"}, {"{{vacancy}}"}.
            В режиме «AI оценивает, HR решает» уходит после нажатия «Принять».
          </p>
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="test-reminder" className="text-sm cursor-pointer">Дожим по тесту (напоминания)</Label>
            <Switch id="test-reminder" checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
          </div>
          <p className="text-xs text-muted-foreground">
            Если кандидат получил тест, но не прошёл — напомним в hh-чат. Напоминания идут в рабочее
            время вакансии и прекращаются, как только кандидат сдал тест (или ушёл в отказ/найм).
            Плейсхолдеры: {"{{name}}"}, {"{{vacancy}}"}, {"{{test_link}}"}.
          </p>

          {reminderEnabled && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              {reminderItems.map((it, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Напоминание {idx + 1} — через</span>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={it.day}
                      onChange={(e) => {
                        const day = Math.max(1, Math.min(365, Number(e.target.value) || 1))
                        setReminderItems((prev) => prev.map((p, i) => i === idx ? { ...p, day } : p))
                      }}
                      className="h-7 w-16 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">дн. после отправки</span>
                    <button
                      type="button"
                      onClick={() => setReminderItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Удалить напоминание"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Textarea
                    value={it.text}
                    onChange={(e) => setReminderItems((prev) => prev.map((p, i) => i === idx ? { ...p, text: e.target.value } : p))}
                    rows={3}
                    className="text-sm"
                    placeholder="Текст напоминания…"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setReminderItems((prev) => [
                  ...prev,
                  { day: (prev[prev.length - 1]?.day ?? 0) + 3, text: "" },
                ])}
              >
                <Plus className="w-3.5 h-3.5" />
                Добавить напоминание
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
