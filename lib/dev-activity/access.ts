// Кто видит раздел /admin/dev-activity и читает его API.
//
// Это приватный инструмент владельца. Пускаем:
//   • владельца-полигон (OWNER_EMAILS);
//   • платформенных админов (PLATFORM_ADMIN_EMAILS) — там email Юрия для админки;
//   • поимённый список DEV_ACTIVITY_EMAILS (кому Юрий выдаёт доступ).

import { isOwnerEmail } from "@/lib/owner"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

export function canSeeDevActivity(email?: string | null): boolean {
  if (!email) return false
  if (isOwnerEmail(email)) return true
  if (isPlatformAdminEmail(email)) return true
  const raw = process.env.DEV_ACTIVITY_EMAILS ?? ""
  const list = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.trim().toLowerCase())
}
