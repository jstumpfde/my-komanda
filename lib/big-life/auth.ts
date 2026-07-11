import { requireDirector, apiError } from "@/lib/api-helpers"
import { isPlatformAdminEmail } from "@/lib/platform/auth"
import { BIGLIFE_COMPANY_ID as BIGLIFE_COMPANY_ID_DEFAULT } from "@/lib/big-life/constants"

// Big Life заведён как полноценный тенант (0271) — доступ имеют director/client
// САМОЙ компании Big Life (через requireDirector(), включая партнёра под
// "Войти как клиент" — impersonation свапает companyId+effectiveRole
// прозрачно, см. lib/partner/impersonation.ts), а также владелец платформы —
// проверка ролью НЕДОСТАТОЧНА (владелец обычно role="director" своей ЛИЧНОЙ
// компании, платформенный статус даёт только email из PLATFORM_ADMIN_EMAILS,
// см. auth.ts session.user.isPlatformAdmin / тот же паттерн, что уже ловили
// на app/api/admin/clients/[id]/modules/route.ts 03.07). Владельцу/platform_admin
// ПОДМЕНЯЕМ companyId на Big Life — иначе все нижестоящие WHERE company_id=...
// фильтруют по ЕГО СОБСТВЕННОЙ компании, и publish() тихо перезаписал бы живую
// страницу пустым списком.
const BIGLIFE_COMPANY_ID = process.env.BIGLIFE_COMPANY_ID || BIGLIFE_COMPANY_ID_DEFAULT

export async function requireBigLifeAccess() {
  const user = await requireDirector()
  const isPlatformStaff =
    user.role === "platform_admin" || user.role === "admin" || isPlatformAdminEmail(user.email)
  if (!isPlatformStaff && user.companyId !== BIGLIFE_COMPANY_ID) {
    throw apiError("Forbidden", 403)
  }
  return isPlatformStaff ? { ...user, companyId: BIGLIFE_COMPANY_ID } : user
}
