"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, Link, Unlink, Users, Heart, FileText } from "lucide-react"

const accounts = [
  {
    name: "ВКонтакте",
    emoji: "💙",
    connected: true,
    followers: "12 400",
    engagement: "4.2%",
    postsMonth: 14,
    color: "border-blue-200 bg-blue-50/30",
  },
  {
    name: "Telegram",
    emoji: "✈️",
    connected: true,
    followers: "8 200",
    engagement: "6.8%",
    postsMonth: 22,
    color: "border-sky-200 bg-sky-50/30",
  },
  {
    name: "Instagram",
    emoji: "📸",
    connected: false,
    followers: "—",
    engagement: "—",
    postsMonth: 0,
    color: "border-pink-200 bg-pink-50/30",
  },
]

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const weekPosts = [
  { day: "Пн", posts: ["ВКонтакте: Кейс клиента", "Telegram: Новости недели"] },
  { day: "Вт", posts: [] },
  { day: "Ср", posts: ["Telegram: Совет по найму"] },
  { day: "Чт", posts: ["ВКонтакте: Опрос аудитории"] },
  { day: "Пт", posts: ["Telegram: Итоги недели", "ВКонтакте: Анонс вебинара"] },
  { day: "Сб", posts: [] },
  { day: "Вс", posts: ["Instagram: Команда"] },
]

export default function SocialPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Социальные сети</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Запланировать пост
        </Button>
      </div>

      {/* Connected Accounts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {accounts.map((acc) => (
          <Card key={acc.name} className={`border ${acc.color}`}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{acc.emoji}</span>
                  <span className="font-semibold">{acc.name}</span>
                </div>
                {acc.connected ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    Подключено
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                    Не подключено
                  </span>
                )}
              </div>

              {acc.connected ? (
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Подписчики</p>
                    <p className="font-semibold">{acc.followers}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">ER</p>
                    <p className="font-semibold text-green-600">{acc.engagement}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Постов/мес</p>
                    <p className="font-semibold">{acc.postsMonth}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Подключите аккаунт для публикации и аналитики</p>
              )}

              <Button
                variant={acc.connected ? "outline" : "default"}
                size="sm"
                className="w-full"
              >
                {acc.connected ? (
                  <>
                    <Unlink className="h-4 w-4 mr-2" />
                    Отключить
                  </>
                ) : (
                  <>
                    <Link className="h-4 w-4 mr-2" />
                    Подключить
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Week Calendar */}
      <Card>
        <CardHeader>
          <CardTitle>Контент-календарь — эта неделя</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {weekPosts.map((day) => (
              <div key={day.day} className="space-y-2">
                <div className="text-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">{day.day}</span>
                </div>
                <div
                  className={`min-h-24 rounded-lg border p-2 space-y-1.5 ${
                    day.posts.length > 0 ? "border-blue-200 bg-blue-50/40" : "border-dashed border-gray-200 bg-gray-50/40"
                  }`}
                >
                  {day.posts.length > 0 ? (
                    day.posts.map((post, i) => (
                      <div key={i} className="text-xs bg-white rounded p-1.5 border border-blue-100 shadow-sm leading-snug">
                        {post}
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-full min-h-16">
                      <span className="text-xs text-gray-300">Нет постов</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
