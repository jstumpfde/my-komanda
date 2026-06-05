"use client"

import { useState, useEffect, useCallback } from "react"
import { Shield, Info, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ─── Типы ───────────────────────────────────────────────────────────────────

type RoleKey = "director" | "hr_lead" | "hr_manager" | "department_head" | "observer"

interface SectionRow {
  key: string
  label: string
  defaults: Record<RoleKey, boolean>
  /** если задан — ячейка hr_manager при клике сохраняет hrManagerTrashAccess */
  controlledByTrash?: true
}

// ─── Данные ──────────────────────────────────────────────────────────────────

const ROLES: Array<{
  role: RoleKey
  label: string
  description: string
  access: string[]
  color: string
}> = [
  {
    role: "director",
    label: "Директор",
    description: "Полный доступ ко всем функциям платформы, включая биллинг и отчёты",
    access: ["Вакансии", "Кандидаты", "Аналитика", "Настройки", "Биллинг", "Отчёты"],
    color: "bg-purple-100 text-purple-700",
  },
  {
    role: "hr_lead",
    label: "Главный HR",
    description: "Управление наймом, адаптацией, обучением и командой HR",
    access: ["Вакансии", "Кандидаты", "Аналитика", "Настройки команды", "Адаптация", "LMS"],
    color: "bg-blue-100 text-blue-700",
  },
  {
    role: "hr_manager",
    label: "HR-менеджер",
    description: "Работа с вакансиями и кандидатами без доступа к настройкам",
    access: ["Вакансии", "Кандидаты", "Интервью"],
    color: "bg-sky-100 text-sky-700",
  },
  {
    role: "department_head",
    label: "Руководитель отдела",
    description: "Просмотр обзора и управление своим отделом",
    access: ["Обзор", "Сотрудники отдела"],
    color: "bg-green-100 text-green-700",
  },
  {
    role: "observer",
    label: "Наблюдатель",
    description: "Только чтение — просмотр без возможности изменений",
    access: ["Обзор (только просмотр)"],
    color: "bg-gray-100 text-gray-600",
  },
]

const ROLE_KEYS: RoleKey[] = ["director", "hr_lead", "hr_manager", "department_head", "observer"]

const SECTIONS: SectionRow[] = [
  { key: "vacancies",        label: "Вакансии",           defaults: { director: true,  hr_lead: true,  hr_manager: true,  department_head: false, observer: false } },
  { key: "candidates",       label: "Кандидаты",          defaults: { director: true,  hr_lead: true,  hr_manager: true,  department_head: false, observer: false } },
  { key: "interviews",       label: "Интервью",           defaults: { director: true,  hr_lead: true,  hr_manager: true,  department_head: false, observer: false } },
  { key: "adaptation",       label: "Адаптация",          defaults: { director: true,  hr_lead: true,  hr_manager: false, department_head: false, observer: false } },
  { key: "lms",              label: "LMS / Обучение",     defaults: { director: true,  hr_lead: true,  hr_manager: false, department_head: true,  observer: false } },
  { key: "skills",           label: "Оценка навыков",     defaults: { director: true,  hr_lead: true,  hr_manager: false, department_head: true,  observer: false } },
  { key: "analytics",        label: "Аналитика",          defaults: { director: true,  hr_lead: true,  hr_manager: false, department_head: false, observer: false } },
  { key: "company_settings", label: "Настройки компании", defaults: { director: true,  hr_lead: false, hr_manager: false, department_head: false, observer: false } },
  { key: "team",             label: "Команда",            defaults: { director: true,  hr_lead: true,  hr_manager: false, department_head: false, observer: false } },
  { key: "billing",          label: "Биллинг",            defaults: { director: true,  hr_lead: false, hr_manager: false, department_head: false, observer: false } },
  { key: "overview",         label: "Обзор",              defaults: { director: true,  hr_lead: true,  hr_manager: true,  department_head: true,  observer: true  } },
  { key: "trash",            label: "Корзина",            defaults: { director: true,  hr_lead: true,  hr_manager: false, department_head: false, observer: false }, controlledByTrash: true },
]

// ─── localStorage helpers ────────────────────────────────────────────────────

function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocalStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota errors
  }
}

