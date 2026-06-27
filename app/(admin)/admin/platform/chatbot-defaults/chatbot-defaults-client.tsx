"use client"

// Редактор платформенных дефолтных текстов AI чат-бота.

import { useState } from "react"
import { Bot, Save, Loader2, RotateCcw, Plus, Trash2, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { actionUpdateChatbotDefaults } from "../actions"
import type { ChatbotDefaults } from "@/lib/db/schema"

export function ChatbotDefaultsClient({ initial, seed }: { initial: ChatbotDefaults; seed: ChatbotDefaults }) {
  const [f, setF] = useState<ChatbotDefaults>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const set = <K extends keyof ChatbotDefaults>(k: K, v: ChatbotDefaults[K]) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true); setError(""); setSaved(false)
    try {
      await actionUpdateChatbotDefaults(f)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения")
    } finally { setSaving(false) }
  }

  const Field = ({ label, hint, k, rows = 2 }: { label: string; hint?: string; k: keyof ChatbotDefaults; rows?: number }) => (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Textarea rows={rows} value={f[k] as string} onChange={e => set(k, e.target.value as ChatbotDefaults[typeof k])} className="text-sm resize-none" />
    </div>
  )

  return (
    <div className="py-6 px-4 sm:px-8 max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">AI чат-бот — тексты по умолчанию</h1>
      </div>
      <div className="flex items-start gap-2 text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Эталон для всех компаний. Компания/вакансия могут перебить в настройках бота. Нерушимые security-правила (не обещать зарплату, не раскрывать что AI и т.п.) здесь НЕ редактируются — они зашиты для безопасности.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Автоотказы бота</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Попытка перепрограммировать AI (injection)" k="rejectionInjection" />
          <Field label="Мат / оскорбления / угрозы" k="rejectionSevereAbuse" />
          <Field label="Повторная грубость" k="rejectionRepeatedAbuse" />
          <Field label="Признаки нестабильности" k="rejectionUnstable" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Предупреждение за тон</CardTitle></CardHeader>
        <CardContent><Field label="Первое предупреждение" hint="Отправляется при первом грубом сообщении, до отказа." k="firstWarning" /></CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between"><span>«Пишет…» (короткие сообщения)</span><span className="text-xs font-normal text-muted-foreground">{f.shortMessages.length}</span></CardTitle>
          <p className="text-xs text-muted-foreground">Имитация печати перед основным ответом. Бот берёт случайное.</p></CardHeader>
        <CardContent className="space-y-2">
          {f.shortMessages.map((m, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input value={m} onChange={e => { const n = [...f.shortMessages]; n[i] = e.target.value; set("shortMessages", n) }} className="h-8 text-sm flex-1" />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => set("shortMessages", f.shortMessages.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => set("shortMessages", [...f.shortMessages, ""])}><Plus className="w-3.5 h-3.5" /> Добавить</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Напоминания предквалификации</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="День 1" k="prequalReminderD1" />
          <Field label="День 3" k="prequalReminderD3" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Плейбук сценариев ответов</CardTitle>
          <p className="text-xs text-muted-foreground">Типовые ответы бота (зарплата, локация, прокрастинация, возражения, запрос человека и т.д.). Вставляется в системный промпт после нерушимых правил. Переменные: {"{{name}}"}, {"{{vacancy}}"}, {"{{step_noun}}"}, {"{{step_verb}}"}, {"{{step_link}}"}.</p>
        </CardHeader>
        <CardContent><Field label="Сценарии" k="responsePlaybook" rows={20} /></CardContent>
      </Card>

      <div className="flex items-center gap-3 sticky bottom-2 bg-background/80 backdrop-blur py-2 rounded-lg">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Сохранить
        </Button>
        <Button variant="outline" onClick={() => setF(seed)} disabled={saving} className="gap-2"><RotateCcw className="w-3.5 h-3.5" /> Сбросить к стандартным</Button>
        {saved && <span className="text-xs text-emerald-600 font-medium">Сохранено</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )
}
