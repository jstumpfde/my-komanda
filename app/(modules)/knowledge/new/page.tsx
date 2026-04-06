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
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ChevronRight, Save } from "lucide-react"

const CATEGORIES = [
  { value: "onboarding",   label: "Онбординг" },
  { value: "regulations",  label: "Регламенты" },
  { value: "it-security",  label: "IT и безопасность" },
  { value: "hr-policies",  label: "HR-политики" },
  { value: "sales",        label: "Продажи" },
  { value: "learning",     label: "Обучение" },
]

export default function NewArticlePage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [tags, setTags] = useState("")
  const [content, setContent] = useState("")
  const [status, setStatus] = useState("draft")
  const [isPinned, setIsPinned] = useState(false)

  const handleSave = () => {
    // TODO: POST to /api/modules/knowledge/articles
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

            <div className="max-w-3xl space-y-5">
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

              {/* Category */}
              <div className="space-y-1.5">
                <Label>Категория</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label htmlFor="tags">Теги</Label>
                <Input
                  id="tags"
                  placeholder="Введите теги через запятую"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">Например: отпуск, HR, инструкция</p>
              </div>

              {/* Content */}
              <div className="space-y-1.5">
                <Label htmlFor="content">Контент (Markdown)</Label>
                <Textarea
                  id="content"
                  placeholder="Напишите содержимое статьи в формате Markdown..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>

              {/* Status & Pinned */}
              <div className="flex items-center gap-6">
                <div className="space-y-1.5">
                  <Label>Статус</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10 w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Черновик</SelectItem>
                      <SelectItem value="published">Опубликовать</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    id="pinned"
                    checked={isPinned}
                    onCheckedChange={(v) => setIsPinned(v === true)}
                  />
                  <Label htmlFor="pinned" className="font-normal cursor-pointer">Закреплённая статья</Label>
                </div>
              </div>

              {/* Save */}
              <div className="flex items-center gap-3 pt-2">
                <Button onClick={handleSave} className="gap-1.5" disabled={!title.trim()}>
                  <Save className="size-4" />
                  Сохранить
                </Button>
                <Link href="/knowledge">
                  <Button variant="outline">Отмена</Button>
                </Link>
              </div>
            </div>

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
