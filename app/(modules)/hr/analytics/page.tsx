import { redirect } from "next/navigation"
import { auth } from "@/auth"
import type { UserRole } from "@/lib/auth"

const ALLOWED_ROLES: UserRole[] = ["platform_admin", "admin", "director", "client", "hr_lead"]

export default async function HrAnalyticsPage() {
  const session = await auth()
  const role = session?.user?.role as UserRole | undefined

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <h1 className="text-xl font-semibold mb-2">Доступ ограничен</h1>
        <p className="text-sm text-muted-foreground">У вас нет доступа к этому разделу.</p>
      </div>
    )
  }

  redirect("/hr/dashboard?tab=analytics")
}
