"use client"

// Секция «Коммуникации» → блок «Отказы» (утверждено Б1, консолидация 08.07).
//
// Read-only сводка трёх источников текста отказа кандидату — редактирования
// здесь НЕТ (каждый текст живёт и правится в своём месте, это только витрина
// с переходом «Изменить»). Данные — из «Карты настроек»
// (GET /api/modules/hr/settings-map), которая уже считает эффективные
// значения и origin (vacancy/company/default).

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, UserX, ExternalLink } from "lucide-react"

interface Props {
  vacancyId: string
  /** vacancies.portrait_scoring — определяет, какой текст «Низкий балл резюме» показать. */
  portraitScoring?: boolean
  /** Переход к редактированию Портрета (первые две строки). */
  onNavigateToSpec?: () => void
}

type Origin = "default" | "company" | "vacancy" | "code"

interface SettingsMapRow {
  key: string
  title: string
  group: string
  level: "platform" | "company" | "vacancy"
  editPath: string | null
  effectiveValue: string
  origin: Origin
}

interface Row {
  label:  string
  value:  string
  origin: Origin
  action: { label: string; onClick: () => void } | { label: string; href: string }
}

function originBadge(origin: Origin) {
  if (origin === "vacancy") {
    return <Badge className="border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:border-emerald-800">вакансия</Badge>
  }
  if (origin === "company") {
    return <Badge className="border-blue-200 bg-blue-500/10 text-blue-700 dark:text-blue-400 dark:border-blue-800">компания</Badge>
  }
  if (origin === "code") {
    return <Badge className="border-amber-200 bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:border-amber-800">в коде</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground">дефолт</Badge>
}

export function RejectionTextsSummary({ vacancyId, portraitScoring, onNavigateToSpec }: Props) {
  const [rows, setRows] = useState<SettingsMapRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/modules/hr/settings-map?vacancyId=${encodeURIComponent(vacancyId)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { rows: SettingsMapRow[] }) => { if (!cancelled) setRows(data.rows) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  const findRow = (key: string) => rows?.find(r => r.key === key)

  const stopFactorRow = findRow("stopfactors.rejectionText")
  const resumeRow = portraitScoring ? findRow("spec.rejectLetter") : findRow("msg.reject")
  const manualRow = findRow("msg.reject")

  const items: Row[] = []
  if (stopFactorRow) {
    items.push({
      label:  "Стоп-фактор",
      value:  stopFactorRow.effectiveValue,
      origin: stopFactorRow.origin,
      action: { label: "Изменить в Портрете", onClick: () => onNavigateToSpec?.() },
    })
  }
  if (resumeRow) {
    items.push({
      label:  "Низкий балл резюме",
      value:  resumeRow.effectiveValue,
      origin: resumeRow.origin,
      action: { label: "Изменить в Портрете", onClick: () => onNavigateToSpec?.() },
    })
  }
  if (manualRow) {
    items.push({
      label:  "Ручной отказ (дефолт компании)",
      value:  manualRow.effectiveValue,
      origin: manualRow.origin,
      action: { label: "Настройки найма", href: "/hr/hiring-settings?tab=messages" },
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserX className="w-4 h-4" />
          Отказы
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Три независимых источника текста отказа кандидату. Только просмотр — правьте в месте назначения.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
          </div>
        ) : (
          <div className="rounded-lg border divide-y">
            {items.map((row) => (
              <div key={row.label} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.value}</p>
                </div>
                <div className="shrink-0">{originBadge(row.origin)}</div>
                {"href" in row.action ? (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 shrink-0" asChild>
                    <a href={row.action.href}>{row.action.label} <ExternalLink className="w-3 h-3" /></a>
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={row.action.onClick}>
                    {row.action.label}
                  </Button>
                )}
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-4">Не удалось загрузить тексты отказа.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
