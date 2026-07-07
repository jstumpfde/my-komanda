"use client"

// Шеринг-блок страницы результата: «Ссылка» (копировать + navigator.share),
// «Карточка-формула», «3 сильные стороны» — открывают
// /api/public/tip/card/[token] в выбранном формате (сторис/квадрат).

import { useState } from "react"
import { toast } from "sonner"
import { Share2, ImageIcon, Sparkles, Smartphone, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type CardKind = "formula" | "strengths"
type CardFormat = "story" | "square"

export function ShareButtons({
  token,
  hasStrengths,
}: {
  token: string
  hasStrengths: boolean
}) {
  const [busyKind, setBusyKind] = useState<CardKind | null>(null)

  async function handleShareLink() {
    const url = typeof window !== "undefined" ? window.location.href : ""
    const shareData = {
      title: "Мой разбор — Типология",
      text: "Посмотрите мой персональный разбор личности",
      url,
    }
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData)
        return
      }
    } catch {
      // пользователь отменил шеринг или API недоступно — фолбэк на копирование
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Ссылка скопирована")
    } catch {
      toast.error("Не удалось скопировать ссылку")
    }
  }

  function openCard(kind: CardKind, format: CardFormat) {
    setBusyKind(kind)
    const url = `/api/public/tip/card/${token}?kind=${kind}&format=${format}`
    window.open(url, "_blank", "noopener,noreferrer")
    setTimeout(() => setBusyKind(null), 600)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button onClick={handleShareLink} variant="outline" className="flex-1 gap-2">
        <Share2 className="h-4 w-4" /> Ссылка
      </Button>

      <CardMenu
        label="Карточка-формула"
        icon={<ImageIcon className="h-4 w-4" />}
        busy={busyKind === "formula"}
        onPick={(format) => openCard("formula", format)}
      />

      {hasStrengths && (
        <CardMenu
          label="3 сильные стороны"
          icon={<Sparkles className="h-4 w-4" />}
          busy={busyKind === "strengths"}
          onPick={(format) => openCard("strengths", format)}
        />
      )}
    </div>
  )
}

function CardMenu({
  label,
  icon,
  busy,
  onPick,
}: {
  label: string
  icon: React.ReactNode
  busy: boolean
  onPick: (format: CardFormat) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex-1 gap-2" disabled={busy}>
          {icon} {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuItem onClick={() => onPick("story")} className="gap-2">
          <Smartphone className="h-4 w-4" /> Сторис (1080×1920)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("square")} className="gap-2">
          <Square className="h-4 w-4" /> Квадрат (1080×1080)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
