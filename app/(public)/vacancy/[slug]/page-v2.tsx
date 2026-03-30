/**
 * Публичная страница вакансии (без авторизации).
 * URL: /vacancy/[slug]
 */
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import { ApplyFormV2 } from "./apply-form-v2"
import { MapPin, Briefcase, Clock, Banknote } from "lucide-react"

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublicVacancyPageV2({ params }: Props) {
  const { slug } = await params

  const [row] = await db
    .select({
      vacancy: vacancies,
      company: { name: companies.name },
    })
    .from(vacancies)
    .leftJoin(companies, eq(companies.id, vacancies.companyId))
    .where(eq(vacancies.slug, slug))
    .limit(1)

  if (!row || row.vacancy.status !== "published") notFound()

  const { vacancy, company } = row

  const FORMAT_LABELS: Record<string, string> = {
    office: "Офис", hybrid: "Гибрид", remote: "Удалённо",
  }
  const EMPLOYMENT_LABELS: Record<string, string> = {
    full: "Полная занятость", part: "Частичная занятость",
    project: "Проектная работа", internship: "Стажировка",
  }

  const description = (vacancy.descriptionJson as { blocks?: Array<{ content: string }> } | null)
    ?.blocks?.map((b) => b.content).join("\n\n") ?? ""

  return (
    <div className="min-h-screen bg-background">
      {/* Шапка */}
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="w-4 h-4" />
            <span className="font-medium text-foreground">{company?.name ?? "Компания"}</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Заголовок */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{vacancy.title}</h1>

          <div className="flex flex-wrap gap-3">
            {vacancy.city && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                <MapPin className="w-3.5 h-3.5" />
                {vacancy.city}
              </span>
            )}
            {vacancy.format && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                <Clock className="w-3.5 h-3.5" />
                {FORMAT_LABELS[vacancy.format] ?? vacancy.format}
              </span>
            )}
            {vacancy.employment && (
              <span className="text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                {EMPLOYMENT_LABELS[vacancy.employment] ?? vacancy.employment}
              </span>
            )}
            {(vacancy.salaryMin || vacancy.salaryMax) && (
              <span className="flex items-center gap-1.5 text-sm font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full">
                <Banknote className="w-3.5 h-3.5" />
                {vacancy.salaryMin ? `от ${vacancy.salaryMin.toLocaleString("ru")} ₽` : ""}
                {vacancy.salaryMax ? ` до ${vacancy.salaryMax.toLocaleString("ru")} ₽` : ""}
              </span>
            )}
          </div>
        </div>

        {/* Описание */}
        {description && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <h2 className="text-lg font-semibold mb-3">О вакансии</h2>
            <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {description}
            </p>
          </div>
        )}

        {/* Форма отклика */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Откликнуться на вакансию</h2>
          <ApplyFormV2 slug={slug} vacancyTitle={vacancy.title} />
        </div>
      </main>

      <footer className="border-t mt-16 py-6 text-center text-xs text-muted-foreground">
        Платформа my-komanda
      </footer>
    </div>
  )
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const [row] = await db
    .select({ title: vacancies.title })
    .from(vacancies)
    .where(eq(vacancies.slug, slug))
    .limit(1)
  return { title: row ? `${row.title} — my-komanda` : "Вакансия" }
}
