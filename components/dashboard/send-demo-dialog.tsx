"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Copy, Check, Send, MessageCircle, Mail, Phone } from "lucide-react"
import { toast } from "sonner"

interface SendDemoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidateName: string
  token: string
  position?: string
}

export function SendDemoDialog({ open, onOpenChange, candidateName, token, position }: SendDemoDialogProps) {
  const [copied, setCopied] = useState(false)
  const link = `/candidate/${token}`
  const fullLink = typeof window !== "undefined" ? `${window.location.origin}${link}` : link

  const message = `Здравствуйте, ${candidateName}!\n\nПриглашаем вас пройти демонстрацию должности${position ? ` «${position}»` : ""}.\n\nПерейдите по ссылке:\n${fullLink}\n\nЗаймёт ~15 минут. Узнаете о компании, роли и доходе.`

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success("Скопировано")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>📤 Отправить демонстрацию</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Кандидат</p>
            <p className="font-medium text-sm">{candidateName}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1">Ссылка</p>
            <div className="flex items-center gap-2">
              <Input value={fullLink} readOnly className="text-xs font-mono" />
              <Button variant="outline" size="icon" className="shrink-0" onClick={() => handleCopy(fullLink)}>
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1">Текст сообщения</p>
            <Textarea value={message} readOnly className="text-xs h-32 resize-none" />
            <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => handleCopy(message)}>
              <Copy className="w-3 h-3 mr-1" /> Скопировать текст
            </Button>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-3">Отправить через:</p>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => { toast.success("SMS отправлено (заглушка)"); onOpenChange(false) }}>
                <Phone className="w-4 h-4" />
                <span className="text-xs">SMS</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => { toast.success("Email отправлен (заглушка)"); onOpenChange(false) }}>
                <Mail className="w-4 h-4" />
                <span className="text-xs">Email</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => { toast.success("Сообщение в Telegram отправлено (заглушка)"); onOpenChange(false) }}>
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs">Telegram</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
