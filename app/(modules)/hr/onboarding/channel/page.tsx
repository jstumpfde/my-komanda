"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Copy, ArrowRight, Check } from "lucide-react"

// ─── Method cards config ──────────────────────────────────────────────────────

interface ChannelMethod {
  id: string
  emoji: string
  title: string
  subtitle: string
  duration: string
  highlighted: boolean
  action: "navigate" | "modal"
  target?: string
}

const CHANNEL_METHODS: ChannelMethod[] = [
  {
    id: "form",
    emoji: "📝",
    title: "Анкета на сайте",
    subtitle: "Пошаговая форма — удобно и быстро",
    duration: "~5–7 мин",
    highlighted: true,
    action: "navigate",
    target: "/vacancies/create",
  },
  {
    id: "voice",
    emoji: "🎙️",
    title: "Голосом",
    subtitle: "Расскажите, мы разберём и зададим уточняющие вопросы",
    duration: "~3 мин",
    highlighted: false,
    action: "navigate",
    target: "/onboarding/voice",
  },
  {
    id: "telegram",
    emoji: "💬",
    title: "Бот в Telegram",
    subtitle: "Вопросы в мессенджере — в удобное время",
    duration: "~5 мин",
    highlighted: false,
    action: "modal",
  },
  {
    id: "links",
    emoji: "📎",
    title: "Скиньте ссылки",
    subtitle: "Вставьте ИНН, сайт, соцсети — мы всё разберём",
    duration: "~2 мин",
    highlighted: true,
    action: "navigate",
    target: "/onboarding/smart-input",
  },
  {
    id: "auto",
    emoji: "🤖",
    title: "Помогите мне",
    subtitle: "Мы найдём данные о компании сами",
    duration: "~2 мин",
    highlighted: true,
    action: "navigate",
    target: "/onboarding/smart-input",
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingScreenClient() {
  const router = useRouter()
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const BOT_LINK = "t.me/myteam_bot"
  const BOT_FULL_URL = "https://t.me/myteam_bot"

  const handleMethodClick = (method: ChannelMethod) => {
    if (method.action === "navigate" && method.target) {
      router.push(method.target)
    } else if (method.action === "modal") {
      setTelegramDialogOpen(true)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(BOT_FULL_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ── */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              М
            </div>
            <span className="text-lg font-bold text-foreground">Company24</span>
          </div>

          {/* Skip */}
          <button
            type="button"
            onClick={() => router.push("/vacancies/create")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            пропустить
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex items-center justify-center p-4 py-10">
        <div className="max-w-2xl w-full space-y-8">

          {/* Header */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Как вам удобнее заполнить информацию?
            </h1>
            <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed">
              Начните в любом канале — продолжить можно в другом.
              Всё, что вы заполнили, сохраняется.
            </p>
          </div>

          {/* Method cards */}
          <div className="grid grid-cols-1 gap-3">
            {CHANNEL_METHODS.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => handleMethodClick(method)}
                className={cn(
                  "w-full text-left transition-all duration-200 group",
                  "rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                )}
              >
                <Card
                  className={cn(
                    "border-2 transition-all duration-200 hover:shadow-md",
                    method.highlighted
                      ? "border-primary/40 bg-primary/[0.02] hover:border-primary hover:bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Emoji icon */}
                      <div
                        className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0",
                          method.highlighted
                            ? "bg-primary/10"
                            : "bg-muted/60"
                        )}
                      >
                        {method.emoji}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">
                            {method.title}
                          </span>
                          {method.highlighted && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              Рекомендуем
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                          {method.subtitle}
                        </p>
                      </div>

                      {/* Duration + arrow */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-md">
                          {method.duration}
                        </span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          {/* Bottom note */}
          <p className="text-center text-xs text-muted-foreground">
            Данные из любого канала объединяются — можно переключаться
          </p>
        </div>
      </div>

      {/* ── Telegram modal ── */}
      <Dialog open={telegramDialogOpen} onOpenChange={setTelegramDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="text-xl">💬</span>
              Бот в Telegram
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            {/* QR placeholder */}
            <div className="flex justify-center">
              <div className="w-36 h-36 rounded-xl bg-muted/60 border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground">
                <div className="grid grid-cols-3 gap-1 mb-1">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-3 h-3 rounded-sm",
                        [0, 2, 4, 6, 8].includes(i) ? "bg-foreground/70" : "bg-transparent"
                      )}
                    />
                  ))}
                </div>
                <span className="text-[10px]">QR-код</span>
              </div>
            </div>

            {/* Link */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border">
              <span className="flex-1 text-sm font-mono text-foreground truncate">
                {BOT_LINK}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0 gap-1.5"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <><Check className="w-3.5 h-3.5 text-emerald-500" /> Скопировано</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> Скопировать ссылку</>
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Откройте Telegram, найдите бота и ответьте на несколько вопросов.
              Данные автоматически сохранятся в вашем аккаунте.
            </p>

            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={() => {
                  window.open(BOT_FULL_URL, "_blank")
                }}
              >
                Открыть в Telegram
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setTelegramDialogOpen(false)
                  router.push("/vacancies/create")
                }}
              >
                Продолжить на сайте
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
