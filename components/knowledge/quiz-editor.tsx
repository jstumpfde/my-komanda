"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Plus, Trash2, GripVertical, CheckCircle2, CircleDot, AlignLeft,
  ToggleLeft, ListOrdered, ChevronDown, ChevronUp,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

export type QuestionType = "single" | "multiple" | "text" | "yesno" | "sort"

export interface QuizOption {
  id: string
  text: string
  isCorrect: boolean
}

export interface QuizQuestion {
  id: string
  text: string
  type: QuestionType
  options: QuizOption[]
  correctAnswer?: string // for text/yesno
  explanation?: string
  required: boolean
}

interface QuizEditorProps {
  questions: QuizQuestion[]
  onChange: (questions: QuizQuestion[]) => void
}

// ─── Constants ──────────────────────────────────────────────────────────────

const QUESTION_TYPES: { value: QuestionType; label: string; icon: React.ReactNode }[] = [
  { value: "single",   label: "Один ответ",      icon: <CircleDot className="size-3.5" /> },
  { value: "multiple", label: "Несколько ответов", icon: <CheckCircle2 className="size-3.5" /> },
  { value: "text",     label: "Текстовый ответ",  icon: <AlignLeft className="size-3.5" /> },
  { value: "yesno",    label: "Да / Нет",         icon: <ToggleLeft className="size-3.5" /> },
  { value: "sort",     label: "Сортировка",       icon: <ListOrdered className="size-3.5" /> },
]

function uid() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createQuestion(): QuizQuestion {
  return {
    id: uid(),
    text: "",
    type: "single",
    options: [
      { id: uid(), text: "", isCorrect: true },
      { id: uid(), text: "", isCorrect: false },
    ],
    required: true,
  }
}

// ─── Single question editor ─────────────────────────────────────────────────

function QuestionEditor({
  question, index, total, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  question: QuizQuestion
  index: number
  total: number
  onChange: (q: QuizQuestion) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  const updateOption = (optId: string, patch: Partial<QuizOption>) => {
    onChange({
      ...question,
      options: question.options.map((o) => o.id === optId ? { ...o, ...patch } : o),
    })
  }

  const addOption = () => {
    onChange({
      ...question,
      options: [...question.options, { id: uid(), text: "", isCorrect: false }],
    })
  }

  const removeOption = (optId: string) => {
    onChange({
      ...question,
      options: question.options.filter((o) => o.id !== optId),
    })
  }

  const toggleCorrect = (optId: string) => {
    if (question.type === "single") {
      onChange({
        ...question,
        options: question.options.map((o) => ({ ...o, isCorrect: o.id === optId })),
      })
    } else {
      onChange({
        ...question,
        options: question.options.map((o) =>
          o.id === optId ? { ...o, isCorrect: !o.isCorrect } : o,
        ),
      })
    }
  }

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <GripVertical className="size-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground w-6">#{index + 1}</span>
        <span className="text-sm font-medium truncate flex-1">
          {question.text || "Новый вопрос"}
        </span>
        <Badge variant="outline" className="text-[10px] font-normal shrink-0">
          {QUESTION_TYPES.find((t) => t.value === question.type)?.label}
        </Badge>
        {collapsed ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronUp className="size-4 text-muted-foreground" />}
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Question text */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Текст вопроса"
              value={question.text}
              onChange={(e) => onChange({ ...question, text: e.target.value })}
              className="h-9 text-sm flex-1"
            />
            <Select
              value={question.type}
              onValueChange={(v) => onChange({ ...question, type: v as QuestionType })}
            >
              <SelectTrigger className="h-9 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-1.5">
                      {t.icon}
                      {t.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Options for single/multiple/sort */}
          {(question.type === "single" || question.type === "multiple" || question.type === "sort") && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {question.type === "sort" ? "Элементы (в правильном порядке)" : "Варианты ответа"}
              </Label>
              {question.options.map((opt, oi) => (
                <div key={opt.id} className="flex items-center gap-2">
                  {question.type !== "sort" && (
                    <button
                      type="button"
                      onClick={() => toggleCorrect(opt.id)}
                      className={cn(
                        "shrink-0 size-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        opt.isCorrect
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-gray-300 hover:border-gray-400",
                      )}
                    >
                      {opt.isCorrect && <CheckCircle2 className="size-3" />}
                    </button>
                  )}
                  {question.type === "sort" && (
                    <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{oi + 1}.</span>
                  )}
                  <Input
                    placeholder={`Вариант ${oi + 1}`}
                    value={opt.text}
                    onChange={(e) => updateOption(opt.id, { text: e.target.value })}
                    className="h-8 text-sm flex-1"
                  />
                  {question.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(opt.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={addOption}>
                <Plus className="size-3" />
                Добавить вариант
              </Button>
            </div>
          )}

          {/* Yes/No */}
          {question.type === "yesno" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Правильный ответ</Label>
              <Select
                value={question.correctAnswer || "yes"}
                onValueChange={(v) => onChange({ ...question, correctAnswer: v })}
              >
                <SelectTrigger className="h-9 w-32 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Да</SelectItem>
                  <SelectItem value="no">Нет</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Text */}
          {question.type === "text" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ожидаемый ответ (необязательно)</Label>
              <Input
                placeholder="Ключевые слова или фраза..."
                value={question.correctAnswer || ""}
                onChange={(e) => onChange({ ...question, correctAnswer: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          )}

          {/* Explanation */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Пояснение к ответу (необязательно)</Label>
            <Input
              placeholder="Почему этот ответ правильный..."
              value={question.explanation || ""}
              onChange={(e) => onChange({ ...question, explanation: e.target.value })}
              className="h-9 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`req-${question.id}`}
                checked={question.required}
                onCheckedChange={(v) => onChange({ ...question, required: v === true })}
              />
              <Label htmlFor={`req-${question.id}`} className="text-xs font-normal cursor-pointer">
                Обязательный
              </Label>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={onMoveUp} disabled={index === 0}>
                <ChevronUp className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={onMoveDown} disabled={index === total - 1}>
                <ChevronDown className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="size-7 p-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main quiz editor ───────────────────────────────────────────────────────

export function QuizEditor({ questions, onChange }: QuizEditorProps) {
  const addQuestion = () => onChange([...questions, createQuestion()])

  const updateQuestion = (id: string, q: QuizQuestion) => {
    onChange(questions.map((qq) => qq.id === id ? q : qq))
  }

  const removeQuestion = (id: string) => {
    onChange(questions.filter((q) => q.id !== id))
  }

  const moveQuestion = (index: number, dir: -1 | 1) => {
    const next = [...questions]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Контрольные вопросы</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Проверка знаний после прочтения статьи
          </p>
        </div>
        <Badge variant="secondary" className="font-normal">{questions.length} вопр.</Badge>
      </div>

      {questions.length > 0 && (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              question={q}
              index={i}
              total={questions.length}
              onChange={(updated) => updateQuestion(q.id, updated)}
              onRemove={() => removeQuestion(q.id)}
              onMoveUp={() => moveQuestion(i, -1)}
              onMoveDown={() => moveQuestion(i, 1)}
            />
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addQuestion}>
        <Plus className="size-3.5" />
        Добавить вопрос
      </Button>
    </div>
  )
}

export { createQuestion }
