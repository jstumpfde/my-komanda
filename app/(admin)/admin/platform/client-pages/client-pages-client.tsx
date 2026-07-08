"use client"

// /admin/platform/client-pages — витрина клиентских страниц.
// Платформенный админ создаёт/редактирует статические HTML-страницы,
// которые отдаются на newsite.company24.pro/<slug>. Пишет напрямую в
// файловую систему сервера через /api/platform/client-pages.

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ExternalLink, Copy, Pencil, Trash2, Plus, Save, X, Globe, RefreshCw,
} from "lucide-react"

interface ClientPage {
  slug: string
  url: string
  size: number
  updatedAt: string
}

// повторяет normalizeSlug из lib/platform/client-pages.ts (для превью адреса)
function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`
  return `${(n / 1024 / 1024).toFixed(1)} МБ`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

type Editor =
  | { mode: "closed" }
  | { mode: "new" }
  | { mode: "edit"; slug: string }

export function ClientPagesClient() {
  const [pages, setPages] = useState<ClientPage[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<Editor>({ mode: "closed" })

  // поля редактора
  const [slug, setSlug] = useState("")
  const [html, setHtml] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/platform/client-pages", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка загрузки")
      setPages(d.pages || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() {
    setSlug("")
    setHtml("")
    setEditor({ mode: "new" })
  }

  async function openEdit(p: ClientPage) {
    setBusy(true)
    try {
      const r = await fetch(`/api/platform/client-pages/${p.slug}`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Не удалось открыть")
      setSlug(p.slug)
      setHtml(d.html || "")
      setEditor({ mode: "edit", slug: p.slug })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setBusy(false)
    }
  }

  function closeEditor() {
    setEditor({ mode: "closed" })
    setSlug("")
    setHtml("")
  }

  async function save() {
    if (editor.mode === "closed") return
    const cleanSlug = editor.mode === "edit" ? editor.slug : slugify(slug)
    if (!cleanSlug) { toast.error("Укажите адрес страницы"); return }
    if (!html.trim()) { toast.error("Вставьте HTML страницы"); return }
    setBusy(true)
    try {
      const isEdit = editor.mode === "edit"
      const r = await fetch(
        isEdit ? `/api/platform/client-pages/${cleanSlug}` : "/api/platform/client-pages",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isEdit ? { html } : { slug: cleanSlug, html }),
        },
      )
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка сохранения")
      toast.success(isEdit ? "Страница обновлена" : "Страница опубликована")
      closeEditor()
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения")
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: ClientPage) {
    if (!confirm(`Удалить страницу /${p.slug}? Ссылка перестанет открываться.`)) return
    try {
      const r = await fetch(`/api/platform/client-pages/${p.slug}`, { method: "DELETE" })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || "Ошибка удаления")
      toast.success(`Страница /${p.slug} удалена`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка удаления")
    }
  }

  function copy(url: string) {
    navigator.clipboard?.writeText(url)
    toast.success("Ссылка скопирована")
  }

  const previewSlug = editor.mode === "new" ? slugify(slug) : editor.mode === "edit" ? editor.slug : ""

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" /> Витрина страниц
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Клиентские страницы и презентации на{" "}
            <span className="font-mono">newsite.company24.pro/&lt;адрес&gt;</span>.
            Вставьте готовый HTML — страница сразу доступна по ссылке.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Обновить">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {editor.mode === "closed" && (
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Новая страница</Button>
          )}
        </div>
      </div>

      {editor.mode !== "closed" && (
        <Card className="p-4 space-y-3 border-primary/40">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {editor.mode === "new" ? "Новая страница" : `Редактирование /${editor.slug}`}
            </h2>
            <Button variant="ghost" size="icon" onClick={closeEditor}><X className="h-4 w-4" /></Button>
          </div>

          {editor.mode === "new" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Адрес страницы</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-mono">newsite.company24.pro/</span>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="biglife"
                  className="max-w-xs font-mono"
                />
              </div>
              {previewSlug && (
                <p className="text-xs text-muted-foreground">
                  Ссылка: <span className="font-mono">https://newsite.company24.pro/{previewSlug}</span>
                </p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">HTML страницы</label>
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="Вставьте сюда готовый HTML-код страницы…"
              className="font-mono text-xs h-80"
            />
            <p className="text-xs text-muted-foreground">
              {Math.round(new Blob([html]).size / 1024) || 0} КБ · максимум 5 МБ
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              <Save className="h-4 w-4 mr-1" />
              {editor.mode === "new" ? "Опубликовать" : "Сохранить"}
            </Button>
            <Button variant="outline" onClick={closeEditor} disabled={busy}>Отмена</Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {loading && pages.length === 0 && (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        )}
        {!loading && pages.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            Пока нет ни одной страницы. Нажмите «Новая страница».
          </Card>
        )}
        {pages.map((p) => (
          <Card key={p.slug} className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium truncate">/{p.slug}</span>
                <Badge variant="secondary" className="text-xs">{fmtSize(p.size)}</Badge>
              </div>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline font-mono break-all"
              >
                {p.url}
              </a>
              <p className="text-xs text-muted-foreground mt-0.5">Обновлено {fmtDate(p.updatedAt)}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" title="Открыть" asChild>
                <a href={p.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
              </Button>
              <Button variant="ghost" size="icon" title="Скопировать ссылку" onClick={() => copy(p.url)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Редактировать" onClick={() => openEdit(p)} disabled={busy}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Удалить" onClick={() => remove(p)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
