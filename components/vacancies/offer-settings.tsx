"use client"

// Группа 19: минимальная UI-заглушка для блока «Оффер».
// API: GET/PUT /api/modules/hr/vacancies/[id]/offer.
// Хранение в vacancy.descriptionJson.offer.

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

interface Props {
  vacancyId: string
  onSaved?: () => void
}

const PLACEHOLDERS = ["name", "position", "salary", "startDate"]

export function OfferSettings({ vacancyId, onSaved }: Props) {
  const [templateText, setTemplateText] = useState("")
  const [requireSignature, setRequireSignature] = useState(false)
  const [defaultTemplate, setDefaultTemplate] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/offer`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled) return
        if (typeof json?.defaultTemplate === "string") setDefaultTemplate(json.defaultTemplate)
        const cfg = json?.config
        if (cfg && typeof cfg === "object") {
          setTemplateText(typeof cfg.templateText === "string" ? cfg.templateText : (json.defaultTemplate ?? ""))
          if (typeof cfg.requireSignature === "boolean") setRequireSignature(cfg.requireSignature)
        } else if (typeof json?.defaultTemplate === "string") {
          setTemplateText(json.defaultTemplate)
        }
        setLoaded(true)
      })
      .catch(() => { setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/offer`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ templateText, requireSignature }),
      })
      if (!res.ok) throw new Error("Не удалось сохранить")
      toast.success("Шаблон оффера сохранён")
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = () => {
    if (defaultTemplate) setTemplateText(defaultTemplate)
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
        <CardTitle className="text-base">Оффер</CardTitle>
        <CardDescription>
          Шаблон документа об оффере. Поддерживает плейсхолдеры.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Текст шаблона</Label>
            <div className="flex items-center gap-1.5">
              {PLACEHOLDERS.map(p => (
                <Badge key={p} variant="outline" className="text-[10px] font-mono">{`{{${p}}}`}</Badge>
              ))}
            </div>
          </div>
          <Textarea
            value={templateText}
            onChange={(e) => setTemplateText(e.target.value)}
            rows={12}
            className="text-sm font-mono"
          />
          {defaultTemplate && templateText !== defaultTemplate && (
            <Button variant="ghost" size="sm" onClick={resetToDefault} className="h-7 text-xs">
              Сбросить к шаблону по умолчанию
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div>
            <Label className="text-sm">Требовать электронную подпись</Label>
            <p className="text-xs text-muted-foreground">Кандидат должен подписать оффер до выхода</p>
          </div>
          <Switch checked={requireSignature} onCheckedChange={setRequireSignature} />
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
