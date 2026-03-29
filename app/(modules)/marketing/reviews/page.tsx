"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Star, MessageSquare } from "lucide-react"

const reviews = [
  {
    id: 1,
    author: "Анна Петрова",
    rating: 5,
    source: "Яндекс Карты",
    date: "25 мар 2026",
    text: "Отличный сервис! Пользуемся уже полгода, команда очень довольна. Всё интуитивно понятно.",
    status: "Отвечено",
  },
  {
    id: 2,
    author: "Дмитрий Козлов",
    rating: 4,
    source: "2GIS",
    date: "22 мар 2026",
    text: "Хорошая платформа для управления HR-процессами. Чуть не хватает интеграций, но в целом всё работает.",
    status: "Новый",
  },
  {
    id: 3,
    author: "Мария Сидорова",
    rating: 5,
    source: "Google Maps",
    date: "20 мар 2026",
    text: "Рекомендую всем директорам малого бизнеса! Автоматизировали найм полностью за 2 недели.",
    status: "Отвечено",
  },
  {
    id: 4,
    author: "Алексей Николаев",
    rating: 3,
    source: "2GIS",
    date: "18 мар 2026",
    text: "Функционал неплохой, но поддержка отвечает медленно. Надеюсь, это временно.",
    status: "Новый",
  },
  {
    id: 5,
    author: "Ольга Федорова",
    rating: 5,
    source: "Яндекс Карты",
    date: "15 мар 2026",
    text: "Используем модуль HR уже год. Очень удобно для нашей команды из 80 человек.",
    status: "Отвечено",
  },
  {
    id: 6,
    author: "Иван Морозов",
    rating: 4,
    source: "Google Maps",
    date: "12 мар 2026",
    text: "Классная автоматизация воронки найма. Сократили время на подбор в 2 раза.",
    status: "Отвечено",
  },
  {
    id: 7,
    author: "Татьяна Волкова",
    rating: 5,
    source: "2GIS",
    date: "10 мар 2026",
    text: "Отличная поддержка и постоянные обновления. Видно, что команда работает над продуктом.",
    status: "Новый",
  },
  {
    id: 8,
    author: "Сергей Лебедев",
    rating: 4,
    source: "Яндекс Карты",
    date: "8 мар 2026",
    text: "Пользуемся тарифом Business. Соотношение цена/качество хорошее для такого функционала.",
    status: "Отвечено",
  },
]

const sourceColors: Record<string, string> = {
  "2GIS": "bg-green-100 text-green-700",
  "Яндекс Карты": "bg-red-100 text-red-700",
  "Google Maps": "bg-blue-100 text-blue-700",
}

const statusColors: Record<string, string> = {
  "Новый": "bg-yellow-100 text-yellow-700",
  "Отвечено": "bg-gray-100 text-gray-600",
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`}
        />
      ))}
    </div>
  )
}

function ReviewCard({ review }: { review: typeof reviews[0] }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="font-medium text-sm">{review.author}</p>
            <StarRating rating={review.rating} />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sourceColors[review.source]}`}>
              {review.source}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[review.status]}`}>
              {review.status}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{review.text}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{review.date}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Ответить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ReviewsPage() {
  const avgRating = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)

  const bySource = (source: string) => reviews.filter((r) => r.source === source)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Отзывы</h1>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-6 p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
        <div className="text-center">
          <p className="text-4xl font-bold text-yellow-500">{avgRating}</p>
          <div className="flex justify-center mt-1">
            <StarRating rating={Math.round(Number(avgRating))} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">средний рейтинг</p>
        </div>
        <div className="h-12 w-px bg-yellow-200" />
        <div className="text-center">
          <p className="text-2xl font-bold">{reviews.length * 29}</p>
          <p className="text-xs text-muted-foreground">всего отзывов</p>
        </div>
        <div className="h-12 w-px bg-yellow-200" />
        <div className="text-center">
          <p className="text-2xl font-bold text-yellow-600">{reviews.filter((r) => r.status === "Новый").length}</p>
          <p className="text-xs text-muted-foreground">без ответа</p>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Все ({reviews.length})</TabsTrigger>
          <TabsTrigger value="2gis">2GIS ({bySource("2GIS").length})</TabsTrigger>
          <TabsTrigger value="yandex">Яндекс Карты ({bySource("Яндекс Карты").length})</TabsTrigger>
          <TabsTrigger value="google">Google Maps ({bySource("Google Maps").length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
          </div>
        </TabsContent>
        <TabsContent value="2gis" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bySource("2GIS").map((r) => <ReviewCard key={r.id} review={r} />)}
          </div>
        </TabsContent>
        <TabsContent value="yandex" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bySource("Яндекс Карты").map((r) => <ReviewCard key={r.id} review={r} />)}
          </div>
        </TabsContent>
        <TabsContent value="google" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bySource("Google Maps").map((r) => <ReviewCard key={r.id} review={r} />)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
