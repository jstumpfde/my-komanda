import { requireCompany, apiError } from "@/lib/api-helpers"
import { isOwnerEmail } from "@/lib/owner"

// Доступ к модулю «Емайл маркетинг». Пока обкатывается — только владелец-полигон
// (как и видимость в меню через isOwner). Позже расширим на клиентов по enabled_modules.
export async function requireOutreachAccess() {
  const user = await requireCompany()
  if (!isOwnerEmail(user.email)) throw apiError("Forbidden", 403)
  return user as typeof user & { companyId: string; id?: string }
}
