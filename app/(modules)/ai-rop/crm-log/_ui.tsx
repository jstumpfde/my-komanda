/**
 * Локальные UI-хелперы страницы «Журнал записей в CRM» (/ai-rop/crm-log).
 * НЕ трогать app/(modules)/ai-rop/_components — отдельная зона.
 *
 * ВАЖНО: этот файл намеренно БЕЗ "use client" — page.tsx server component,
 * а хелперы ниже чистые (без hooks). Реальные значения mode/status в БД
 * (rop_crm_write_log) — mode: "dry"|"live", status: "queued"|"sent"|
 * "failed"|"skipped_dry" (см. lib/ai-rop/types.ts::CrmMode/CrmStatus), но
 * бейджи намеренно проверяют ПО СОДЕРЖИМОМУ строки (includes), а не через
 * строгий enum — на случай если в проде проскочит иное значение, страница
 * не должна падать/рендерить пусто.
 */
import { Badge } from "@/components/ui/badge"

export function ModeBadge({ value }: { value: string }) {
  const v = (value || "").toLowerCase()
  if (v.includes("live")) {
    return (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        Боевой
      </Badge>
    )
  }
  return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">Тестовый (dry-run)</Badge>
}

export function CrmStatusBadge({ value }: { value: string }) {
  const v = (value || "").toLowerCase()
  if (v.includes("sent") || v.includes("ok")) {
    return (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        Отправлено
      </Badge>
    )
  }
  if (v.includes("fail") || v.includes("error")) {
    return (
      <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
        Ошибка
      </Badge>
    )
  }
  if (v.includes("skip")) {
    return <Badge variant="outline" className="text-muted-foreground">Пропущено</Badge>
  }
  return <Badge variant="outline">{value}</Badge>
}

const ACTION_LABELS: Record<string, string> = {
  comment: "Комментарий в Timeline",
  activity_update: "Описание активности",
  task: "Задача",
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

export function entityLabel(entityType: string | null, entityId: string | null): string {
  if (!entityType && !entityId) return "—"
  return `${entityType ?? "?"} #${entityId ?? "?"}`
}
