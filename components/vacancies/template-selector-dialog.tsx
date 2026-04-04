"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { DEMO_TEMPLATES, type DemoTemplate } from "@/lib/templates/demo-templates"
import { BookOpen, FileText, Layers } from "lucide-react"

interface TemplateSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (template: DemoTemplate) => void
}

export function TemplateSelectorDialog({ open, onOpenChange, onSelect }: TemplateSelectorDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = DEMO_TEMPLATES.find(t => t.id === selectedId)

  const handleSelect = () => {
    if (selected) {
      onSelect(selected)
      onOpenChange(false)
      setSelectedId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="w-5 h-5" />
            Выбрать шаблон демонстрации
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Выберите готовый шаблон — блоки будут добавлены в редактор. Переменные в тексте подставятся автоматически.
          </p>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Template list */}
          <div className="w-[280px] border-r flex-shrink-0">
            <ScrollArea className="h-full max-h-[60vh]">
              <div className="p-3 space-y-2">
                {DEMO_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedId(tpl.id)}
                    className={cn(
                      "w-full text-left rounded-lg border p-3 transition-colors",
                      selectedId === tpl.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{tpl.emoji}</span>
                      <span className="text-sm font-medium">{tpl.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{tpl.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Layers className="w-3 h-3" />{tpl.lessonsCount} уроков
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <FileText className="w-3 h-3" />{tpl.blocksCount} блоков
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Preview */}
          <div className="flex-1 min-w-0">
            <ScrollArea className="h-full max-h-[60vh]">
              {selected ? (
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl">{selected.emoji}</span>
                    <div>
                      <h3 className="text-base font-semibold">{selected.title}</h3>
                      <p className="text-xs text-muted-foreground">{selected.lessonsCount} уроков</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {selected.lessons.map((lesson, i) => (
                      <div key={lesson.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                        <span className="text-lg flex-shrink-0">{lesson.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{i + 1}. {lesson.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {lesson.blocks[0]?.content
                              ? stripHtml(lesson.blocks[0].content).slice(0, 120) + (lesson.blocks[0].content.length > 120 ? "…" : "")
                              : lesson.blocks[0]?.type === "task" ? "Задание с вопросами" : ""}
                          </p>
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {lesson.blocks.map(b => (
                              <Badge key={b.id} variant="outline" className="text-[9px] px-1.5 py-0">
                                {b.type === "text" ? "Текст" : b.type === "info" ? "Инфо" : b.type === "task" ? "Задание" : b.type === "image" ? "Фото" : b.type === "video" ? "Видео" : b.type}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground/40 text-sm">
                  Выберите шаблон для просмотра
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button size="sm" disabled={!selected} onClick={handleSelect}>
            Применить шаблон
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\n+/g, " ").trim()
}
