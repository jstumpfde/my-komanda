"use client"

// #46: «Аварийное повторное сообщение» — opt-in блок под спойлером.
// По умолчанию выключено + текст пустой. Никакого hardcoded fallback.
// HR редактирует и сохраняет вручную через свой endpoint.

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { AlertTriangle, ChevronDown, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Props {
  vacancyId: string
  initialEnabled?: boolean | null
  initialText?: string | null
  onSaved?: () => void
}

export function RecoveryMessageSettings({ vacancyId, initialEnabled, initialText, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(Boolean(initialEnabled))
  const [text, setText] = useState(typeof initialText === "string" ? initialText : "")
  const [saving, setSaving] = useState(false)
  const [savedBaseline, setSavedBaseline] = useState({
    enabled: Boolean(initialEnabled),
    text:    typeof initialText === "string" ? initialText : "",
  })

  const dirty = enabled !== savedBaseline.enabled || text !== savedBaseline.text

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/recovery-message`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled, text }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || "save failed")
      }
      setSavedBaseline({ enabled, text })
      onSaved?.()
      toast.success("Сохранено")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full" asChild>
          <button type="button" className="w-full text-left">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Аварийное повторное сообщение
                      {enabled && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-50 text-amber-800 border-amber-200">
                          ВКЛ
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Отдельный текст для повторной отправки кандидату, если ссылка
                      в первом сообщении оказалась битой. По умолчанию ВЫКЛ.
                      Автоматически не отправляется.
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown className={cn("w-4 h-4 transition-transform shrink-0", open && "rotate-180")} />
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium">Использовать аварийное сообщение</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Когда ВЫКЛ — никогда не отправляется. Когда ВКЛ — HR жмёт
                  «Отправить повторное» в карточке кандидата (ручной триггер).
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className={cn("space-y-1.5", !enabled && "opacity-60 pointer-events-none")}>
              <label className="text-xs font-medium">Текст сообщения</label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Текст сообщения. Например: «{{name}}, в прошлом сообщении была неактуальная ссылка. Вот рабочая: {{demo_link}}»"
                rows={5}
                className="text-sm resize-y"
              />
              <p className="text-[11px] text-muted-foreground">
                Плейсхолдеры: {"{{name}}"}, {"{{vacancy}}"}, {"{{company}}"}, {"{{demo_link}}"}.
                Если поле пустое — повторное сообщение не отправляется даже при ВКЛ.
              </p>
            </div>

            {dirty && (
              <div className="flex justify-end pt-2 border-t">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {saving ? "Сохраняем..." : "Сохранить"}
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
