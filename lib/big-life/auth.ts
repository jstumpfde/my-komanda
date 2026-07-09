import { requireDirector, apiError } from "@/lib/api-helpers"

// Big Life заведён как полноценный тенант (0271) — доступ имеют director/client
// САМОЙ компании Big Life (через requireDirector(), включая партнёра под
// "Войти как клиент" — impersonation свапает companyId+effectiveRole
// прозрачно, см. lib/partner/impersonation.ts), а также владелец платформы
// (role platform_admin/admin, вне зависимости от того, в какой компании его
// сессия — это его собственный аккаунт, не клиентский).
const BIGLIFE_COMPANY_ID = process.env.BIGLIFE_COMPANY_ID || "a39c8844-2e7a-4adb-bb29-8645b2fbc9ff"

export async function requireBigLifeAccess() {
  const user = await requireDirector()
  const isPlatformStaff = user.role === "platform_admin" || user.role === "admin"
  if (!isPlatformStaff && user.companyId !== BIGLIFE_COMPANY_ID) {
    throw apiError("Forbidden", 403)
  }
  return user
}
