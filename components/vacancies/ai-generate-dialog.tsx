"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { Upload, FileText, Mic, MicOff, Sparkles, Loader2, Check, FileUp, Pencil, X } from "lucide-react"
import { toast } from "sonner"
import type { Lesson } from "@/lib/course-types"
import { createBlock } from "@/lib/course-types"

interface AiGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (lessons: Lesson[]) => void
}

function mkLesson(id: string, emoji: string, title: string, content: string): Lesson {
  return { id, emoji, title, blocks: [{ ...createBlock("text"), id: `${id}-b`, content }] }
}

function generateFromText(text: string): Lesson[] {
  const ts = Date.now()
  return [
    mkLesson(`ai-${ts}-1`, "👋", "Приветствие", `Здравствуйте!\n\n${text.slice(0, 100)}...`),
    mkLesson(`ai-${ts}-2`, "🏢", "О компании", text.slice(0, 300) || "Информация о компании из загруженного документа."),
    mkLesson(`ai-${ts}-3`, "👤", "Ваша роль", "Обязанности и задачи на позиции, извлечённые из описания."),
    mkLesson(`ai-${ts}-4`, "💵", "Доход и условия", "Система оплаты и условия работы."),
    mkLesson(`ai-${ts}-5`, "📈", "Рост и карьера", "Возможности карьерного роста в компании."),
    mkLesson(`ai-${ts}-6`, "🚀", "Адаптация", "Как проходят первые 30 дней."),
    { id: `ai-${ts}-7`, emoji: "✅", title: "Задания", blocks: [{
      ...createBlock("task"), id: `ai-${ts}-7-b`,
      taskDescription: "Ответьте на вопросы:",
      questions: [
        { id: `q-${ts}-1`, text: "Расскажите о вашем опыте", answerType: "text" as const, options: [] },
        { id: `q-${ts}-2`, text: "Почему вас заинтересовала эта позиция?", answerType: "text" as const, options: [] },
      ],
    }] },
    mkLesson(`ai-${ts}-8`, "➡️", "Что дальше", "Спасибо за прохождение! Мы свяжемся с вами."),
  ]
}

function generateFromForm(data: { company: string; about: string; position: string; salaryFrom: string; salaryTo: string; city: string; schedule: string; benefits: string }): Lesson[] {
  const ts = Date.now()
  return [
    mkLesson(`ai-${ts}-1`, "👋", "Приветствие", `Здравствуйте!\n\nМы рады, что вы рассматриваете позицию «${data.position}» в ${data.company}.`),
    mkLesson(`ai-${ts}-2`, "🏢", "О компании", `${data.company}\n\n${data.about}`),
    mkLesson(`ai-${ts}-3`, "👤", "Ваша роль", `На позиции «${data.position}» вы будете заниматься ключевыми задачами компании.`),
    mkLesson(`ai-${ts}-4`, "💵", "Доход", `💰 Зарплата: ${data.salaryFrom} – ${data.salaryTo} ₽\n\n${data.benefits}`),
    mkLesson(`ai-${ts}-5`, "📍", "Условия работы", `📍 ${data.city}\n⏰ ${data.schedule}`),
    mkLesson(`ai-${ts}-6`, "📈", "Рост и карьера", "Мы поддерживаем развитие сотрудников через обучение и менторство."),
    mkLesson(`ai-${ts}-7`, "🚀", "Адаптация", "Первые 30 дней: наставник, обучение, постепенное включение."),
    { id: `ai-${ts}-8`, emoji: "✅", title: "Задания", blocks: [{
      ...createBlock("task"), id: `ai-${ts}-8-b`,
      taskDescription: "Ответьте на вопросы:",
      questions: [
        { id: `q-${ts}-1`, text: "Расскажите о вашем опыте", answerType: "text" as const, options: [] },
        { id: `q-${ts}-2`, text: "Почему вас заинтересовала эта позиция?", answerType: "text" as const, options: [] },
      ],
    }] },
    mkLesson(`ai-${ts}-9`, "➡️", "Что дальше", "Спасибо! Мы свяжемся с вами в ближайшее время."),
  ]
}

type Phase = "input" | "generating" | "preview"

