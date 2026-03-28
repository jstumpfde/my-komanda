import { NextRequest } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { requirePlatformAdmin, apiError, apiSuccess } from "@/lib/api-helpers"

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccessLevel = "full" | "view" | "none"

export interface RolePermissions {
  [featureId: string]: AccessLevel
}

// ─── Features ─────────────────────────────────────────────────────────────────

export const FEATURES = [
  { id: "vacancies_view",    label: "Вакансии — просмотр",          group: "Найм" },
  { id: "vacancies_create",  label: "Вакансии — создание",          group: "Найм" },
  { id: "vacancies_delete",  label: "Вакансии — удаление",          group: "Найм" },
  { id: "candidates_view",   label: "Кандидаты — просмотр",         group: "Найм" },
  { id: "candidates_manage", label: "Кандидаты — управление",       group: "Найм" },
  { id: "interviews",        label: "Интервью",                     group: "Найм" },
  { id: "company_settings",  label: "Настройки компании",            group: "Настройки" },
  { id: "billing",           label: "Биллинг",                      group: "Настройки" },
  { id: "users_manage",      label: "Управление пользователями",     group: "Настройки" },
  { id: "analytics",         label: "Аналитика",                    group: "Отчёты" },
] as const

export type FeatureId = (typeof FEATURES)[number]["id"]

// ─── Default matrix ───────────────────────────────────────────────────────────

const DEFAULT_MATRIX: Record<string, RolePermissions> = {
  platform_admin: {
    vacancies_view: "full", vacancies_create: "full", vacancies_delete: "full",
    candidates_view: "full", candidates_manage: "full", interviews: "full",
    company_settings: "full", billing: "full", users_manage: "full", analytics: "full",
  },
  platform_manager: {
    vacancies_view: "full", vacancies_create: "full", vacancies_delete: "full",
    candidates_view: "full", candidates_manage: "full", interviews: "full",
    company_settings: "view", billing: "none", users_manage: "view", analytics: "full",
  },
  director: {
    vacancies_view: "full", vacancies_create: "full", vacancies_delete: "full",
    candidates_view: "full", candidates_manage: "full", interviews: "full",
    company_settings: "full", billing: "full", users_manage: "full", analytics: "full",
  },
  hr_lead: {
    vacancies_view: "full", vacancies_create: "full", vacancies_delete: "full",
    candidates_view: "full", candidates_manage: "full", interviews: "full",
    company_settings: "full", billing: "none", users_manage: "full", analytics: "full",
  },
  hr_manager: {
    vacancies_view: "full", vacancies_create: "full", vacancies_delete: "none",
    candidates_view: "full", candidates_manage: "full", interviews: "full",
    company_settings: "none", billing: "none", users_manage: "none", analytics: "view",
  },
  department_head: {
    vacancies_view: "view", vacancies_create: "none", vacancies_delete: "none",
    candidates_view: "full", candidates_manage: "view", interviews: "view",
    company_settings: "none", billing: "none", users_manage: "none", analytics: "view",
  },
  observer: {
    vacancies_view: "view", vacancies_create: "none", vacancies_delete: "none",
    candidates_view: "view", candidates_manage: "none", interviews: "none",
    company_settings: "none", billing: "none", users_manage: "none", analytics: "view",
  },
}

// In-memory overrides (MVP: resets on server restart)
const permissionsOverrides: Partial<Record<string, RolePermissions>> = {}

function getMatrix(): Record<string, RolePermissions> {
  const result: Record<string, RolePermissions> = {}
  for (const roleId of Object.keys(DEFAULT_MATRIX)) {
    result[roleId] = { ...DEFAULT_MATRIX[roleId], ...(permissionsOverrides[roleId] ?? {}) }
  }
  return result
}

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; description: string; isPlatform: boolean; isLocked: boolean }> = {
  platform_admin: {
    label: "Администратор платформы",
    description: "Полный доступ ко всем функциям платформы и администрированию",
    isPlatform: true,
    isLocked: true,
  },
  platform_manager: {
    label: "Менеджер платформы",
    description: "Управление клиентами и тарифами, без доступа к биллингу",
    isPlatform: true,
    isLocked: false,
  },
  director: {
    label: "Директор",
    description: "Полный доступ к функциям компании, включая биллинг и команду",
    isPlatform: false,
    isLocked: false,
  },
  hr_lead: {
    label: "Главный HR",
    description: "Управление наймом, командой и настройками, без биллинга",
    isPlatform: false,
    isLocked: false,
  },
  hr_manager: {
    label: "HR-менеджер",
    description: "Работа с вакансиями и кандидатами, без настроек",
    isPlatform: false,
    isLocked: false,
  },
  department_head: {
    label: "Руководитель отдела",
    description: "Просмотр воронки кандидатов и участие в согласовании",
    isPlatform: false,
    isLocked: false,
  },
  observer: {
    label: "Наблюдатель",
    description: "Только просмотр — вакансии, кандидаты, аналитика",
    isPlatform: false,
    isLocked: false,
  },
}

// DB legacy role → new role mapping
const ROLE_MIGRATION: Record<string, string> = {
  admin: "platform_admin",
  manager: "platform_manager",
  client: "director",
  client_hr: "hr_manager",
  candidate: "observer",
}

// ─── GET /api/admin/roles ─────────────────────────────────────────────────────

export async function GET() {
  try {
    await requirePlatformAdmin()

    // User counts by role (handles both legacy and new role names)
    const countRows = await db
      .select({ role: users.role, count: sql<number>`count(*)::int` })
      .from(users)
      .groupBy(users.role)

    const countByRole: Record<string, number> = {}
    for (const row of countRows) {
      const normalised = ROLE_MIGRATION[row.role] ?? row.role
      countByRole[normalised] = (countByRole[normalised] ?? 0) + row.count
    }

    const matrix = getMatrix()

    const roles = Object.entries(ROLE_META).map(([id, meta]) => ({
      id,
      ...meta,
      userCount: countByRole[id] ?? 0,
      permissions: matrix[id] ?? DEFAULT_MATRIX[id] ?? {},
    }))

    return apiSuccess({ roles, features: FEATURES })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[api/admin/roles GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// ─── PUT /api/admin/roles ─────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    await requirePlatformAdmin()

    const { roleId, permissions } = await req.json() as {
      roleId: string
      permissions: RolePermissions
    }

    if (!roleId || !permissions) return apiError("roleId и permissions обязательны", 400)
    if (!ROLE_META[roleId]) return apiError("Роль не найдена", 404)
    if (ROLE_META[roleId]?.isLocked) return apiError("Права этой роли нельзя изменить", 403)

    // Validate access levels
    const validLevels: AccessLevel[] = ["full", "view", "none"]
    for (const [fId, level] of Object.entries(permissions)) {
      if (!validLevels.includes(level as AccessLevel)) {
        return apiError(`Недопустимое значение для ${fId}: ${level}`, 400)
      }
    }

    permissionsOverrides[roleId] = { ...(permissionsOverrides[roleId] ?? {}), ...permissions }

    return apiSuccess({ ok: true, roleId })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[api/admin/roles PUT]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
