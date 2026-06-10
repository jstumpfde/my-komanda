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
        <h2 className="text-lg font-semibold">Расписание отправки сообщений</h2>
        <p className="text-sm text-muted-foreground">
          Когда автоматика может писать кандидатам по этой вакансии: автоответы на отклики,
          первые сообщения, приглашения на тест, дожим. Не путать с календарём — там
          назначаются встречи и собеседования.
        </p>
      </div>
      <VacancyScheduleSettings vacancyId={vacancyId} />
    </div>
  )
}
