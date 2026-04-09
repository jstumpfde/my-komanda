"use client"

import { useState } from "react"
import {
  Plus,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { VariablePicker } from "./variable-picker"
import {
  BLOCK_TYPES,
  type Block,
  type Variable,
  type TextContent,
  type HeadingContent,
  type ImageContent,
  type VideoContent,
  type AudioContent,
  type FileContent,
  type InfoContent,
  type ButtonContent,
  type TestContent,
  type TaskContent,
  type VideoRecordContent,
} from "./types"

interface BlockCardProps {
  block: Block
  onChange: (block: Block) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  variables?: Variable[]
  isFirst: boolean
  isLast: boolean
}

// Seamless input — no border, transparent bg
const seamlessInput = "border-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
// For fields that need structure (URL, selects) — subtle style
const fieldInput = "bg-muted/30 border-border/50 rounded-lg text-sm h-8"

export function BlockCard({
  block,
  onChange,
  onDelete: _onDelete,
  onMoveUp: _onMoveUp,
  onMoveDown: _onMoveDown,
  onDuplicate: _onDuplicate,
  variables,
  isFirst: _isFirst,
  isLast: _isLast,
}: BlockCardProps) {
  const meta = BLOCK_TYPES.find((bt) => bt.type === block.type)
  const [focused, setFocused] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateContent(patch: Record<string, any>) {
    onChange({ ...block, content: { ...block.content, ...patch } as Block["content"] })
  }

  function handleVariableInsert(key: string) {
    const c = block.content as TextContent
    updateContent({ html: (c.html || "") + `{{${key}}}` })
  }

  function renderContent() {
    switch (block.type) {
      case "text": {
        const c = block.content as TextContent
        return (
          <div className="relative">
            {variables && variables.length > 0 && (
              <div className="absolute top-1 right-0 z-10">
                <VariablePicker
                  variables={variables}
                  onInsert={handleVariableInsert}
                />
              </div>
            )}
            <Textarea
              className={cn(seamlessInput, "min-h-[60px] resize-none text-sm leading-relaxed")}
              placeholder="Введите текст..."
              value={c.html}
              onChange={(e) => updateContent({ html: e.target.value })}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </div>
        )
      }

      case "heading": {
        const c = block.content as HeadingContent
        const sizes = { 1: "text-2xl font-bold", 2: "text-xl font-semibold", 3: "text-lg font-medium" }
        return (
          <div className="flex items-center gap-3">
            <Input
              className={cn(seamlessInput, "flex-1", sizes[c.level])}
              placeholder="Текст заголовка"
              value={c.text}
              onChange={(e) => updateContent({ text: e.target.value })}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <Select
              value={String(c.level)}
              onValueChange={(v) => updateContent({ level: Number(v) as 1 | 2 | 3 })}
            >
              <SelectTrigger className={cn(fieldInput, "w-16 h-7 text-xs opacity-0 group-hover/card:opacity-100 transition-opacity")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">H1</SelectItem>
                <SelectItem value="2">H2</SelectItem>
                <SelectItem value="3">H3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )
      }

      case "image":
      case "video": {
        const c = block.content as ImageContent | VideoContent
        return (
          <div className="space-y-1.5">
            <Input
              className={fieldInput}
              placeholder={block.type === "image" ? "URL изображения" : "URL видео (YouTube)"}
              value={c.url}
              onChange={(e) => updateContent({ url: e.target.value })}
            />
            <div className="flex gap-2">
              <Input
                className={cn(fieldInput, "flex-1")}
                placeholder="Подпись"
                value={c.caption}
                onChange={(e) => updateContent({ caption: e.target.value })}
              />
              <Select
                value={c.layout}
                onValueChange={(v) => updateContent({ layout: v as "full" | "left" | "right" })}
              >
                <SelectTrigger className={cn(fieldInput, "w-36")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">На всю ширину</SelectItem>
                  <SelectItem value="left">Слева</SelectItem>
                  <SelectItem value="right">Справа</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )
      }

      case "audio": {
        const c = block.content as AudioContent
        return (
          <div className="space-y-1.5">
            <Input className={fieldInput} placeholder="URL аудио" value={c.url} onChange={(e) => updateContent({ url: e.target.value })} />
            <Input className={fieldInput} placeholder="Подпись" value={c.caption} onChange={(e) => updateContent({ caption: e.target.value })} />
          </div>
        )
      }

      case "file": {
        const c = block.content as FileContent
        return (
          <div className="space-y-1.5">
            <Input className={fieldInput} placeholder="URL файла" value={c.url} onChange={(e) => updateContent({ url: e.target.value })} />
            <Input className={fieldInput} placeholder="Название файла" value={c.name} onChange={(e) => updateContent({ name: e.target.value })} />
          </div>
        )
      }

      case "info": {
        const c = block.content as InfoContent
        const colorMap: Record<string, string> = {
          blue: "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
          green: "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
          yellow: "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
          red: "border-l-red-500 bg-red-50/50 dark:bg-red-950/20",
        }
        return (
          <div className={cn("border-l-4 rounded-r-lg p-3 space-y-2", colorMap[c.color] ?? colorMap.blue)}>
            <Textarea
              className={cn(seamlessInput, "min-h-[60px] resize-none text-sm")}
              placeholder="Текст инфо-блока"
              value={c.text}
              onChange={(e) => updateContent({ text: e.target.value })}
            />
            <Select value={c.color} onValueChange={(v) => updateContent({ color: v })}>
              <SelectTrigger className={cn(fieldInput, "w-32 h-7 text-xs")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blue">Синий</SelectItem>
                <SelectItem value="green">Зелёный</SelectItem>
                <SelectItem value="yellow">Жёлтый</SelectItem>
                <SelectItem value="red">Красный</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )
      }

      case "button": {
        const c = block.content as ButtonContent
        return (
          <div className="flex gap-2">
            <Input className={cn(fieldInput, "flex-1")} placeholder="Текст кнопки" value={c.text} onChange={(e) => updateContent({ text: e.target.value })} />
            <Input className={cn(fieldInput, "flex-1")} placeholder="URL ссылки" value={c.url} onChange={(e) => updateContent({ url: e.target.value })} />
          </div>
        )
      }

      case "test": {
        const c = block.content as TestContent
        return (
          <div className="space-y-3">
            {c.questions.map((q, qi) => (
              <div key={qi} className="space-y-2 rounded-lg bg-muted/20 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    className={cn(fieldInput, "flex-1 h-9")}
                    placeholder={`Вопрос ${qi + 1}`}
                    value={q.question}
                    onChange={(e) => {
                      const questions = [...c.questions]
                      questions[qi] = { ...q, question: e.target.value }
                      updateContent({ questions })
                    }}
                  />
                  {c.questions.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => updateContent({ questions: c.questions.filter((_, i) => i !== qi) })}>
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5 pl-2">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`q-${block.id}-${qi}`}
                        checked={q.correct === oi}
                        onChange={() => {
                          const questions = [...c.questions]
                          questions[qi] = { ...q, correct: oi }
                          updateContent({ questions })
                        }}
                        className="accent-primary"
                      />
                      <Input
                        className={cn(fieldInput, "flex-1 h-7 text-xs")}
                        placeholder={`Вариант ${oi + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const questions = [...c.questions]
                          const options = [...q.options]
                          options[oi] = e.target.value
                          questions[qi] = { ...q, options }
                          updateContent({ questions })
                        }}
                      />
                      {q.options.length > 2 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => {
                          const questions = [...c.questions]
                          const options = q.options.filter((_, i) => i !== oi)
                          const correct = q.correct >= oi && q.correct > 0 ? q.correct - 1 : q.correct
                          questions[qi] = { ...q, options, correct }
                          updateContent({ questions })
                        }}>
                          <X className="size-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                    const questions = [...c.questions]
                    questions[qi] = { ...q, options: [...q.options, ""] }
                    updateContent({ questions })
                  }}>
                    <Plus className="size-3 mr-1" /> Добавить вариант
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => updateContent({ questions: [...c.questions, { question: "", options: ["", ""], correct: 0 }] })}>
              <Plus className="size-4 mr-1" /> Добавить вопрос
            </Button>
          </div>
        )
      }

      case "task": {
        const c = block.content as TaskContent
        return (
          <div className="flex gap-2">
            <Input className={cn(fieldInput, "flex-1 h-9")} placeholder="Текст задания" value={c.question} onChange={(e) => updateContent({ question: e.target.value })} />
            <Select value={c.type} onValueChange={(v) => updateContent({ type: v as "text" | "video" | "file" })}>
              <SelectTrigger className={cn(fieldInput, "w-28")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Текст</SelectItem>
                <SelectItem value="video">Видео</SelectItem>
                <SelectItem value="file">Файл</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )
      }

      case "video_record": {
        const c = block.content as VideoRecordContent
        return (
          <div className="space-y-2">
            <Textarea
              className={cn(seamlessInput, "min-h-[60px] resize-none text-sm")}
              placeholder="Промпт / инструкция для записи"
              value={c.prompt}
              onChange={(e) => updateContent({ prompt: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Макс. длительность (сек):</span>
              <Input type="number" className={cn(fieldInput, "w-20")} value={c.maxDuration} onChange={(e) => updateContent({ maxDuration: Number(e.target.value) })} />
            </div>
          </div>
        )
      }

      case "divider":
        return <hr className="border-t border-muted-foreground/20 my-1" />

      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        "group/card relative py-1 pl-1 pr-0 transition-all",
        focused && "border-l-2 border-l-primary",
        !focused && "border-l-2 border-l-transparent",
      )}
    >
      {/* Type badge — only on hover */}
      {meta && block.type !== "text" && block.type !== "divider" && (
        <div className="opacity-0 group-hover/card:opacity-100 transition-opacity mb-1">
          <Badge variant="secondary" className="text-[10px] font-normal py-0 px-1.5 h-4">
            {meta.icon} {meta.label}
          </Badge>
        </div>
      )}
      <div>{renderContent()}</div>
    </div>
  )
}
