"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
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

const CATEGORIES_LIST = [
  { value: "onboarding",   label: "Онбординг" },
  { value: "regulations",  label: "Регламенты" },
  { value: "it-security",  label: "IT и безопасность" },
  { value: "hr-policies",  label: "HR-политики" },
  { value: "sales",        label: "Продажи" },
  { value: "learning",     label: "Обучение" },
]

// Mock article data for editing
const ARTICLES_DATA: Record<string, {
  title: string; category: string; categorySlug: string; tags: string[];
  content: string; status: string; isPinned: boolean
}> = {
  "kak-oformit-otpusk": {
    title: "Как оформить отпуск", category: "HR-политики", categorySlug: "hr-policies",
    tags: ["отпуск", "HR"], status: "published", isPinned: true,
    content: `## Порядок оформления отпуска\n\n### 1. Подача заявления\nЗаявление на отпуск подаётся **не позднее чем за 14 дней** до начала отпуска.`,
  },
  "nastroyka-vpn": {
    title: "Настройка VPN", category: "IT и безопасность", categorySlug: "it-security",
    tags: ["VPN", "безопасность"], status: "published", isPinned: true,
    content: `## Настройка корпоративного VPN\n\n### Шаг 1. Получите учётные данные\nОбратитесь в IT-отдел через тикет-систему.`,
  },
}

export default function EditArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const existing = ARTICLES_DATA[slug]

  const [title, setTitle] = useState(existing?.title ?? "")
  const [category, setCategory] = useState(existing?.categorySlug ?? "")
  const [tags, setTags] = useState(existing?.tags.join(", ") ?? "")
  const [content, setContent] = useState(existing?.content ?? "")
  const [status, setStatus] = useState(existing?.status ?? "draft")
  const [isPinned, setIsPinned] = useState(existing?.isPinned ?? false)

  if (!existing) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex-1 overflow-auto bg-background min-w-0">
            <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
              <p className="text-muted-foreground">Статья не найдена</p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const handleSave = () => {
    // TODO: PATCH to /api/modules/knowledge/articles/[id]
    router.push(`/knowledge/article/${slug}`)
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
              <Link href={`/knowledge/article/${slug}`} className="hover:text-foreground transition-colors">
                {existing.title}
              </Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">Редактирование</span>
            </div>

            <h1 className="text-xl font-semibold text-foreground mb-6">Редактирование статьи</h1>

            <div className="max-w-3xl space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="title">Заголовок</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
              </div>

              <div className="space-y-1.5">
                <Label>Категория</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES_LIST.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tags">Теги</Label>
                <Input
                  id="tags"
                  placeholder="Введите теги через запятую"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="content">Контент (Markdown)</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>

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

              <div className="flex items-center gap-3 pt-2">
                <Button onClick={handleSave} className="gap-1.5" disabled={!title.trim()}>
                  <Save className="size-4" />
                  Сохранить
                </Button>
                <Link href={`/knowledge/article/${slug}`}>
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
