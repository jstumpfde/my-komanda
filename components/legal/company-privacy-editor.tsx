"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save, Wand2, ExternalLink } from "lucide-react"

interface PrivacyState {
  html:      string | null
  updatedAt: string | null
  subdomain: string | null
}

export function CompanyPrivacyEditor() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [html, setHtml] = useState("")
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [subdomain, setSubdomain] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/companies/privacy-policy")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<PrivacyState>
      })
      .then((data) => {
        if (cancelled) return
        setHtml(data.html ?? "")
        setUpdatedAt(data.updatedAt)
        setSubdomain(data.subdomain)
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/companies/privacy-policy", { method: "POST" })
      const data = await res.json().catch(() => ({})) as { html?: string; error?: string }
      if (!res.ok) {
        toast.error(data.error || "Не удалось сгенерировать шаблон")
        return
      }
      setHtml(data.html ?? "")
      toast.success("Шаблон сгенерирован — проверьте и сохраните")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!html.trim()) {
      toast.error("Текст политики не может быть пустым")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/companies/privacy-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      })
      const data = await res.json().catch(() => ({})) as { updatedAt?: string; error?: string }
      if (!res.ok) {
        toast.error(data.error || "Не удалось сохранить")
        return
      }
      setUpdatedAt(data.updatedAt ?? new Date().toISOString())
      toast.success("Политика сохранена")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  const publicUrl = subdomain ? `/politicahr2026?company=${encodeURIComponent(subdomain)}` : "/politicahr2026"

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
      </div>
    )
  }
  if (error) return <div className="text-sm text-red-600">Не удалось загрузить: {error}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {updatedAt
            ? `Обновлена: ${new Date(updatedAt).toLocaleString("ru-RU")}`
            : "Используется дефолтный шаблон, ничего не сохранено"}
        </div>
        <Link
          href={publicUrl}
          target="_blank"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          Открыть публичную страницу <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <Textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        placeholder="<h1>Политика конфиденциальности</h1>..."
        className="min-h-[420px] font-mono text-xs"
      />

      <p className="text-xs text-muted-foreground">
        Поле принимает HTML. Используйте теги &lt;h1&gt;/&lt;h2&gt;/&lt;p&gt;/&lt;ul&gt;/&lt;a&gt;.
        Для генерации стартового варианта по реквизитам компании нажмите «Сгенерировать шаблон».
      </p>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button variant="outline" onClick={handleGenerate} disabled={generating || saving}>
          {generating
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Wand2 className="w-4 h-4 mr-2" />}
          Сгенерировать шаблон по умолчанию
        </Button>
        <Button onClick={handleSave} disabled={saving || generating}>
          {saving
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Save className="w-4 h-4 mr-2" />}
          Сохранить
        </Button>
      </div>
    </div>
  )
}
