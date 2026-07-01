"use client"

// #31: переиспользуемый редактируемый предпросмотр сообщения кандидату.
//
// Паттерн ручных отправок из карточки: показываем ТЕКСТ, который уйдёт
// кандидату (с подставленными {{name}}/{{vacancy}}/…), даём подправить именно
// для этого кандидата (textarea) и кнопку «Сохранить изменения в шаблоне»
// (обновляет соответствующий шаблон вакансии через onSaveTemplate).
//
// Использование:
//   <EditableMessagePreview
//     text={text}
//     onChange={setText}
//     vars={{ name: "Иван", vacancy: "Продавец", schedule_link: "https://…" }}
//     placeholders={["name", "vacancy", "schedule_link"]}
//     onSaveTemplate={async (t) => { await fetch(...) }}
//   />

import { useMemo, useRef, useState } from "react"
import { Loader2, Save } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"

export interface EditableMessagePreviewProps {
  /** Текущий текст шаблона (с плейсхолдерами {{…}}). */
  text: string
  /** Колбэк изменения текста (разовое переопределение для этого кандидата). */
  onChange: (next: string) => void
  /** Значения плейсхолдеров для рендера превью ({ name, vacancy, schedule_link, … }). */
  vars: Record<string, string>
  /** Токены БЕЗ обёрток {{ }} для кликабельных бейджей. По умолчанию — ключи vars. */
  placeholders?: string[]
  /**
   * Сохранить текущий текст в шаблон вакансии. Если не задан — кнопка «Сохранить
   * в шаблоне» не показывается (напр. для разовых сообщений без шаблона).
   */
  onSaveTemplate?: (text: string) => Promise<void>
  /** Подпись над полем. */
  label?: string
  /** Доп. класс контейнера. */
  className?: string
  /** Кол-во строк textarea. */
  rows?: number
}

// Подставляет {{key}} → vars[key]. Неизвестные плейсхолдеры оставляет как есть.
export function renderPreview(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m,
  )
}

export function EditableMessagePreview({
  text,
  onChange,
  vars,
  placeholders,
  onSaveTemplate,
  label = "Текст сообщения кандидату",
  className,
  rows = 5,
}: EditableMessagePreviewProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const preview = useMemo(() => renderPreview(text, vars), [text, vars])
  const badgeTokens = placeholders ?? Object.keys(vars)

  const handleSave = async () => {
    if (!onSaveTemplate) return
    setSaving(true)
    setSaved(false)
    try {
      await onSaveTemplate(text)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      <Textarea
        ref={taRef}
        value={text}
        rows={rows}
        onChange={(e) => { onChange(e.target.value); setSaved(false) }}
        className="text-sm"
      />
      {badgeTokens.length > 0 && (
        <PlaceholderBadges
          textareaRef={taRef}
          placeholders={badgeTokens}
          value={text}
          onValueChange={(v) => { onChange(v); setSaved(false) }}
        />
      )}

      {/* Превью — как увидит кандидат (плейсхолдеры подставлены). */}
      <div className="rounded-md border bg-muted/40 p-3">
        <div className="text-[11px] text-muted-foreground mb-1">Так увидит кандидат:</div>
        <div className="text-sm whitespace-pre-wrap break-words">{preview || "—"}</div>
      </div>

      {onSaveTemplate && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить изменения в шаблоне
          </Button>
          {saved && <span className="text-[11px] text-emerald-600">Сохранено в шаблоне вакансии</span>}
        </div>
      )}
    </div>
  )
}
