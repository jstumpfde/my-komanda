import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, legalDocuments } from "@/lib/db/schema"
import { generateDefaultPrivacyPolicy } from "@/lib/legal/default-privacy-policy"

export const dynamic = "force-dynamic"

const PROSE_CLASS = [
  "prose prose-gray max-w-none text-[15px] leading-relaxed",
  "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4",
  "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3",
  "[&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
  "[&_p]:mb-4",
  "[&_p.lead]:text-sm [&_p.lead]:text-gray-500 [&_p.lead]:mb-6",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-1",
  "[&_strong]:font-semibold",
  "[&_a]:text-blue-600 [&_a]:underline",
  "[&_hr]:my-6 [&_hr]:border-gray-200",
].join(" ")

interface PolicyData {
  title:    string
  html:     string
  updatedAt: Date | null
}

async function getCompanyPolicy(slug: string): Promise<PolicyData | null> {
  const [company] = await db
    .select({
      name:                   companies.name,
      inn:                    companies.inn,
      legalAddress:           companies.legalAddress,
      email:                  companies.email,
      privacyPolicyHtml:      companies.privacyPolicyHtml,
      privacyPolicyUpdatedAt: companies.privacyPolicyUpdatedAt,
    })
    .from(companies)
    .where(eq(companies.subdomain, slug))
    .limit(1)

  if (!company) return null

  if (company.privacyPolicyHtml) {
    return {
      title:     "Политика конфиденциальности",
      html:      company.privacyPolicyHtml,
      updatedAt: company.privacyPolicyUpdatedAt,
    }
  }

  // Fallback — генерируем дефолтный шаблон, если у компании достаточно реквизитов.
  if (company.inn && company.email) {
    const html = generateDefaultPrivacyPolicy({
      name:         company.name,
      inn:          company.inn,
      legalAddress: company.legalAddress,
      email:        company.email,
    })
    return {
      title:     "Политика конфиденциальности",
      html,
      updatedAt: null,
    }
  }

  return null
}

async function getCentralPolicy(): Promise<PolicyData | null> {
  const [doc] = await db
    .select({
      title:       legalDocuments.title,
      contentHtml: legalDocuments.contentHtml,
      updatedAt:   legalDocuments.updatedAt,
    })
    .from(legalDocuments)
    .where(eq(legalDocuments.slug, "privacy_policy"))
    .limit(1)

  if (!doc) return null
  return { title: doc.title, html: doc.contentHtml, updatedAt: doc.updatedAt }
}

export default async function PolitikaHr2026Page({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>
}) {
  const params = await searchParams
  const slug = (params.company ?? "").trim()

  const policy = slug ? await getCompanyPolicy(slug) : await getCentralPolicy()

  const versionLabel = policy?.updatedAt
    ? `Версия от ${new Date(policy.updatedAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}`
    : "Версия по умолчанию"

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-3xl bg-white rounded-xl shadow-sm p-8 sm:p-12">
        <div className="mb-8 pb-6 border-b">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {policy?.title ?? "Политика конфиденциальности"}
          </h1>
        </div>

        {policy ? (
          <div
            className={PROSE_CLASS}
            dangerouslySetInnerHTML={{ __html: policy.html }}
          />
        ) : (
          <div className="text-sm text-gray-500">
            Документ временно недоступен. Попробуйте позже.
          </div>
        )}

        <div className="mt-12 pt-6 border-t text-xs text-gray-400 flex items-center justify-between">
          <span>{versionLabel}</span>
          <span>Powered by Company24</span>
        </div>
      </div>
    </div>
  )
}
