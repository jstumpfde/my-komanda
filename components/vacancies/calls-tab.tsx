"use client"

// Таб «Звонки» (Ф4) — настройки бот-звонаря.
// MVP: переиспользуем существующий блок dialer из AutomationSettings (Switch +
// "Когда звонить" + ID скрипта) + заглушка для будущих сценариев авто-звонков.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AutomationSettings } from "@/components/vacancies/automation-settings"

export interface CallsTabProps {
  vacancyId: string
  descriptionJson: unknown
}

export function CallsTab({ vacancyId, descriptionJson }: CallsTabProps) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">Звонки</h2>
        <p className="text-sm text-muted-foreground">
          Авто-звонки бот-звонарём и шаблоны сценариев обзвона кандидатов.
        </p>
      </div>

      <AutomationSettings
        vacancyId={vacancyId}
        descriptionJson={descriptionJson}
        sections={["dialer"]}
        showGlobalSave={false}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сценарии звонков</CardTitle>
          <CardDescription>Шаблоны для автоматических обзвонов кандидатов</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            Раздел в разработке. Здесь появятся шаблоны: квалификация по телефону,
            подтверждение интервью, опрос после демо.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
