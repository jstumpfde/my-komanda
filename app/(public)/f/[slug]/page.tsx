// Публичная форма Резерва по tracking-ссылке /f/{slug}. Резолвит ссылку,
// считает клик, показывает бренд компании + форму (SubmitForm).
import { db } from "@/lib/db"
import { formTrackingLinks, talentForms, companies } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { SubmitForm } from "./submit-form"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const [link] = await db.select().from(formTrackingLinks)
    .where(eq(formTrackingLinks.slug, slug)).limit(1)
  if (!link) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Ссылка не найдена</h1>
          <p className="text-slate-500">Возможно, форма была удалена или ссылка устарела.</p>
        </div>
      </main>
    )
  }

  // Клик (fire-and-forget, не блокируем рендер ошибкой).
  db.update(formTrackingLinks).set({ clicks: sql`${formTrackingLinks.clicks} + 1` })
    .where(eq(formTrackingLinks.id, link.id)).catch(() => {})

  const [company] = await db.select({ name: companies.name, brandName: companies.brandName, logoUrl: companies.logoUrl })
    .from(companies).where(eq(companies.id, link.companyId)).limit(1)

  let title = link.name || "Анкета кандидата"
  if (link.formId) {
    const [form] = await db.select({ name: talentForms.name }).from(talentForms)
      .where(eq(talentForms.id, link.formId)).limit(1)
    if (form?.name) title = form.name
  }

  return (
    <SubmitForm
      slug={slug}
      companyName={(company?.brandName?.trim() || company?.name?.trim() || "Компания") as string}
      logo={(company?.logoUrl as string | null) ?? null}
      title={title}
      slogan=""
    />
  )
}
