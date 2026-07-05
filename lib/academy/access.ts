import { requireCompany, apiError } from "@/lib/api-helpers"
import { isOwnerEmail } from "@/lib/owner"

// Доступ к «Академии продукта» — внутреннему разделу обучения СОТРУДНИКОВ
// компании-владельца платформы (Company24), НЕ клиентов. По образцу
// lib/outreach/access.ts (модуль «Емайл маркетинг»): в системе нет отдельного
// tenant-id «наша компания» (см. разведку) — гейтим по email-белому списку
// владельца-полигона (lib/owner.ts), как и видимость пункта меню в sidebar.
export async function requireAcademyAccess() {
  const user = await requireCompany()
  if (!isOwnerEmail(user.email)) throw apiError("Forbidden", 403)
  return user as typeof user & { companyId: string; id?: string }
}
