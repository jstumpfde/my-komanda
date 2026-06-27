"use client"

// Редактор платформенных drip-шаблонов дожима. НЕ хардкод — правится здесь,
// конструктор воронки генерит из этого цепочки касаний.

import { useState } from "react"
import { Repeat, Save, Loader2, RotateCcw, Plus, Trash2, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { actionUpdateDripTemplates } from "../actions"
import type { DripTemplates, DripStepWords } from "@/lib/db/schema"

const STEP_LABELS: Record<string, string> = {
  demo: "Демонстрация", test: "Тест", task: "Задание",
  prequalification: "Предквалификация", interview: "Интервью", offer: "Оффер",
}

function ListEditor({ title, hint, items, onChange }: {
  title: string; hint: string; items: string[]; onChange: (v: string[]) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground">{items.length} касаний</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((t, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-xs text-muted-foreground w-5 pt-2 text-right shrink-0">{i + 1}</span>
            <Textarea rows={2} value={t} onChange={e => { const next = [...items]; next[i] = e.target.value; onChange(next) }}
              className="text-sm resize-none flex-1" />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(items.filter((_, j) => j !== i))} title="Удалить касание">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onChange([...items, ""])}>
          <Plus className="w-3.5 h-3.5" /> Добавить касание
        </Button>
      </CardContent>
    </Card>
  )
}

export function DripTemplatesClient({ initial, seed }: { initial: DripTemplates; seed: DripTemplates }) {
  const [tpl, setTpl] = useState<DripTemplates>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const setField = <K extends keyof DripTemplates>(k: K, v: DripTemplates[K]) => setTpl(p => ({ ...p, [k]: v }))
  const setStep = (action: string, field: keyof DripStepWords, value: string) =>
    setTpl(p => ({ ...p, stepWords: { ...p.stepWords, [action]: { ...p.stepWords[action], [field]: value === "" ? null : value } } }))

  async function save() {
    setSaving(true); setError(""); setSaved(false)
    try {
      await actionUpdateDripTemplates(tpl)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения")
    } finally { setSaving(false) }
  }

  return (
    <div className="py-6 px-4 sm:px-8 max-w-4xl space-y-5">
      <div className="flex items-center gap-2">
        <Repeat className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Шаблоны дожима (drip)</h1>
      </div>
      <div className="flex items-start gap-2 text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Эталон, из которого конструктор воронки генерит цепочки касаний для стадий. HR потом редактирует тексты на стадии. Переменные этапа: <code className="text-xs">{"{{step_noun}}"}</code> (обзор/тест/…), <code className="text-xs">{"{{step_verb}}"}</code>, <code className="text-xs">{"{{step_verb_done}}"}</code>, <code className="text-xs">{"{{step_time}}"}</code>, <code className="text-xs">{"{{step_link}}"}</code> + <code className="text-xs">{"{{name}}"}</code>, <code className="text-xs">{"{{vacancy}}"}</code>.</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Слова этапов</CardTitle>
          <p className="text-xs text-muted-foreground">Подставляются в шаблоны вместо {"{{step_*}}"}. Пустое поле = не подставляется (напр. ветка Б недоступна, если нет «глагол Б»).</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="text-left font-medium pb-1 pr-2">Этап</th><th className="text-left font-medium pb-1 pr-2">Сущ. (винит.)</th><th className="text-left font-medium pb-1 pr-2">Глагол А</th><th className="text-left font-medium pb-1 pr-2">Глагол Б</th><th className="text-left font-medium pb-1 pr-2">Время</th><th className="text-left font-medium pb-1">Ссылка</th></tr>
            </thead>
            <tbody>
              {Object.keys(tpl.stepWords).map(action => {
                const w = tpl.stepWords[action]
                return (
                  <tr key={action} className="border-t border-border/40">
                    <td className="py-1 pr-2 font-medium whitespace-nowrap">{STEP_LABELS[action] ?? action}</td>
                    {(["noun", "verb", "verb_done", "time", "link"] as (keyof DripStepWords)[]).map(f => (
                      <td key={f} className="py-1 pr-2">
                        <Input value={(w[f] as string | null) ?? ""} onChange={e => setStep(action, f, e.target.value)} className="h-7 text-xs min-w-[90px]" />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ListEditor title="Ветка А — «не открыл / не начал»" hint="Универсальные касания для всех этапов с {{step_*}}." items={tpl.branchA} onChange={v => setField("branchA", v)} />
      <ListEditor title="Ветка Б — «открыл, но не завершил»" hint="Для этапов с «глаголом Б» (demo/test/task)." items={tpl.branchB} onChange={v => setField("branchB", v)} />
      <ListEditor title="Живые этапы (интервью)" hint="Только ветка А, есть приглашение/ссылка." items={tpl.live} onChange={v => setField("live", v)} />
      <ListEditor title="Оффер" hint="Без ссылки и переменных этапа." items={tpl.offer} onChange={v => setField("offer", v)} />

      <div className="flex items-center gap-3 sticky bottom-2 bg-background/80 backdrop-blur py-2 rounded-lg">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Сохранить
        </Button>
        <Button variant="outline" onClick={() => setTpl(seed)} disabled={saving} className="gap-2">
          <RotateCcw className="w-3.5 h-3.5" /> Сбросить к стандартным
        </Button>
        {saved && <span className="text-xs text-emerald-600 font-medium">Сохранено</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )
}
