import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { legalDocuments } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

const PROSE_CLASS = [
  "prose prose-gray max-w-none text-[15px] leading-relaxed",
  "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3",
  "[&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
  "[&_p]:mb-4",
  "[&_p.lead]:text-sm [&_p.lead]:text-gray-500 [&_p.lead]:mb-6",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-1",
  "[&_strong]:font-semibold",
  "[&_hr]:my-6 [&_hr]:border-gray-200",
].join(" ")

async function getPolicy() {
  const [doc] = await db
    .select({
      title:       legalDocuments.title,
      contentHtml: legalDocuments.contentHtml,
      updatedAt:   legalDocuments.updatedAt,
    })
    .from(legalDocuments)
    .where(eq(legalDocuments.slug, "privacy_policy"))
    .limit(1)
  return doc ?? null
}

export default async function PolitikaHr2026Page() {
  const doc = await getPolicy()

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-3xl bg-white rounded-xl shadow-sm p-8 sm:p-12">
        <div className="mb-8 pb-6 border-b">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {doc?.title ?? "Политика конфиденциальности"}
          </h1>
        </div>

        {doc ? (
          <div
            className={PROSE_CLASS}
            dangerouslySetInnerHTML={{ __html: doc.contentHtml }}
          />
        ) : (
          <div className="text-sm text-gray-500">
            Документ временно недоступен. Попробуйте позже.
          </div>
        )}
      </div>
    </div>
  )
}
