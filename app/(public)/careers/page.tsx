// Публичная «карьерная» страница компании для поддомена {sub}.company24.pro.
// Middleware переписывает корень поддомена сюда (?sub=...). Резолвит компанию по
// companies.subdomain и показывает её опубликованные вакансии со ссылками на
// /vacancy/{slug}. Серверный компонент — данные прямо из БД.
import { db } from "@/lib/db"
import { companies, vacancies } from "@/lib/db/schema"
import { and, eq, isNull, or, desc } from "drizzle-orm"
import Link from "next/link"

export const dynamic = "force-dynamic"

function NotFound({ sub }: { sub?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Страница не найдена</h1>
        <p className="text-slate-500">
          {sub ? <>Поддомен <code className="font-mono">{sub}.company24.pro</code> не привязан к компании.</> : "Компания не указана."}
        </p>
      </div>
    </main>
  )
}

export default async function CareersPage({ searchParams }: { searchParams: Promise<{ sub?: string }> }) {
  const { sub } = await searchParams
  const subdomain = (sub ?? "").trim().toLowerCase()
  if (!subdomain) return <NotFound />

  const [company] = await db.select().from(companies)
    .where(eq(companies.subdomain, subdomain)).limit(1)
  if (!company) return <NotFound sub={subdomain} />

  const vacs = await db
    .select({
      slug: vacancies.slug, title: vacancies.title, city: vacancies.city,
      salaryFrom: vacancies.salaryMin, salaryTo: vacancies.salaryMax,
    })
    .from(vacancies)
    .where(and(
      eq(vacancies.companyId, company.id),
      or(eq(vacancies.status, "active"), eq(vacancies.status, "published")),
      isNull(vacancies.deletedAt),
    ))
    .orderBy(desc(vacancies.createdAt))

  const name = (company.brandName?.trim() || company.name?.trim() || "Компания") as string
  const slogan = (company.brandSlogan?.trim() || "") as string
  const logo = company.logoUrl as string | null

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-6 py-8 flex items-center gap-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={name} className="w-14 h-14 rounded-xl object-contain bg-white border p-1" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-slate-900 text-white flex items-center justify-center text-2xl font-bold">{name.charAt(0)}</div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{name}</h1>
            {slogan && <p className="text-slate-500 text-sm mt-0.5">{slogan}</p>}
          </div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Открытые вакансии {vacs.length > 0 && <span className="text-slate-400 font-normal">· {vacs.length}</span>}
        </h2>
        {vacs.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center text-slate-500">
            Сейчас нет открытых вакансий. Загляните позже.
          </div>
        ) : (
          <div className="space-y-3">
            {vacs.map(v => {
              const salary = v.salaryFrom && v.salaryTo
                ? `${v.salaryFrom.toLocaleString("ru-RU")} – ${v.salaryTo.toLocaleString("ru-RU")} ₽`
                : v.salaryFrom ? `от ${v.salaryFrom.toLocaleString("ru-RU")} ₽` : ""
              return (
                <Link key={v.slug} href={`/vacancy/${v.slug}`}
                  className="block bg-white rounded-xl border p-5 hover:border-slate-400 hover:shadow-sm transition-all">
                  <h3 className="text-base font-semibold text-slate-900">{v.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {[v.city, salary].filter(Boolean).join(" · ") || "Подробности в вакансии"}
                  </p>
                </Link>
              )
            })}
          </div>
        )}
        <p className="text-center text-xs text-slate-400 mt-10">Powered by Company24</p>
      </section>
    </main>
  )
}
