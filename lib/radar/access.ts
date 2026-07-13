import { requireCompany, apiError } from "@/lib/api-helpers"
import { isOwnerEmail } from "@/lib/owner"

// Доступ к модулю «Радар контента» (/kwigtg). Пока обкатывается — только
// владелец-полигон (как и видимость самого раздела). Позже расширим на клиентов
// по enabled_modules. Возвращаем 403 в API; страница даёт 404 (layout) — скрываем.
export async function requireRadarAccess() {
  const user = await requireCompany()
  if (!isOwnerEmail(user.email)) throw apiError("Forbidden", 403)
  return user as typeof user & { companyId: string; id: string; email: string }
}
