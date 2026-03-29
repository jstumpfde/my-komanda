import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { inviteLinks, companies, users } from "@/lib/db/schema"
import { eq, and, or, isNull, gt } from "drizzle-orm"
import { auth } from "@/auth"
import AcceptInviteClient from "./accept-client"

interface Props {
  params: Promise<{ token: string }>
}

const ROLE_LABELS: Record<string, string> = {
  director:        "Директор",
  hr_lead:         "Главный HR",
  hr_manager:      "HR-менеджер",
  department_head: "Руководитель отдела",
  observer:        "Наблюдатель",
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params

  // Ищем ссылку: активную, не истёкшую, с запасом использований
  const [link] = await db
    .select({
      id:        inviteLinks.id,
      role:      inviteLinks.role,
      label:     inviteLinks.label,
      maxUses:   inviteLinks.maxUses,
      usesCount: inviteLinks.usesCount,
      expiresAt: inviteLinks.expiresAt,
      companyId: inviteLinks.companyId,
      companyName: companies.name,
    })
    .from(inviteLinks)
    .innerJoin(companies, eq(inviteLinks.companyId, companies.id))
    .where(
      and(
        eq(inviteLinks.token, token),
        eq(inviteLinks.isActive, true),
        or(isNull(inviteLinks.expiresAt), gt(inviteLinks.expiresAt, new Date())),
      )
    )
    .limit(1)

  if (!link) notFound()

  // Лимит использований исчерпан?
  if (link.maxUses !== null && (link.usesCount ?? 0) >= link.maxUses) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full text-center space-y-3">
          <p className="text-2xl font-semibold">Ссылка недействительна</p>
          <p className="text-muted-foreground text-sm">
            Эта ссылка-приглашение уже была использована. Запросите новую у администратора.
          </p>
        </div>
      </div>
    )
  }

  const session = await auth()

  // Если пользователь уже авторизован и принадлежит этой компании — просто редиректим
  if (session?.user?.companyId === link.companyId) {
    redirect("/overview")
  }

  return (
    <AcceptInviteClient
      token={token}
      companyName={link.companyName}
      roleLabel={ROLE_LABELS[link.role] ?? link.role}
      label={link.label}
      isLoggedIn={!!session?.user}
      currentCompany={session?.user?.companyId ?? null}
    />
  )
}
