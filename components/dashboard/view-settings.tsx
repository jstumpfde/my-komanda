"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Eye, ChevronDown, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { isOwnerEmail } from "@/lib/owner"
import { CANDIDATE_COLUMN_TOGGLES, type CardDisplaySettings } from "./card-settings"
import type { ViewMode } from "./kanban-board"
import { COLUMN_WIDTHS_STORAGE_KEY, COLUMN_WIDTHS_RESET_EVENT } from "./list-view"

interface ViewSettingsProps {
  settings: CardDisplaySettings
  onSettingsChange: (settings: CardDisplaySettings) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  /** Если задан — в меню появляется пункт «Тест» (таблица ответов на отдельной странице). */
  testTableHref?: string
  /** Сброс к стандартным настройкам колонок */
  onReset?: () => void
  /**
   * Актуальные для ЭТОЙ вакансии ключи колонок (по конфигу воронки). Если задан —
   * показываем тумблер только для колонки из набора (плюс всегда универсальные,
   * которые уже включены в набор). Если не задан (null/undefined) — показываем ВСЕ
   * тумблеры (прежнее поведение, безопасный дефолт).
   */
  availableKeys?: Set<keyof CardDisplaySettings> | null
}

const VIEW_MODES: Array<{ value: ViewMode; label: string }> = [
  { value: "funnel", label: "Воронка" },
  { value: "list",   label: "Список"  },
  { value: "kanban", label: "Канбан"  },
  { value: "tiles",  label: "Плитки"  },
]

// Тумблеры колонок берём из ЕДИНОГО реестра CANDIDATE_COLUMN_TOGGLES
// (card-settings.tsx) — он в порядке колонок таблицы и без системных колонок.
// Добавилась/убралась колонка → тумблер меняется автоматически.
const DISPLAY_TOGGLES = CANDIDATE_COLUMN_TOGGLES

// Тумблеры, у которых НЕТ колонки в режиме «Список» (list-view.tsx читает
// settings.showScore, но не рендерит под него колонку — см. комментарий у
// showScore в card-settings.tsx). Такому тумблеру нечего включать/выключать
// в Списке → скрываем именно там (per-viewMode фильтр, решение Юрия 05.07).
// В Канбане/Плитках/Воронке showScore управляет реальным бейджем — оставляем.
const LIST_MODE_HIDDEN_KEYS: ReadonlySet<keyof CardDisplaySettings> = new Set(["showScore"])

export function ViewSettings({ settings, onSettingsChange, viewMode, onViewModeChange, testTableHref, onReset, availableKeys }: ViewSettingsProps) {
  const { role, user } = useAuth()
  // Виды Воронка/Канбан/Плитки пока обкатываются — показываем только владельцу-
  // полигону (по email). Остальным — только «Список».
  const showAllViews = isOwnerEmail(user?.email)
  // Решение владельца 17.07: тумблеры активны у ВСЕХ ролей (было B5 10.06 —
  // read-only для не-директоров). canEditColumns теперь определяет НЕ доступ
  // к тумблерам, а КУДА уходит сохранение: директор/platform_admin меняют
  // company-default (hiring-defaults, видно всей компании), остальные роли —
  // свой личный override (см. onSettingsChange в page.tsx — там же ветвление).
  const canEditColumns = ["director", "client", "platform_admin", "admin"].includes(role)

  const handleToggle = (key: keyof CardDisplaySettings) => {
    // undefined трактуем как «включено» (см. checked выше), поэтому переключаем
    // от отображаемого состояния: false → true, иначе → false.
    const next = { ...settings, [key]: settings[key] === false }
    if (key === "showSalaryFull" && next.showSalaryFull) next.showSalary = false
    if (key === "showSalary" && next.showSalary) next.showSalaryFull = false
    onSettingsChange(next)
  }

  // Сброс ручных ширин колонок списка (ресайз мышью, Юрий 05.07). Ширины
  // живут в localStorage внутри list-view.tsx (per-user, тот же механизм,
  // что порядок колонок); ViewSettings — сосед ListView по дереву компонентов,
  // не родитель/ребёнок, поэтому чистим общий ключ + шлём CustomEvent, который
  // слушает useColumnWidths в list-view.tsx (см. комментарий там же).
  const handleResetColumnWidths = () => {
    try { window.localStorage.removeItem(COLUMN_WIDTHS_STORAGE_KEY) } catch { /* no-op */ }
    window.dispatchEvent(new Event(COLUMN_WIDTHS_RESET_EVENT))
  }

  // Тумблеры колонок: если задан availableKeys — показываем только актуальные
  // для этой вакансии колонки; иначе (null/undefined) — все (прежнее поведение).
  // Плюс per-viewMode фильтр: в «Списке» скрываем тумблеры без колонки там
  // (сейчас только showScore — см. LIST_MODE_HIDDEN_KEYS), в остальных режимах
  // список не сужаем.
  const visibleToggles = DISPLAY_TOGGLES
    .filter(({ key }) => (availableKeys ? availableKeys.has(key) : true))
    .filter(({ key }) => !(viewMode === "list" && LIST_MODE_HIDDEN_KEYS.has(key)))

  const activeLabel = VIEW_MODES.find((m) => m.value === viewMode)?.label

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <Eye className="w-3.5 h-3.5" />
          {activeLabel ? `Вид: ${activeLabel}` : "Вид"}
          <ChevronDown className="w-3 h-3 ml-0.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 max-h-[min(85vh,var(--radix-popover-content-available-height))] overflow-y-auto"
        align="end"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Режим отображения</h4>
            <div className="space-y-1">
              {VIEW_MODES.filter(({ value }) => value === "list" || showAllViews).map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted/60",
                    viewMode === value && "bg-muted"
                  )}
                >
                  <input
                    type="radio"
                    name="view-mode"
                    checked={viewMode === value}
                    onChange={() => onViewModeChange(value)}
                    className="accent-primary w-3.5 h-3.5"
                  />
                  <span className="flex-1">{label}</span>
                </label>
              ))}
              {testTableHref && (
                <>
                  <div className="my-1 border-t" />
                  <a
                    href={testTableHref}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted/60"
                  >
                    <span className="flex-1">Тест — ответы кандидатов</span>
                    <span className="text-[10px] text-muted-foreground">таблица →</span>
                  </a>
                </>
              )}
            </div>
          </div>
          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Настройки отображения</h4>
              {onReset && canEditColumns && (
                <button
                  type="button"
                  onClick={onReset}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Сбросить к стандартным"
                >
                  <RotateCcw className="w-3 h-3" />
                  Сбросить
                </button>
              )}
            </div>
            {!canEditColumns && (
              <p className="text-[11px] text-muted-foreground">
                Ваш личный вид; общий для компании задаёт директор
              </p>
            )}
            <div className="space-y-2.5">
              {visibleToggles.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label htmlFor={`vs-${key}`} className="text-sm font-normal cursor-pointer">
                    {label}
                  </Label>
                  <Switch
                    id={`vs-${key}`}
                    checked={settings[key] !== false}
                    onCheckedChange={() => handleToggle(key)}
                  />
                </div>
              ))}
            </div>
            {/* Ширины колонок ресайзятся мышью только в «Списке» (list-view.tsx) —
                пункт сброса показываем только там, чтобы не плодить мёртвый UI
                в Канбане/Плитках/Воронке, где ресайза нет. */}
            {viewMode === "list" && (
              <button
                type="button"
                onClick={handleResetColumnWidths}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title="Вернуть колонкам списка ширину по умолчанию (после ресайза мышью)"
              >
                <RotateCcw className="w-3 h-3" />
                Сбросить ширины колонок
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
