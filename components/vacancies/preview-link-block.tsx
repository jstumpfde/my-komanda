"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ExternalLink, Copy, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  vacancyId: string | null
}

export function PreviewLinkBlock({ vacancyId }: Props) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/modules/hr/vacancies/${vacancyId}/preview-link`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        const path = json?.data?.url || json?.url
        if (path) {
          const origin = typeof window !== "undefined" ? window.location.origin : ""
          const sep = path.includes("?") ? "&" : "?"
          setUrl(`${origin}${path}${sep}as=hr`)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [vacancyId])

  const handleOpen = () => {
    if (!url) { toast.error("Ссылка не готова"); return }
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleCopy = async () => {
    if (!url) { toast.error("Ссылка не готова"); return }
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Ссылка скопирована")
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-foreground">Боевая ссылка</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Так увидит кандидат. В режиме директора ответы не сохраняются.
      </p>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={loading ? "Загрузка..." : url}
          onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
          className="h-9 text-xs font-mono"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs shrink-0"
          onClick={handleOpen}
          disabled={!url || loading}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          Открыть
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs shrink-0"
          onClick={handleCopy}
          disabled={!url || loading}
        >
          <Copy className="w-3.5 h-3.5" />
          Копировать
        </Button>
      </div>
    </div>
  )
}