export function AiGenerateDialog({ open, onOpenChange, onApply }: AiGenerateDialogProps) {
  const [phase, setPhase] = useState<Phase>("input")
  const [progress, setProgress] = useState("")
  const [generatedLessons, setGeneratedLessons] = useState<Lesson[]>([])

  // Tab 1: File
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [fileText, setFileText] = useState("")

  // Tab 2: Text/voice
  const [freeText, setFreeText] = useState("")
  const [recording, setRecording] = useState(false)

  // Tab 3: Form
  const [form, setForm] = useState({ company: "", about: "", position: "", salaryFrom: "", salaryTo: "", city: "", schedule: "", benefits: "" })

  const reset = () => {
    setPhase("input")
    setProgress("")
    setGeneratedLessons([])
    setFileName("")
    setFileText("")
    setFreeText("")
    setForm({ company: "", about: "", position: "", salaryFrom: "", salaryTo: "", city: "", schedule: "", benefits: "" })
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const simulateGeneration = (sourceText: string, fromForm?: typeof form) => {
    setPhase("generating")
    const steps = ["Анализирую данные...", "Создаю структуру уроков...", "Генерирую контент...", "Готово!"]
    let i = 0
    setProgress(steps[0])
    const interval = setInterval(() => {
      i++
      if (i < steps.length) {
        setProgress(steps[i])
      } else {
        clearInterval(interval)
        const lessons = fromForm ? generateFromForm(fromForm) : generateFromText(sourceText)
        setGeneratedLessons(lessons)
        setPhase("preview")
      }
    }, 800)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      reader.onload = () => setFileText(reader.result as string)
      reader.readAsText(file)
    } else {
      // For .docx/.pdf — simulate text extraction
      setFileText(`[Извлечённый текст из ${file.name}]\n\nСодержимое документа будет проанализировано AI для создания демонстрации должности.`)
    }
  }

  const toggleRecording = () => {
    if (recording) {
      setRecording(false)
      setFreeText((prev) => prev + "\n[Голосовая запись расшифрована]")
      toast.success("Запись остановлена")
    } else {
      setRecording(true)
      toast("Запись начата... (демо)")
    }
  }

  // PREVIEW phase
  if (phase === "preview") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-success" />
              Демонстрация сгенерирована — {generatedLessons.length} уроков
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-1.5">
              {generatedLessons.map((lesson, i) => (
                <div key={lesson.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40">
                  <span className="text-muted-foreground text-xs font-mono w-5">{i + 1}.</span>
                  <span className="text-base">{lesson.emoji}</span>
                  <span className="text-sm font-medium flex-1">{lesson.title}</span>
                  <Badge variant="secondary" className="text-[10px]">{lesson.blocks.length} блок</Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <Button variant="ghost" size="sm" onClick={reset}>Отмена</Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { onApply(generatedLessons); reset() }} className="gap-1.5">
                <Pencil className="w-3.5 h-3.5" />Редактировать
              </Button>
              <Button size="sm" onClick={() => { onApply(generatedLessons); reset() }} className="gap-1.5">
                <Check className="w-3.5 h-3.5" />Принять всё
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // GENERATING phase
  if (phase === "generating") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm font-medium text-foreground">{progress}</p>
            <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // INPUT phase
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" />Создать с помощью AI</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="file" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="file" className="flex-1 gap-1.5 text-xs"><FileUp className="w-3.5 h-3.5" />Загрузить документ</TabsTrigger>
            <TabsTrigger value="text" className="flex-1 gap-1.5 text-xs"><Pencil className="w-3.5 h-3.5" />Описать текстом</TabsTrigger>
            <TabsTrigger value="form" className="flex-1 gap-1.5 text-xs"><FileText className="w-3.5 h-3.5" />Заполнить анкету</TabsTrigger>
          </TabsList>

          {/* Tab 1: File upload */}
          <TabsContent value="file" className="space-y-4 mt-4">
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/40 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFileName(f.name); setFileText(`[Текст из ${f.name}]`) } }}
            >
              <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              {fileName ? (
                <div>
                  <p className="text-sm font-medium text-foreground">{fileName}</p>
                  <p className="text-xs text-muted-foreground mt-1">Файл загружен</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-foreground">Перетащите DOCX или PDF</p>
                  <p className="text-xs text-muted-foreground mt-1">или нажмите чтобы выбрать файл</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".docx,.pdf,.txt,.md" className="hidden" onChange={handleFileChange} />
            </div>
            <p className="text-[11px] text-muted-foreground">Поддерживаемые форматы: .docx, .pdf, .txt</p>
            <Button className="w-full gap-1.5" disabled={!fileName} onClick={() => simulateGeneration(fileText)}>
              <Sparkles className="w-4 h-4" />Сгенерировать демонстрацию
            </Button>
          </TabsContent>

          {/* Tab 2: Text/voice */}
          <TabsContent value="text" className="space-y-4 mt-4">
            <Textarea
              rows={6}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Опишите компанию, должность и что важно рассказать кандидату..."
            />
            <div className="flex gap-2">
              <Button variant="outline" className="gap-1.5" onClick={toggleRecording}>
                {recording ? <><MicOff className="w-4 h-4 text-destructive" />Остановить</> : <><Mic className="w-4 h-4" />Надиктовать</>}
              </Button>
              <Button className="flex-1 gap-1.5" disabled={!freeText.trim()} onClick={() => simulateGeneration(freeText)}>
                <Sparkles className="w-4 h-4" />Сгенерировать демонстрацию
              </Button>
            </div>
          </TabsContent>

          {/* Tab 3: Form */}
          <TabsContent value="form" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label className="text-xs">Компания</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="ООО «Компания»" /></div>
              <div className="grid gap-1"><Label className="text-xs">Должность</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Менеджер по продажам" /></div>
            </div>
            <div className="grid gap-1"><Label className="text-xs">Чем занимается компания</Label><Textarea value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} rows={2} placeholder="Продукт, рынок, клиенты..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label className="text-xs">Зарплата от, ₽</Label><Input value={form.salaryFrom} onChange={(e) => setForm({ ...form, salaryFrom: e.target.value })} placeholder="80 000" /></div>
              <div className="grid gap-1"><Label className="text-xs">Зарплата до, ₽</Label><Input value={form.salaryTo} onChange={(e) => setForm({ ...form, salaryTo: e.target.value })} placeholder="150 000" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label className="text-xs">Город</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Москва" /></div>
              <div className="grid gap-1"><Label className="text-xs">График</Label><Input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Пн-Пт, 9:00-18:00" /></div>
            </div>
            <div className="grid gap-1"><Label className="text-xs">Главные преимущества</Label><Textarea value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} rows={2} placeholder="ДМС, обучение, бонусы..." /></div>
            <Button className="w-full gap-1.5" disabled={!form.company.trim() || !form.position.trim()} onClick={() => simulateGeneration("", form)}>
              <Sparkles className="w-4 h-4" />Сгенерировать демонстрацию
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
