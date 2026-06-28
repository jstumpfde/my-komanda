"use client"

// Редактор платформенного baseline стоп-слов (F6). НЕ хардкод: правится здесь,
// применяется ко всем компаниям поверх их per-вакансионных списков.

import { useState } from "react"
import { Shield, Save, Loader2, RotateCcw, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { actionUpdateStopWordsBaseline } from "../actions"

export function StopWordsClient({ initial, seed }: { initial: string[]; seed: string[] }) {
  const [text, setText] = useState(initial.join("\n"))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    setSaving(true); setError(""); setSaved(false)
    try {
      const words = text.split("\n").map((w) => w.trim()).filter(Boolean)
      await actionUpdateStopWordsBaseline(words)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-6 px-4 sm:px-8 max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Стоп-слова — платформенный baseline</h1>
      </div>
      <div className="flex items-start gap-2 text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Базовый список применяется ко <b>всем компаниям</b> поверх их собственных стоп-слов вакансии (матч по целым словам). Раньше был захардкожен в коде. Одно слово или фраза на строку. Будьте осторожны: это защита от нежелательного дожима (инцидент 04.05).</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Список</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            className="font-mono text-sm"
            placeholder={"не интересно\nуже работаю\nнашёл работу"}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}Сохранить
            </Button>
            <Button variant="outline" onClick={() => setText(seed.join("\n"))} disabled={saving}>
              <RotateCcw className="w-4 h-4 mr-1.5" />Вернуть дефолт
            </Button>
            {saved && <span className="text-sm text-emerald-600">Сохранено</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
