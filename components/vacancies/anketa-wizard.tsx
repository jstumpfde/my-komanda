"use client"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sparkles, Paperclip, Loader2 } from "lucide-react"
import { toast } from "sonner"

// ═══ TYPES ═══

export interface ParsedVacancy {
  positionTitle: string
  positionCategory: string
  industry: string
  positionCity: string
  workFormats: string[]
  employment: string[]
  salaryFrom: string
  salaryTo: string
  bonus: string
  responsibilities: string
  requirements: string
  requiredSkills: string[]
  desiredSkills: string[]
  unacceptableSkills: string[]
  experienceMin: string
  experienceIdeal: string
  requiredExperience?: string
  employmentType?: string[]
  schedule?: string
  employeeType?: string
  hiringPlan?: number
  conditions: string[]
  screeningQuestions: string[]
  hhDescription: string
}

interface AnketaWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (result: ParsedVacancy) => void
  initialTitle?: string
}

// ═══ COMPONENT ═══

export function AnketaWizard({ open, onOpenChange, onComplete, initialTitle }: AnketaWizardProps) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const ext = file.name.split(".").pop()?.toLowerCase()

    if (ext === "txt") {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        if (content) {
          setText(prev => prev ? prev + "\n\n" + content : content)
          toast.success(`Файл «${file.name}» загружен`)
        }
      }
      reader.readAsText(file)
    } else if (ext === "pdf" || ext === "docx") {
      setLoading(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const parseRes = await fetch("/api/core/parse-file", { method: "POST", body: fd })
        if (!parseRes.ok) {
          const err = await parseRes.json().catch(() => ({})) as { error?: string }
          throw new Error(err.error || `HTTP ${parseRes.status}`)
        }
        const { text: extracted } = await parseRes.json() as { text: string }
        if (!extracted?.trim()) {
          toast.error("Не удалось извлечь текст из файла")
          return
        }
        setText(prev => prev ? prev + "\n\n" + extracted : extracted)
        toast.success(`Текст из «${file.name}» извлечён`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка"
        toast.error(`Ошибка извлечения текста: ${msg}`)
      } finally {
        setLoading(false)
      }
    } else {
      toast.error("Поддерживаются форматы: PDF, DOCX, TXT")
    }
  }

  const handleSubmit = async () => {
    if (!text.trim()) {
      toast.error("Введите описание вакансии")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/ai/parse-vacancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
      }

      const data = await res.json() as { data: ParsedVacancy }
      onComplete(data.data)
      onOpenChange(false)
      setText("")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка"
      toast.error(`Не удалось распарсить: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Заполнить анкету с AI
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Опишите кого ищете в свободной форме или загрузите файл с описанием должности
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Менеджер по продажам B2B, строительная отрасль, Москва, зарплата 150-250к, опыт от 3 лет, нужен CRM и холодные звонки..."
            className="h-48 bg-[var(--input-bg)] border border-input resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Напишите кратко или вставьте полное описание вакансии / должностные обязанности
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="w-3.5 h-3.5" />
                Загрузить файл
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => handleFile(e.target.files)}
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => onOpenChange(false)}
              >
                Заполнить вручную
              </Button>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={loading || !text.trim()}
              className="gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Анализирую...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Заполнить анкету
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