// ─── Hook: localStorage-персист для булеан-значений ──────────────────────────

function useLocalBool(key: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => readLocalStorage(key, defaultValue))
  const set = useCallback((v: boolean) => {
    setValue(v)
    writeLocalStorage(key, v)
  }, [key])
  return [value, set]
}

// ─── Hook: localStorage-персист для set of strings ───────────────────────────

function useLocalStringSet(key: string): [Set<string>, (id: string, open: boolean) => void] {
  const [ids, setIds] = useState<Set<string>>(() => new Set(readLocalStorage<string[]>(key, [])))
  const toggle = useCallback((id: string, open: boolean) => {
    setIds(prev => {
      const next = new Set(prev)
      if (open) next.add(id)
      else next.delete(id)
      writeLocalStorage(key, Array.from(next))
      return next
    })
  }, [key])
  return [ids, toggle]
}

// ─── Матрица: тип overrides ───────────────────────────────────────────────────

type MatrixOverrides = Partial<Record<RoleKey, Partial<Record<string, boolean>>>>

// Вычисляет итоговое значение ячейки с учётом overrides и флага доступа к корзине.
function resolveCell(
  section: SectionRow,
  role: RoleKey,
  overrides: MatrixOverrides,
  trashAccess: boolean,
): boolean {
  // Для Директора — всегда true
  if (role === "director") return true
  // Корзина — hr_manager читается из hrManagerTrashAccess (если нет override)
  if (section.controlledByTrash && role === "hr_manager") {
    const override = overrides[role]?.[section.key]
    return override !== undefined ? override : trashAccess
  }
  const override = overrides[role]?.[section.key]
  return override !== undefined ? override : section.defaults[role]
}

