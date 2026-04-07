"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Sparkles, Pencil, Trash2, Search } from "lucide-react"

const allPosts = [
  { id: 1, channel: "ВКонтакте", emoji: "💙", title: "Кейс: как мы помогли клиенту вырасти в 2 раза за квартал", status: "Опубликовано", date: "20 мар 2026" },
  { id: 2, channel: "Telegram", emoji: "✈️", title: "5 ошибок при найме сотрудников, которые стоят денег", status: "Запланировано", date: "31 мар 2026" },
  { id: 3, channel: "Instagram", emoji: "📸", title: "Команда за кулисами — апрель 2026", status: "Черновик", date: "2 апр 2026" },
  { id: 4, channel: "Сайт", emoji: "🌐", title: "Обновление тарифов и новые возможности платформы", status: "Запланировано", date: "1 апр 2026" },
  { id: 5, channel: "Email", emoji: "📧", title: "Апрельский дайджест: что нового в my-komanda", status: "Черновик", date: "3 апр 2026" },
  { id: 6, channel: "ВКонтакте", emoji: "💙", title: "Топ-10 инструментов для HR в 2026 году", status: "Опубликовано", date: "15 мар 2026" },
  { id: 7, channel: "Telegram", emoji: "✈️", title: "Как автоматизировать онбординг новых сотрудников", status: "Опубликовано", date: "18 мар 2026" },
  { id: 8, channel: "Instagram", emoji: "📸", title: "Офис месяца: как мы обновили рабочее пространство", status: "Запланировано", date: "5 апр 2026" },
]

const statusColors: Record<string, string> = {
  "Опубликовано": "bg-green-100 text-green-700",
  "Запланировано": "bg-blue-100 text-blue-700",
  "Черновик": "bg-gray-100 text-gray-700",
}

export default function ContentPage() {
  const [channelFilter, setChannelFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [search, setSearch] = useState("")

  const filtered = allPosts.filter((p) => {
    const matchChannel = channelFilter === "all" || p.channel === channelFilter
    const matchStatus = statusFilter === "all" || p.status === statusFilter
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase())
    return matchChannel && matchStatus && matchSearch
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Контент-фабрика</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Sparkles className="h-4 w-4 mr-2" />
            AI-генерация
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Новый пост
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Канал" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все каналы</SelectItem>
            <SelectItem value="ВКонтакте">ВКонтакте</SelectItem>
            <SelectItem value="Telegram">Telegram</SelectItem>
            <SelectItem value="Instagram">Instagram</SelectItem>
            <SelectItem value="Сайт">Сайт</SelectItem>
            <SelectItem value="Email">Email</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="Черновик">Черновик</SelectItem>
            <SelectItem value="Запланировано">Запланировано</SelectItem>
            <SelectItem value="Опубликовано">Опубликовано</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по теме..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Content Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((post) => (
          <Card key={post.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <span>{post.emoji}</span>
                  <span className="text-muted-foreground">{post.channel}</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[post.status]}`}>
                  {post.status}
                </span>
              </div>

              <p className="font-medium text-sm leading-snug line-clamp-2">{post.title}</p>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">{post.date}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p>По выбранным фильтрам ничего не найдено</p>
        </div>
      )}
    </div>
  )
}
