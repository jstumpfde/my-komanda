"use client"

// P0-22: editable стоп-слова на уровне вакансии.
// Рендерится в табе настроек «Воронка» (settingsSection === "funnel").
// API: PUT /api/modules/hr/vacancies/[id]/stop-words { stopWords: string[] }.

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Save, Loader2, Plus, X } from "lucide-react"

interface VacancyStopWordsSettingsProps {
  vacancyId: string
  initial?: string[] | null
  onSaved?: (stopWords: string[]) => void
}

export function VacancyStopWordsSettings({
  vacancyId,
  initial,
  onSaved,
}: VacancyStopWordsSettingsProps) {
  const initialList = Array.isArray(initial) ? initial : []
  const [stopWords, setStopWords] = useState<string[]>(initialList)
  const [savedStopWords, setSavedStopWords] = useState<string[]>(initialList)
  const [input, setInput] = useState("")
  const [saving, setSaving] = useState(false)

  // Если родитель обновил initial (после refetchVacancy) — догоняемся, но
  // только если у нас не было локальных правок (savedStopWords === stopWords).
  useEffect(() => {
    if (!Array.isArray(initial)) return
    const incoming = JSON.stringify(initial)
    if (incoming !== JSON.stringify(savedStopWords)) {
      setSavedStopWords(initial)
      // Если у пользователя не было дирти — догоняем стейт. Иначе оставляем
      // его правки (например, он сейчас как раз печатает).
      if (JSON.stringify(stopWords) === JSON.stringify(savedStopWords)) {
        setStopWords(initial)
      }
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(stopWords) !== JSON.stringify(savedStopWords)

  // Авто-сохранение: добавил/удалил слово → сразу пишем в БД, без отдельной
  // кнопки (раньше слова терялись, если не нажать «Сохранить» перед перезагрузкой).
  const persist = async (list: string[]) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/stop-words`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ stopWords: list }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || "save failed")
      }
      const json = await res.json() as { stopWords?: string[] }
      const saved = json.stopWords ?? list
      setStopWords(saved)
      setSavedStopWords(saved)
      onSaved?.(saved)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  const addWord = () => {
    const t = input.trim()
    if (!t) return
    if (stopWords.some(w => w.toLowerCase() === t.toLowerCase())) {
      toast.error("Это слово уже есть")
      return
    }
    const next = [...stopWords, t]
    setStopWords(next)
    setInput("")
    void persist(next)
  }
  const removeWord = (idx: number) => {
    const next = stopWords.filter((_, i) => i !== idx)
    setStopWords(next)
    void persist(next)
  }

  const handleSave = () => persist(stopWords)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Стоп-слова → перевод в «Отказ»</CardTitle>
        <CardDescription>
          Если в ответе анкеты встретится одно из этих слов или фраз — кандидат
          автоматически попадает в стадию «Отказ», касания дожима отменяются.
          Поиск по подстроке, регистр не учитывается.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {stopWords.length === 0 && (
            <span className="text-xs text-muted-foreground italic">
              Список пустой — стоп-слова на этой вакансии не применяются.
            </span>
          )}
          {stopWords.map((w, idx) => (
            <Badge
              key={`${w}-${idx}`}
              variant="secondary"
              className="text-xs gap-1 pr-1 font-normal"
            >
              {w}
              <button
                type="button"
                onClick={() => removeWord(idx)}
                className="hover:text-destructive ml-0.5"
                aria-label={`Удалить ${w}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWord() } }}
            placeholder="Добавить слово или фразу…"
            className="h-9 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addWord}
            disabled={!input.trim()}
            className="gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить
          </Button>
        </div>
        {dirty && (
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Сохраняем..." : "Сохранить стоп-слова"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
