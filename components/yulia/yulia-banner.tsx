"use client"

// Группа 28: баннер «Помощник Юлия» поверх wizard'а создания вакансии.
// При клике «Начать диалог» открывает Dialog c YuliaChatWidget.
// После успешного создания черновика — редирект на /hr/vacancies/[id].

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"

import { YuliaChatWidget } from "./yulia-chat-widget"

export function YuliaBanner({ onSkip }: { onSkip?: () => void }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleCreated = (vacancyId: string) => {
    setOpen(false)
    router.push(`/hr/vacancies/${vacancyId}/edit`)
  }

  return (
    <>
      <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 sm:p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold mb-0.5">Юлия — AI-помощник</div>
            <div className="text-xs text-muted-foreground">
              Хочешь создать вакансию через диалог? Юлия задаст 5–7 вопросов и сделает черновик.
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
            <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" />
              Начать диалог
            </Button>
            {onSkip && (
              <Button size="sm" variant="outline" onClick={onSkip}>
                Заполнить вручную
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">Чат с Юлей — AI-помощником HR</DialogTitle>
          <YuliaChatWidget
            onCreated={handleCreated}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
