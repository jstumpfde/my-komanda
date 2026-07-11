/**
 * Гейт доступа для server-компонентов модуля AI-РОП (см. docs/architecture/
 * AI-ROP-MODULE-PLAN-2026-07.md, решение 3). requireRopTeam()/requireRopManage()
 * из lib/ai-rop/access.ts бросают NextResponse (Response) — это ок для API
 * роутов (там его ловят `catch (err) { if (err instanceof Response) return err }`),
 * но НЕ подходит для page.tsx (Server Component не может «вернуть» Response
 * из throw). Поэтому здесь — тонкая обёртка на чистых boolean-хелперах
 * (ropCanManage/ropCanViewTeam/ropManagerScope), которая сама решает
 * redirect()/notFound() и передаёт наружу типизированный «зритель».
 */
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ropCanManage, ropCanViewTeam, ropManagerScope } from "@/lib/ai-rop/access"

export interface RopViewer {
  id: string
  companyId: string
  role: string
  name: string
  email: string
  effectiveRole?: string | null
  permissions: Record<string, boolean> | null
  /** Видит всю команду (директор/head/rop_view_team). */
  isTeamViewer: boolean
  /** Обычный менеджер — видит только свои звонки (RLS по bitrixManagerId). */
  isManager: boolean
  /** bitrixManagerId, если пользователь привязан как менеджер (rop_managers.userId). */
  bitrixManagerId: string | null
  /** Директор/владелец — доступ к настройкам модуля. */
  canManage: boolean
}

/**
 * Базовый гейт: нужна сессия + компания. Доступен всем ролям компании —
 * дашборд/звонки видит и manager (RLS сузит до своих). Редиректит на /login,
 * если сессии нет.
 */
export async function requireRopViewer(): Promise<RopViewer> {
  const session = await auth()
  const user = session?.user
  if (!user?.id || !user.companyId) {
    redirect("/login")
  }
  const base = { role: user.role as string, effectiveRole: (user.effectiveRole as string) ?? null, permissions: user.permissions ?? null }
  const isTeamViewer = ropCanViewTeam(base)
  const canManage = ropCanManage(base)
  const bitrixManagerId = isTeamViewer
    ? null
    : await ropManagerScope({ id: user.id, companyId: user.companyId as string })

  return {
    id: user.id,
    companyId: user.companyId as string,
    role: base.role,
    name: user.name ?? "",
    email: user.email ?? "",
    effectiveRole: base.effectiveRole,
    permissions: base.permissions,
    isTeamViewer,
    isManager: !isTeamViewer,
    bitrixManagerId,
    canManage,
  }
}

/** Гейт для страниц, недоступных менеджеру (Очередь, Загрузка, разделы аналитики РОПа). */
export async function requireRopTeamViewer(): Promise<RopViewer> {
  const viewer = await requireRopViewer()
  if (!viewer.isTeamViewer) redirect("/ai-rop")
  return viewer
}

/** Гейт настроек модуля — только директор/владелец компании. */
export async function requireRopManageViewer(): Promise<RopViewer> {
  const viewer = await requireRopViewer()
  if (!viewer.canManage) redirect("/ai-rop")
  return viewer
}
