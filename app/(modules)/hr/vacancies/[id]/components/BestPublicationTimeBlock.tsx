"use client"

import { Sparkles, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getBestPublicationTime } from "../utils/getBestPublicationTime"

interface BestPublicationTimeBlockProps {
  vacancy: { title?: string | null }
}

export function BestPublicationTimeBlock({ vacancy }: BestPublicationTimeBlockProps) {
  const { dayOfWeek, time, reasoning } = getBestPublicationTime(vacancy)

  return (
    <div className="border-l-4 border-purple-500 p-4 rounded-lg bg-white dark:bg-gray-950 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-purple-500" />
        <h3 className="text-sm font-semibold">🤖 AI: лучший день для публикации</h3>
      </div>

      <p className="text-sm text-foreground mb-1.5">
        Публикуйте в <span className="font-semibold text-purple-600 dark:text-purple-400">{dayOfWeek}</span>{" "}
        в <span className="font-semibold text-purple-600 dark:text-purple-400">{time}</span>{" "}
        для максимума откликов
      </p>

      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        {reasoning}
      </p>

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950/30"
        onClick={() => alert("coming soon")}
      >
        <Calendar className="w-3.5 h-3.5" />
        Запланировать публикацию на это время
      </Button>
    </div>
  )
}
