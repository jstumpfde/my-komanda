"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { KnowledgeEditor } from "@/components/knowledge/editor"
import { ChevronRight, Save, Send, Plus, X } from "lucide-react"
import { toast } from "sonner"

// ─── Mock data ──────────────────────────────────────────────────────────────

const INITIAL_CATEGORIES = [
  { value: "onboarding",   label: "Онбординг" },
  { value: "regulations",  label: "Регламенты" },
  { value: "it-security",  label: "IT и безопасность" },
  { value: "hr-policies",  label: "HR-политики" },
  { value: "sales",        label: "Продажи" },
  { value: "learning",     label: "Обучение" },
]

const MOCK_REVIEWERS = [
  { id: "r1", name: "Анна Иванова",    role: "HR-руководитель" },
  { id: "r2", name: "Дмитрий Козлов",  role: "IT-директор" },
  { id: "r3", name: "Сергей Волков",   role: "Руководитель продаж" },
  { id: "r4", name: "Елена Сидорова",  role: "Операционный директор" },
]

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NewArticlePage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [content, setContent] = useState("")
  const [status, setStatus] = useState("draft")
  const [isPinned, setIsPinned] = useState(false)
  const [reviewerId, setReviewerId] = useState("")

  // Category management
  const [categories, setCategories] = useState(INITIAL_CATEGORIES)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatName, setNewCatName] = useState("")

  const handleAddCategory = () => {
    if (!newCatName.trim()) return
    const slug = newCatName.trim().toLowerCase().replace(/\s+/g, "-")
    setCategories((prev) => [...prev, { value: slug, label: newCatName.trim() }])
    setCategory(slug)
    setNewCatName("")
    setShowNewCategory(false)
    toast.success(`Категория «${newCatName.trim()}» создана`)
  }

  // Tags
  const handleAddTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t])
    }
    setTagInput("")
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      handleAddTag()
    }
  }

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag))

  // Save
  const handleSave = () => {
    // TODO: POST to /api/modules/knowledge/articles
    toast.success("Статья сохранена")
    router.push("/knowledge")
  }

  const handleSendToReview = () => {
    if (!reviewerId) {
      toast.error("Выберите проверяющего")
      return
    }
    // TODO: POST with status: "review"
    const reviewer = MOCK_REVIEWERS.find((r) => r.id === reviewerId)
    toast.success(`Статья отправлена на проверку → ${reviewer?.name}`)
    router.push("/knowledge")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
              <Link href="/knowledge" className="hover:text-foreground transition-colors">База знаний</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">Новая статья</span>
            </div>

            <h1 className="text-xl font-semibold text-foreground mb-6">Новая статья</h1>

            <div className="max-w-4xl space-y-5">

              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="title">Заголовок</Label>
                <Input
                  id="title"
                  placeholder="Введите заголовок статьи"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10"
                />
              </div>

              {/* Category with add-new */}
              <div className="space-y-1.5">
                <Label>Категория</Label>
                <div className="flex items-center gap-2">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-10 flex-1">
                      <SelectValue placeholder="Выберите категорию" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => setShowNewCategory(true)}
                  >
                    <Plus className="size-3.5" />
                    Новая
                  </Button>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label htmlFor="tags">Теги</Label>
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  id="tags"
                  placeholder="Введите тег и нажмите Enter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={handleAddTag}
                  className="h-10"
                />
              </div>

              {/* Content — editor with tabs */}
              <div className="space-y-1.5">
                <Label>Контент</Label>
                <KnowledgeEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Начните писать статью..."
                  minHeight={400}
                />
              </div>

              {/* Status, reviewer, pinned */}
              <div className="flex items-start gap-6 flex-wrap">
                <div className="space-y-1.5">
                  <Label>Статус</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10 w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Черновик</SelectItem>
                      <SelectItem value="review">На проверку</SelectItem>
                      <SelectItem value="published">Опубликовать</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Reviewer — shown when status is "review" */}
                {status === "review" && (
                  <div className="space-y-1.5">
                    <Label>Проверяющий</Label>
                    <Select value={reviewerId} onValueChange={setReviewerId}>
                      <SelectTrigger className="h-10 w-64">
                        <SelectValue placeholder="Выберите проверяющего" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_REVIEWERS.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name} — {r.role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-7">
                  <Checkbox
                    id="pinned"
                    checked={isPinned}
                    onCheckedChange={(v) => setIsPinned(v === true)}
                  />
                  <Label htmlFor="pinned" className="font-normal cursor-pointer">Закреплённая</Label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                {status === "review" ? (
                  <Button onClick={handleSendToReview} className="gap-1.5" disabled={!title.trim()}>
                    <Send className="size-4" />
                    Отправить на проверку
                  </Button>
                ) : (
                  <Button onClick={handleSave} className="gap-1.5" disabled={!title.trim()}>
                    <Save className="size-4" />
                    Сохранить
                  </Button>
                )}
                <Link href="/knowledge">
                  <Button variant="outline">Отмена</Button>
                </Link>
              </div>
            </div>

          </div>
        </div>
      </SidebarInset>

      {/* New category dialog */}
      <Dialog open={showNewCategory} onOpenChange={setShowNewCategory}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая категория</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Название</Label>
              <Input
                id="cat-name"
                placeholder="Например: Финансы"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                className="h-10"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewCategory(false)}>Отмена</Button>
              <Button onClick={handleAddCategory} disabled={!newCatName.trim()}>Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