const HIRING_DEFAULTS_URL = "/api/modules/hr/company/hiring-defaults"

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function RolesPage() {
  // Флаг доступа HR-менеджеров к корзине (hrManagerTrashAccess)
  const [trashAccessHrManager, setTrashAccessHrManager] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Overrides матрицы (из сервера)
  const [matrixOverrides, setMatrixOverrides] = useState<MatrixOverrides>({})
  const [matrixSaving, setMatrixSaving] = useState(false)

  // Состояние раскрытия ролей (E2) — сохраняем в localStorage
  const [expandedRoles, toggleRoleExpand] = useLocalStringSet("roles:expanded")

  // Состояние сворачивания матрицы (E3) — сохраняем в localStorage
  const [matrixOpen, setMatrixOpen] = useLocalBool("roles:matrix_open", true)

  // Загрузка с сервера
  useEffect(() => {
    let cancelled = false
    fetch(HIRING_DEFAULTS_URL)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return
        setTrashAccessHrManager(Boolean(data.hiringDefaults?.rolePermissions?.hrManagerTrashAccess))
        const matrix = data.hiringDefaults?.rolePermissions?.matrix
        if (matrix && typeof matrix === "object") {
          setMatrixOverrides(matrix as MatrixOverrides)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  // Изменение ячейки матрицы — оптимистичный апдейт + откат
  const toggleMatrixCell = async (role: RoleKey, sectionKey: string, checked: boolean) => {
    if (role === "director") return // директор всегда включён

    const prevOverrides = matrixOverrides
    const prevTrash = trashAccessHrManager

    const newOverrides: MatrixOverrides = {
      ...matrixOverrides,
      [role]: {
        ...(matrixOverrides[role] ?? {}),
        [sectionKey]: checked,
      },
    }
    setMatrixOverrides(newOverrides)

    // Корзина + hr_manager — сохраняем hrManagerTrashAccess
    const section = SECTIONS.find(s => s.key === sectionKey)
    const isTrashHrManager = section?.controlledByTrash && role === "hr_manager"
    if (isTrashHrManager) {
      setTrashAccessHrManager(checked)
    }

    setMatrixSaving(true)
    try {
      const body = isTrashHrManager
        ? { rolePermissions: { hrManagerTrashAccess: checked, matrix: newOverrides } }
        : { rolePermissions: { matrix: newOverrides } }

      const res = await fetch(HIRING_DEFAULTS_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("save failed")
      if (isTrashHrManager) {
        toast.success(checked ? "HR-менеджеры теперь видят корзину" : "Доступ к корзине для HR-менеджеров отключён")
      }
    } catch {
      setMatrixOverrides(prevOverrides)
      if (isTrashHrManager) setTrashAccessHrManager(prevTrash)
      toast.error("Не удалось сохранить — попробуйте ещё раз")
    } finally {
      setMatrixSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Роли и доступ</h1>
        <p className="text-muted-foreground mt-1">Управление правами доступа для каждой роли в системе</p>
      </div>

      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-700">
        <Info className="size-4 mt-0.5 shrink-0" />
        <p>Роли назначаются в разделе <strong>Настройки → Команда</strong>. Здесь отображается справочник прав доступа для каждой роли.</p>
      </div>

      {/* E2 — Роли: раскрываемый список */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Роли</p>
        <div className="flex flex-col gap-2">
          {ROLES.map(r => {
            const isOpen = expandedRoles.has(r.role)
            return (
              <Collapsible
                key={r.role}
                open={isOpen}
                onOpenChange={open => toggleRoleExpand(r.role, open)}
              >
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-lg border bg-card text-left",
                      "hover:bg-muted/50 transition-colors",
                      isOpen && "border-primary/20 bg-primary/5",
                    )}
                  >
                    <div className="flex items-center justify-center size-8 rounded-lg bg-muted shrink-0">
                      <Shield className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{r.label}</span>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", r.color)}>
                          {r.role}
                        </span>
                      </div>
                      {!isOpen && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.description}</p>
                      )}
                    </div>
                    {isOpen
                      ? <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                    }
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mx-0 px-4 pt-1 pb-3 border border-t-0 rounded-b-lg bg-card border-primary/20">
                    <p className="text-xs text-muted-foreground mb-2">{r.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.access.map(a => (
                        <Badge key={a} variant="secondary" className="text-[11px]">{a}</Badge>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </div>
      </div>

      {/* E3 — Матрица прав: редактируемая + сворачиваемая */}
      <Collapsible open={matrixOpen} onOpenChange={setMatrixOpen}>
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full group">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium">Матрица прав доступа</CardTitle>
                  {matrixSaving && (
                    <span className="text-[11px] text-muted-foreground animate-pulse">сохранение...</span>
                  )}
                </div>
                {matrixOpen
                  ? <ChevronDown className="size-4 text-muted-foreground" />
                  : <ChevronRight className="size-4 text-muted-foreground" />
                }
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <p className="text-[11px] text-muted-foreground mb-3">
                Настройка прав по ролям. Фактическое применение части прав внедряется постепенно — базовые роли уже работают.
                Директор всегда имеет полный доступ и не может быть ограничен.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 pr-4 w-44">Раздел</th>
                      {ROLES.map(r => (
                        <th key={r.role} className="py-3 px-3 text-xs font-medium text-center min-w-[90px]">
                          <span className={cn("px-2 py-0.5 rounded-full whitespace-nowrap", r.color)}>{r.label}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SECTIONS.map(section => (
                      <tr key={section.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 pr-4 text-sm font-medium">
                          <div className="flex items-center gap-1.5">
                            {section.key === "trash" && <Trash2 className="size-3 text-muted-foreground" />}
                            {section.label}
                          </div>
                        </td>
                        {ROLE_KEYS.map(role => {
                          const value = resolveCell(section, role, matrixOverrides, trashAccessHrManager)
                          const isDirector = role === "director"
                          return (
                            <td key={role} className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center">
                                <Checkbox
                                  checked={value}
                                  disabled={isDirector || !loaded}
                                  onCheckedChange={checked => {
                                    if (!isDirector) {
                                      toggleMatrixCell(role, section.key, Boolean(checked))
                                    }
                                  }}
                                  className={cn(isDirector && "opacity-60 cursor-not-allowed")}
                                  aria-label={`${section.label} — ${ROLES.find(r => r.role === role)?.label}`}
                                />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
}
