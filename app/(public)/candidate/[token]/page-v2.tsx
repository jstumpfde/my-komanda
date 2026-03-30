"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle2, ChevronRight, Loader2, Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"

interface Block {
  id: string
  type: "text" | "video" | "question" | "task"
  content: string
  question?: string
  options?: string[]
}

interface DemoData {
  candidate: { id: string; name: string; stage: string; demoProgressJson: unknown }
  vacancy: { title: string }
  demo: { id: string; title: string; lessonsJson: Block[] } | null
}

export default function CandidateDemoPageV2() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<DemoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentBlock, setCurrentBlock] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/public/demo-v2?token=${token}`)
      .then((r) => r.json())
      .then((d: DemoData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const blocks: Block[] = data?.demo?.lessonsJson ?? []

  const handleNext = async () => {
    if (currentBlock < blocks.length - 1) {
      setCurrentBlock(currentBlock + 1)
    } else {
      // Завершение
      setSaving(true)
      await fetch("/api/public/demo-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          progress: { completed: true, answers, completedAt: new Date().toISOString() },
        }),
      })
      setSaving(false)
      setDone(true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Ссылка недействительна</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-6">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
          <h2 className="text-2xl font-bold">Готово!</h2>
          <p className="text-muted-foreground max-w-sm">
            Вы успешно прошли демо-задание по вакансии «{data.vacancy.title}».
            Мы рассмотрим ваши ответы и свяжемся с вами.
          </p>
        </div>
      </div>
    )
  }

  if (!data.demo || blocks.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3 p-6">
          <Briefcase className="w-12 h-12 text-muted-foreground/40 mx-auto" />
          <h2 className="text-xl font-semibold">Демо-задание ещё готовится</h2>
          <p className="text-muted-foreground text-sm">
            Работодатель пришлёт вам ссылку, когда задание будет готово.
          </p>
        </div>
      </div>
    )
  }

  const block = blocks[currentBlock]
  const progress = Math.round(((currentBlock + 1) / blocks.length) * 100)

  return (
    <div className="min-h-screen bg-background">
      {/* Шапка */}
      <header className="border-b bg-card px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{data.vacancy.title}</p>
            <p className="text-xs text-muted-foreground/60">{data.demo.title}</p>
          </div>
          <span className="text-sm text-muted-foreground">
            {currentBlock + 1} / {blocks.length}
          </span>
        </div>
      </header>

      {/* Прогресс-бар */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Контент блока */}
      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="space-y-6">
          {block.type === "text" && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-base leading-relaxed whitespace-pre-wrap">{block.content}</p>
            </div>
          )}

          {block.type === "video" && block.content && (
            <div className="space-y-3">
              <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                <iframe
                  src={getEmbedUrl(block.content)}
                  className="w-full h-full"
                  allowFullScreen
                  title="Видео"
                />
              </div>
            </div>
          )}

          {block.type === "question" && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">{block.question}</h3>
              {block.options && block.options.filter(Boolean).length > 0 ? (
                <div className="space-y-2">
                  {block.options.filter(Boolean).map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setAnswers((a) => ({ ...a, [block.id]: opt }))}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors",
                        answers[block.id] === opt
                          ? "border-primary bg-primary/5 text-primary"
                          : "hover:border-primary/40 hover:bg-muted/50",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <Textarea
                  placeholder="Ваш ответ..."
                  value={answers[block.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [block.id]: e.target.value }))}
                  rows={4}
                />
              )}
            </div>
          )}

          {block.type === "task" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 border p-4">
                <p className="text-sm font-medium mb-1">Задание</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{block.content}</p>
              </div>
              <Textarea
                placeholder="Ваш ответ на задание..."
                value={answers[block.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [block.id]: e.target.value }))}
                rows={5}
              />
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button onClick={handleNext} disabled={saving} size="lg">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {currentBlock < blocks.length - 1 ? (
                <>
                  Далее
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              ) : "Завершить"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function getEmbedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  return url
}
