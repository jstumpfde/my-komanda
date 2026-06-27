"use server"

// «Войти в компанию» для платформ-админа (Юрий 27.06) — вход в ЛЮБОЙ тенант,
// чтобы посмотреть/настроить его (напр. найм у клиента партнёра, без логина клиента).
// Использует тот же подписанный механизм impersonation, что и партнёры, но в режиме
// mode="admin": getActingAs() на каждом запросе перепроверяет, что пользователь —
// платформ-админ. Выход — exitAdminImpersonation (или общий баннер acting-as).

import { redirect } from "next/navigation"
import { requirePlatformAdmin } from "@/lib/api-helpers"
import { setActingAs, clearActingAs } from "@/lib/partner/impersonation"

export async function enterCompanyAsAdmin(companyId: string): Promise<void> {
  const user = await requirePlatformAdmin()
  if (!companyId) return
  await setActingAs({
    mode: "admin",
    clientCompanyId: companyId,
    integratorId: "",
    realUserId: user.id as string,
  })
  console.log("[admin-impersonation] enter", { companyId, by: user.id })
  redirect("/")
}

export async function exitAdminImpersonation(): Promise<void> {
  await clearActingAs()
  redirect("/admin/clients")
}
