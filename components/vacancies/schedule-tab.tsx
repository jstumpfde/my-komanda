"use client"

// Таб «Расписание» (Ф4) — рабочие часы / дни / праздники.
// Обёртка вокруг VacancyScheduleSettings без секции «Авто-разбор откликов»
// (она переехала в таб «Источники»).

import { VacancyScheduleSettings } from "@/components/vacancies/vacancy-schedule-settings"

export interface ScheduleTabProps {
  vacancyId: string
}

export function ScheduleTab({ vacancyId }: ScheduleTabProps) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">Расписание</h2>
        <p className="text-sm text-muted-foreground">
          Когда система может отправлять сообщения, звонить и переводить кандидатов.
          Используется для авто-сообщений и цепочки дожима.
        </p>
      </div>
      <VacancyScheduleSettings vacancyId={vacancyId} />
    </div>
  )
}
