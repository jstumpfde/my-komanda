"use client"

import { Card } from "@/components/ui/card"
import { Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import { HhVacancyBanner } from "@/components/vacancies/hh-vacancy-banner"

interface HhVacancyMeta {
  hhVacancyId: string
  responsesCount: number
  syncedAt: string
  createdAt: string
  localVacancyId: string | null
}

interface Props {
  vacancyId: string
  hhVacancyId: string | null
  vacancyTitle: string
  createdAt: string | null
  localCandidatesCount: number
  inDemoCount: number
  connected: boolean | null
  hhMeta: HhVacancyMeta | null
  pendingCount: number | null
  onSyncDone?: () => void
}

function daysSince(date: string | null | undefined): number {
  if (!date) return 0
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
}

function formatDays(n: number): string {
  if (n >= 30) return "30+ дн."
  return `${n} дн.`
}

export function VacancyPulse({
  vacancyId, hhVacancyId, vacancyTitle, createdAt,
  localCandidatesCount, inDemoCount,
  connected, hhMeta, pendingCount, onSyncDone,
}: Props) {
  const publishedDays = daysSince(hhMeta?.createdAt ?? createdAt)

  // STATE 1 — hh.ru не подключён
  if (connected === false) {
    return (
      <Card className="mb-4 px-4 py-3 flex items-center gap-3">
        <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="text-sm">
          Опубликована <span className="font-medium">{formatDays(publishedDays)}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium">{localCandidatesCount}</span> кандидатов
        </div>
      </Card>
    )
  }

  // STATE 2 — подключён, но не привязана
  if (connected === true && !hhVacancyId) {
    return (
      <div className="mb-4 space-y-2">
        <Card className="px-4 py-3 flex items-center gap-3">
          <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="text-sm flex-1">
            Опубликована <span className="font-medium">{formatDays(publishedDays)}</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-medium">{localCandidatesCount}</span> кандидатов
            <span className="text-muted-foreground"> · </span>
            <span className="text-amber-700">hh.ru не привязана</span>
          </div>
        </Card>
        <HhVacancyBanner
          vacancyId={vacancyId}
          hhVacancyId={null}
          vacancyTitle={vacancyTitle}
          onCandidatesUpdated={onSyncDone}
        />
      </div>
    )
  }

  // connected === null (грузим) или нет hhMeta — короткая шапка
  if (connected !== true || !hhMeta) {
    return (
      <Card className="mb-4 px-4 py-3 flex items-center gap-3">
        <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="text-sm">
          Опубликована <span className="font-medium">{formatDays(publishedDays)}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium">{localCandidatesCount}</span> кандидатов
        </div>
      </Card>
    )
  }

  // STATE 3 — полный пульт
  const total = hhMeta.responsesCount ?? 0
  const pending = pendingCount ?? 0

  return (
    <Card className="mb-4 px-4 py-3 flex items-center gap-3 flex-wrap">
      <Activity className="w-4 h-4 text-muted-foreground shrink-0" />

      <span className="text-sm shrink-0">
        Опубликована <span className="font-medium">{formatDays(publishedDays)}</span>
      </span>

      <span className="text-muted-foreground shrink-0">·</span>

      <span className="text-sm">
        <span className="font-medium">{total}</span> откликов
        <span className="text-muted-foreground"> · </span>
        <span className={cn("font-medium", pending > 0 ? "text-amber-700" : "text-muted-foreground")}>{pending}</span> необраб.
        <span className="text-muted-foreground"> · </span>
        <span className="font-medium">{inDemoCount}</span> в демо
      </span>
    </Card>
  )
}
