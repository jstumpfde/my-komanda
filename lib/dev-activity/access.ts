// Кто видит раздел /admin/dev-activity и читает его API.
//
// Выравнено с гейтом всей админки (app/(admin)/layout.tsx): пускаем по
// платформенной РОЛИ ИЛИ по email. Иначе админ-аккаунт без email в списке
// видел бы всю админку, но на этой странице получал 404.
//   • владелец-полигон (OWNER_EMAILS);
//   • платформенная роль (isPlatformRole);
//   • платформенный email (PLATFORM_ADMIN_EMAILS);
//   • поимённый список DEV_ACTIVITY_EMAILS.

import { isOwnerEmail } from "@/lib/owner"
import { isPlatformAdminEmail } from "@/lib/platform/auth"
import { isPlatformRole, type UserRole } from "@/lib/roles"

export function canSeeDevActivity(email?: string | null, role?: string | null): boolean {
  if (isOwnerEmail(email)) return true
  if (role && isPlatformRole(role as UserRole)) return true
  if (isPlatformAdminEmail(email)) return true
  const raw = process.env.DEV_ACTIVITY_EMAILS ?? ""
  const list = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!email && list.includes(email.trim().toLowerCase())
}
