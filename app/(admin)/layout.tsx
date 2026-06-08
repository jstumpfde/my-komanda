// Guard: /admin/* доступен только платформенным ролям (platform_admin, platform_manager).
// Обычные клиентские роли (director, hr_lead, …) получают 404 — скрываем сам факт
// существования раздела (такой же подход принят в /admin/platform/layout.tsx).

import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { isPlatformRole, type UserRole } from "@/lib/roles"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const role = session?.user?.role as UserRole | undefined
  const email = session?.user?.email
  // Доступ: платформенная роль ИЛИ платформенный email (PLATFORM_ADMIN_EMAILS).
  // Email-вариант нужен владельцу с legacy-ролью client (jstumpf.de@gmail.com).
  const allowed = (role && isPlatformRole(role)) || isPlatformAdminEmail(email)
  if (!allowed) {
    notFound()
  }
  return <>{children}</>
}
