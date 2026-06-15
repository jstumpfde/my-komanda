// Guard: /partner/* — только для внешних партнёров (роль partner).
// Остальные роли получают 404 (скрываем раздел, как в /admin).

import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { isPartnerRole, type UserRole } from "@/lib/roles"

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const role = session?.user?.role as UserRole | undefined
  if (!role || !isPartnerRole(role)) {
    notFound()
  }
  return <>{children}</>
}
