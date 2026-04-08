"use client"

import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
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

const inputClass = "bg-[var(--input-bg)] border rounded-lg"

export function BlockCard({
  block,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  variables,
  isFirst,
  isLast,
}: BlockCardProps) {
  const meta = BLOCK_TYPES.find((bt) => bt.type === block.type)

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
              <div className="absolute top-2 right-2 z-10">
                <VariablePicker
                  variables={variables}
                  onInsert={handleVariableInsert}
                />
              </div>
            )}
            <Textarea
              className={cn(inputClass, "min-h-[120px]")}
              placeholder="Введите текст..."
              value={c.html}
              onChange={(e) => updateContent({ html: e.target.value })}
            />
          </div>
        )
      }

      case "heading": {
        const c = block.content as HeadingContent
        return (
          <div className="flex gap-3">
            <Input
              className={cn(inputClass, "flex-1")}
              placeholder="Текст заголовка"
              value={c.text}
              onChange={(e) => updateContent({ text: e.target.value })}
            />
            <Select
              value={String(c.level)}
              onValueChange={(v) => updateContent({ level: Number(v) as 1 | 2 | 3 })}
            >
              <SelectTrigger className={cn(inputClass, "w-24")}>
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
          <div className="space-y-2">
            <Input
              className={inputClass}
              placeholder="URL"
              value={c.url}
              onChange={(e) => updateContent({ url: e.target.value })}
            />
            <Input
              className={inputClass}
              placeholder="Подпись"
              value={c.caption}
              onChange={(e) => updateContent({ caption: e.target.value })}
            />
            <Select
              value={c.layout}
              onValueChange={(v) => updateContent({ layout: v as "full" | "left" | "right" })}
            >
              <SelectTrigger className={cn(inputClass, "w-40")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">На всю ширину</SelectItem>
                <SelectItem value="left">Слева</SelectItem>
                <SelectItem value="right">Справа</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )
      }

      case "audio": {
        const c = block.content as AudioContent
        return (
          <div className="space-y-2">
            <Input
              className={inputClass}
              placeholder="URL аудио"
              value={c.url}
              onChange={(e) => updateContent({ url: e.target.value })}
            />
            <Input
              className={inputClass}
              placeholder="Подпись"
              value={c.caption}
              onChange={(e) => updateContent({ caption: e.target.value })}
            />
          </div>
        )
      }

      case "file": {
        const c = block.content as FileContent
        return (
          <div className="space-y-2">
            <Input
              className={inputClass}
              placeholder="URL файла"
              value={c.url}
              onChange={(e) => updateContent({ url: e.target.value })}
            />
            <Input
              className={inputClass}
              placeholder="Название файла"
              value={c.name}
              onChange={(e) => updateContent({ name: e.target.value })}
            />
          </div>
        )
      }

      case "info": {
        const c = block.content as InfoContent
        return (
          <div className="space-y-2">
            <Textarea
              className={cn(inputClass, "min-h-[80px]")}
              placeholder="Текст инфо-блока"
              value={c.text}
              onChange={(e) => updateContent({ text: e.target.value })}
            />
            <Select
              value={c.color}
              onValueChange={(v) => updateContent({ color: v })}
            >
              <SelectTrigger className={cn(inputClass, "w-40")}>
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
          <div className="flex gap-3">
            <Input
              className={cn(inputClass, "flex-1")}
              placeholder="Текст кнопки"
              value={c.text}
              onChange={(e) => updateContent({ text: e.target.value })}
            />
            <Input
              className={cn(inputClass, "flex-1")}
              placeholder="URL ссылки"
              value={c.url}
              onChange={(e) => updateContent({ url: e.target.value })}
            />
          </div>
        )
      }

      case "test": {
        const c = block.content as TestContent
        return (
          <div className="space-y-4">
            {c.questions.map((q, qi) => (
              <div key={qi} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    className={cn(inputClass, "flex-1")}
                    placeholder={`Вопрос ${qi + 1}`}
                    value={q.question}
                    onChange={(e) => {
                      const questions = [...c.questions]
                      questions[qi] = { ...q, question: e.target.value }
                      updateContent({ questions })
                    }}
                  />
                  {c.questions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        const questions = c.questions.filter((_, i) => i !== qi)
                        updateContent({ questions })
                      }}
                    >
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
                        className={cn(inputClass, "flex-1 h-8 text-sm")}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => {
                            const questions = [...c.questions]
                            const options = q.options.filter((_, i) => i !== oi)
                            const correct = q.correct >= oi && q.correct > 0 ? q.correct - 1 : q.correct
                            questions[qi] = { ...q, options, correct }
                            updateContent({ questions })
                          }}
                        >
                          <X className="size-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const questions = [...c.questions]
                      questions[qi] = { ...q, options: [...q.options, ""] }
                      updateContent({ questions })
                    }}
                  >
                    <Plus className="size-3 mr-1" />
                    Добавить вариант
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const questions = [
                  ...c.questions,
                  { question: "", options: ["", ""], correct: 0 },
                ]
                updateContent({ questions })
              }}
            >
              <Plus className="size-4 mr-1" />
              Добавить вопрос
            </Button>
          </div>
        )
      }

      case "task": {
        const c = block.content as TaskContent
        return (
          <div className="flex gap-3">
            <Input
              className={cn(inputClass, "flex-1")}
              placeholder="Текст задания"
              value={c.question}
              onChange={(e) => updateContent({ question: e.target.value })}
            />
            <Select
              value={c.type}
              onValueChange={(v) => updateContent({ type: v as "text" | "video" | "file" })}
            >
              <SelectTrigger className={cn(inputClass, "w-36")}>
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
              className={cn(inputClass, "min-h-[80px]")}
              placeholder="Промпт / инструкция для записи"
              value={c.prompt}
              onChange={(e) => updateContent({ prompt: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Макс. длительность (сек):</span>
              <Input
                type="number"
                className={cn(inputClass, "w-24")}
                value={c.maxDuration}
                onChange={(e) => updateContent({ maxDuration: Number(e.target.value) })}
              />
            </div>
          </div>
        )
      }

      case "divider":
        return <hr className="border-t border-muted-foreground/20" />

      default:
        return null
    }
  }

  return (
    <div className="group rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-3">
        <GripVertical className="size-4 text-muted-foreground cursor-grab" />
        <span className="text-base">{meta?.icon}</span>
        <Badge variant="secondary" className="text-xs font-normal">
          {meta?.label}
        </Badge>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onMoveUp}
            disabled={isFirst}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onMoveDown}
            disabled={isLast}
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDuplicate}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <div>{renderContent()}</div>
    </div>
  )
}
