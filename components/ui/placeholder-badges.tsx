"use client"

// #57: кликабельные плейсхолдеры под textarea.
// Раньше бейджи {{name}} {{vacancy}} и т.д. были декоративные — пользователь
// должен был запомнить и набрать вручную. Теперь клик вставляет токен в
// позицию курсора (или в конец, если фокуса нет).
//
// Использование:
//   const ref = useRef<HTMLTextAreaElement>(null)
//   <textarea ref={ref} value={text} onChange={e => setText(e.target.value)} />
//   <PlaceholderBadges
//     textareaRef={ref}
//     placeholders={["name", "vacancy", "company", "demo_link"]}
//     value={text}
//     onValueChange={setText}
//   />

import { useCallback, type RefObject } from "react"
import { Badge } from "@/components/ui/badge"

interface PlaceholderBadgesProps {
  /** Либо прямой RefObject, либо функция-аксессор (для случаев, когда
      textarea лежит в массиве/мапе). Если функция — вызывается на каждом
      клике (поэтому ОК, что значение меняется между рендерами). */
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  getTextarea?: () => HTMLTextAreaElement | null
  /** Список токенов БЕЗ обёрток {{ }} — компонент сам обернёт. */
  placeholders: string[]
  /** Текущее значение textarea. */
  value: string
  /** Колбэк обновления значения. */
  onValueChange: (next: string) => void
  /** Дополнительный класс для контейнера. */
  className?: string
}

export function PlaceholderBadges({
  textareaRef,
  getTextarea,
  placeholders,
  value,
  onValueChange,
  className,
}: PlaceholderBadgesProps) {
  const insert = useCallback((token: string) => {
    const wrapped = `{{${token}}}`
    const el = textareaRef?.current ?? getTextarea?.() ?? null
    if (!el) {
      onValueChange(value + wrapped)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + wrapped + value.slice(end)
    onValueChange(next)
    // Восстанавливаем курсор после вставки на след. рендере.
    requestAnimationFrame(() => {
      el.focus()
      const caret = start + wrapped.length
      el.setSelectionRange(caret, caret)
    })
  }, [textareaRef, getTextarea, value, onValueChange])

  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      {placeholders.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => insert(p)}
          className="inline-flex"
        >
          <Badge
            variant="outline"
            className="text-[10px] cursor-pointer hover:bg-primary/10 hover:border-primary/40 transition-colors"
          >
            {`{{${p}}}`}
          </Badge>
        </button>
      ))}
    </div>
  )
}
