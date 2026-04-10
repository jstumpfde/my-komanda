"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Save, Send, X, Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AiAssistantWidget } from "@/components/knowledge/ai-assistant-widget"
import { cn } from "@/lib/utils"

interface Category {
  id: string
  name: string
}

export default function ArticleCreatePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Загрузка...</div>}>
      <ArticleCreateContent />
    </Suspense>
  )
}

function ArticleCreateContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const articleId = searchParams.get("id")

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [categoryId, setCategoryId] = useState<string>("")
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [audience, setAudience] = useState<string[]>(["employees"])
  const toggleAudience = (key: string) => {
    setAudience((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }
  const [reviewCycle, setReviewCycle] = useState<string>("none")
  const [validUntil, setValidUntil] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!articleId)
  const editorRef = useRef<HTMLDivElement>(null)

  // Load existing article
  useEffect(() => {
    if (!articleId) return
    fetch(`/api/modules/knowledge/articles/${articleId}`)
      .then((r) => r.json())
      .then((data) => {
        const article = data.data ?? data
        if (article.error) {
          toast.error(article.error)
          setLoading(false)
          return
        }
        setTitle(article.title || "")
        setContent(article.content || "")
        setCategoryId(article.categoryId || "")
        setTags(Array.isArray(article.tags) ? article.tags : [])
        if (Array.isArray(article.audience) && article.audience.length > 0) {
          setAudience(article.audience)
        }
        if (typeof article.reviewCycle === "string") setReviewCycle(article.reviewCycle)
        if (article.validUntil) {
          const d = new Date(article.validUntil)
          if (!isNaN(d.getTime())) setValidUntil(d.toISOString().slice(0, 10))
        }
        setLoading(false)
      })
      .catch(() => {
        toast.error("Ошибка загрузки статьи")
        setLoading(false)
      })
  }, [articleId])

  // Load categories — endpoint may not exist, fall back silently
  useEffect(() => {
    fetch("/api/modules/knowledge/categories")
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((data) => {
        const list = data.data ?? data.categories ?? data ?? []
        if (Array.isArray(list)) setCategories(list)
      })
      .catch(() => { /* categories are optional */ })
  }, [])

  const handleContentInput = useCallback(() => {
    if (editorRef.current) setContent(editorRef.current.innerHTML)
  }, [])

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if (tags.includes(t)) { setTagInput(""); return }
    setTags((prev) => [...prev, t])
    setTagInput("")
  }
  const handleRemoveTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t))

  const save = async (status: "draft" | "published") => {
    const name = title.trim()
    if (name.length < 3) {
      toast.error("Заголовок: минимум 3 символа")
      return
    }
    setSaving(true)
    try {
      const isUpdate = !!articleId
      const res = await fetch(
        isUpdate ? `/api/modules/knowledge/articles/${articleId}` : "/api/modules/knowledge/articles",
        {
          method: isUpdate ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: name,
            content,
            categoryId: categoryId || null,
            tags,
            audience,
            reviewCycle,
            validUntil: validUntil || null,
            status,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Ошибка сохранения")
        setSaving(false)
        return
      }
      toast.success(status === "published" ? "Опубликовано" : "Черновик сохранён")
      router.push("/knowledge-v2")
    } catch {
      toast.error("Ошибка сети")
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-3xl mx-auto space-y-5">
              {/* Top bar */}
              <div className="flex items-center justify-between">
                <Link href="/knowledge-v2">
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <ChevronLeft className="w-4 h-4" />Назад
                  </Button>
                </Link>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Сохранить
                  </Button>
                  <Button size="sm" onClick={() => save("published")} disabled={saving} className="gap-1.5">
                    <Send className="w-3.5 h-3.5" />Опубликовать
                  </Button>
                </div>
              </div>

              {/* Title */}
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
                placeholder="Заголовок статьи"
                className="text-2xl font-bold border-none shadow-none px-0 h-auto bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              />

              {/* Category */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Категория</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="h-10 w-full px-3 rounded-md border border-border bg-[var(--input-bg)] text-sm"
                >
                  <option value="">Без категории</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Теги</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-muted text-xs font-medium">
                      {t}
                      <button type="button" onClick={() => handleRemoveTag(t)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleAddTag() }
                    }}
                    placeholder="Добавить тег и нажать Enter"
                    className="h-10 bg-[var(--input-bg)]"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddTag} className="h-10 px-3">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Audience */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 block">Аудитория</label>
                <p className="text-xs text-muted-foreground mb-2">Где будет виден материал</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "employees",  emoji: "👥", label: "Сотрудники" },
                    { key: "candidates", emoji: "👋", label: "Кандидаты" },
                    { key: "clients",    emoji: "🤝", label: "Клиенты" },
                  ].map((a) => {
                    const active = audience.includes(a.key)
                    return (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => toggleAudience(a.key)}
                        className={cn(
                          "h-9 px-4 rounded-full text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap",
                          active
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-background border border-border text-foreground hover:border-primary/50",
                        )}
                      >
                        {a.emoji} {a.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Review schedule */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Актуальность</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Проверять каждые</label>
                    <select
                      value={reviewCycle}
                      onChange={(e) => setReviewCycle(e.target.value)}
                      className="h-10 w-full px-3 rounded-md border border-border bg-[var(--input-bg)] text-sm"
                    >
                      <option value="none">Не проверять</option>
                      <option value="1m">1 месяц</option>
                      <option value="3m">3 месяца</option>
                      <option value="6m">6 месяцев</option>
                      <option value="1y">1 год</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Актуально до</label>
                    <Input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="h-10 bg-[var(--input-bg)]"
                    />
                  </div>
                </div>
              </div>

              {/* Content editor */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Содержание</label>
                <div className="rounded-xl border border-border bg-card">
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleContentInput}
                    className={cn(
                      "min-h-[400px] p-5 prose prose-sm max-w-none dark:prose-invert focus:outline-none",
                      "[&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:pl-5 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-3 [&_h2]:mb-2",
                    )}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Свободный редактор. Форматирование и блоки будут расширены позже.
                </p>
              </div>

              {/* Fallback textarea — sync with rich editor for users who prefer plain text */}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Редактировать как обычный текст</summary>
                <Textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value)
                    if (editorRef.current) editorRef.current.innerHTML = e.target.value
                  }}
                  className="mt-2 min-h-[200px] font-mono text-xs"
                  placeholder="HTML разметка"
                />
              </details>
            </div>
          </div>
        </div>
      </SidebarInset>
      <AiAssistantWidget />
    </SidebarProvider>
  )
}
