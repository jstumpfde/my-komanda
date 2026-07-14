"use client"

// Секция «Коммуникации» → блок «Отказы» (утверждено Б1, консолидация 08.07).
//
// Read-only сводка источников текста отказа кандидату — редактирования
// здесь НЕТ (каждый текст живёт и правится в своём месте, это только витрина
// с переходом «Изменить»). Первые три строки — из «Карты настроек»
// (GET /api/modules/hr/settings-map), которая уже считает эффективные
// значения и origin (vacancy/company/default).
//
// 14.07 (Ф.А): добавлены ещё два источника read-only ссылок — их значения
// НЕ в реестре settings-map (это отдельные подсистемы со своим хранением),
// поэтому передаются пропами от родителя (page.tsx), который уже читает
// apiVacancy целиком:
//   - 4 отказных текста AI чат-бота (vacancy.aiChatbotSettings.rejectionMessages);
//   - тексты отказа стадий Воронки v2 (descriptionJson.funnelV2.stages[].rejectText
//     / stages[].rule.rejectText) — строка показывается, только если хотя бы
//     одна стадия имеет свой текст (иначе это шум для вакансий без Воронки v2).

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, UserX, ExternalLink } from "lucide-react"

interface ChatbotRejectionMessages {
  injection?:     string
  severeAbuse?:   string
  repeatedAbuse?: string
  unstable?:      string
}

interface Props {
  vacancyId: string
  /** vacancies.portrait_scoring — определяет, какой текст «Низкий балл резюме» показать. */
  portraitScoring?: boolean
  /** Переход к редактированию Портрета (первые две строки). */
  onNavigateToSpec?: () => void
  /** 14.07: 4 текста отказа AI чат-бота (aiChatbotSettings.rejectionMessages).
   *  undefined/null — трактуем как «ничего не переопределено» (действуют дефолты). */
  chatbotRejectionMessages?: ChatbotRejectionMessages | null
  /** Переход к панели AI чат-бота (там же редактируются 4 текста выше). */
  onNavigateToChatbot?: () => void
  /** 14.07: сколько стадий Воронки v2 имеют свой текст отказа (rule.rejectText
   *  или top-level rejectText — Воронка 3). 0/undefined → строку не показываем. */
  funnelV2RejectStagesCount?: number
  /** Переход в конструктор «Воронка v2». */
  onNavigateToFunnelV2?: () => void
}

// «1 стадия» / «2 стадии» / «5 стадий».
function pluralizeStages(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "стадия"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "стадии"
  return "стадий"
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

export function RejectionTextsSummary({
  vacancyId,
  portraitScoring,
  onNavigateToSpec,
  chatbotRejectionMessages,
  onNavigateToChatbot,
  funnelV2RejectStagesCount,
  onNavigateToFunnelV2,
}: Props) {
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

  // 14.07: 4 текста отказа AI чат-бота — отдельная подсистема (Группа 30),
  // не в реестре settings-map. Показываем всегда (в отличие от строки
  // Воронки v2 ниже) — это не опциональная фича, а часть чат-бота, который
  // может быть выключен, но тексты всё равно настроены/дефолтны.
  const chatbotKeys: (keyof ChatbotRejectionMessages)[] = ["injection", "severeAbuse", "repeatedAbuse", "unstable"]
  const chatbotCustomizedCount = chatbotKeys.filter(
    (k) => typeof chatbotRejectionMessages?.[k] === "string" && (chatbotRejectionMessages[k] as string).trim().length > 0,
  ).length
  items.push({
    label:  "AI чат-бот — отказы при нарушениях (4 шаблона)",
    value:  chatbotCustomizedCount > 0
      ? `${chatbotCustomizedCount} из 4 переопределено вручную`
      : "используются дефолты платформы",
    origin: chatbotCustomizedCount > 0 ? "vacancy" : "default",
    action: { label: "Настроить в чат-боте", onClick: () => onNavigateToChatbot?.() },
  })

  // 14.07: тексты отказа стадий Воронки v2 — показываем, только если у
  // вакансии реально есть хоть одна стадия со своим текстом (иначе для
  // большинства вакансий это была бы бесполезная строка).
  if ((funnelV2RejectStagesCount ?? 0) > 0) {
    const n = funnelV2RejectStagesCount as number
    items.push({
      label:  "Отказы стадий Воронки v2",
      value:  `${n} ${pluralizeStages(n)} со своим текстом отказа`,
      origin: "vacancy",
      action: { label: "Открыть конструктор", onClick: () => onNavigateToFunnelV2?.() },
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
          Независимые источники текста отказа кандидату. Только просмотр — правьте в месте назначения.
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
