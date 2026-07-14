import { NextRequest } from "next/server"
import { eq, and, isNull, sql, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos, vacancies, companies, candidates, legalDocuments } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { checkPublicTokenRateLimit } from "@/lib/public/rate-limit-public"
import { normalizePhone } from "@/lib/candidates/normalize-contacts"
import { generateCandidateShortId } from "@/lib/short-id"
import { generateCandidateToken } from "@/lib/candidate-tokens"

// Публичный вход по УНИВЕРСАЛЬНОЙ (обезличенной) ссылке на контент-блок
// вакансии — /start/[publicToken] (см. drizzle/0278). В отличие от
// персональных /demo/[token] и /test/[token], эта ссылка не привязана ни к
// одному кандидату: её можно безопасно рассылать массово (рассылка,
// объявление, чат) — каждый заполнивший форму получает СВОЮ карточку.
//
// GET  — брендинг вакансии + название блока для формы идентификации.
// POST — { name, phone, consent } → матчинг/создание кандидата ВНУТРИ
//        вакансии по нормализованному телефону → redirectUrl на его
//        персональный /demo или /test с ?block=<id этого же блока>.

async function resolveBlockByPublicToken(token: string) {
  const [row] = await db
    .select({
      demoId:       demos.id,
      title:        demos.title,
      contentType:  demos.contentType,
      vacancyId:    demos.vacancyId,
      vacancyTitle: vacancies.title,
      companyId:            vacancies.companyId,
      companyName:          companies.name,
      companyBrandName:     companies.brandName,
      companyLogo:          companies.logoUrl,
      companySubdomain:     companies.subdomain,
      brandPrimaryColor:    companies.brandPrimaryColor,
      brandBgColor:         companies.brandBgColor,
      brandTextColor:       companies.brandTextColor,
    })
    .from(demos)
    .innerJoin(vacancies, eq(demos.vacancyId, vacancies.id))
    .innerJoin(companies, eq(vacancies.companyId, companies.id))
    .where(and(eq(demos.publicToken, token), isNull(vacancies.deletedAt)))
    .limit(1)
  return row ?? null
}

// GET /api/public/start/[token] — брендинг + название блока (без раскрытия
// кандидатов/статистики — безопасность S-5).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (!checkPublicTokenRateLimit(req, "start-get")) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }
    const { token } = await params
    const block = await resolveBlockByPublicToken(token)
    if (!block) return apiError("Ссылка недействительна", 404)

    return apiSuccess({
      blockTitle:        block.title,
      contentType:       block.contentType,
      vacancyTitle:       block.vacancyTitle,
      companyName:        block.companyBrandName || block.companyName,
      companyLogo:        block.companyLogo,
      companySubdomain:   block.companySubdomain,
      brandPrimaryColor:  block.brandPrimaryColor,
      brandBgColor:       block.brandBgColor,
      brandTextColor:     block.brandTextColor,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[public/start GET]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}

// 152-ФЗ: редакция политики компании на момент согласия. Копия
// resolveHrPolicyVersion из app/api/public/demo/[token]/apply/route.ts —
// не экспортирована оттуда, а тянуть shared-модуль ради 20 строк ради
// одного новорождённого роута не стали (см. комментарий там же).
async function resolveHrPolicyVersion(vacancyId: string): Promise<string> {
  try {
    const [company] = await db
      .select({
        subdomain:              companies.subdomain,
        privacyPolicyHtml:      companies.privacyPolicyHtml,
        privacyPolicyUpdatedAt: companies.privacyPolicyUpdatedAt,
        inn:                    companies.inn,
        email:                  companies.email,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(eq(vacancies.id, vacancyId))
      .limit(1)
    if (company?.subdomain) {
      if (company.privacyPolicyHtml) {
        return company.privacyPolicyUpdatedAt
          ? `company:${company.privacyPolicyUpdatedAt.toISOString().slice(0, 10)}`
          : "company:default"
      }
      if (company.inn && company.email) return "company:default"
    }
    const [doc] = await db
      .select({ updatedAt: legalDocuments.updatedAt })
      .from(legalDocuments)
      .where(eq(legalDocuments.slug, "privacy_policy"))
      .limit(1)
    return doc?.updatedAt ? doc.updatedAt.toISOString().slice(0, 10) : "default"
  } catch {
    return "default"
  }
}

function buildRedirectUrl(
  contentType: string,
  target: { id: string; shortId: string | null; token: string },
  demoId: string,
): string {
  const idPart = target.shortId ?? target.token
  if (contentType === "test" || contentType === "task") {
    return `/test/${idPart}?block=${demoId}`
  }
  // presentation (демо): c=<id кандидата> нужен только для формата short_id,
  // чтобы page.tsx (app/(public)/demo/[token]/page.tsx) сразу признал
  // визитёра владельцем ссылки и НЕ ушёл в bounce-логику /visit (та самая
  // логика, из-за которой персональные ссылки нельзя шарить массово — см.
  // комментарий в drizzle/0278). Для nanoid-токенов (нет short_id) page.tsx
  // и так рендерит напрямую без реферальной логики (isShortId=false).
  const cParam = target.shortId ? `&c=${target.id}` : ""
  return `/demo/${idPart}?block=${demoId}${cParam}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Роут СОЗДАЁТ кандидатов — лимит строже дефолтных 120/мин у GET-токен-роутов.
    if (!checkPublicTokenRateLimit(req, "start-post", 20)) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }
    const { token } = await params
    const body = (await req.json().catch(() => null)) as { name?: string; phone?: string; consent?: boolean } | null
    if (!body) return apiError("Некорректный запрос", 400)

    const name = (body.name ?? "").trim()
    const phoneRaw = (body.phone ?? "").trim()
    if (!name || !phoneRaw) return apiError("Заполните имя и телефон", 400)

    // 152-ФЗ: как и в анкете демо — явный отказ несовместим с отправкой формы.
    if (body.consent === false) return apiError("Нужно согласие на обработку персональных данных", 400)
    const consentGiven = body.consent === true

    const phoneNorm = normalizePhone(phoneRaw)
    if (!phoneNorm) return apiError("Некорректный телефон", 400)

    const block = await resolveBlockByPublicToken(token)
    if (!block) return apiError("Ссылка недействительна", 404)

    // Матчинг ВНУТРИ вакансии по нормализованному телефону. Находка
    // predeploy-guard 14.07 (blocker): продолжать сессию найденного кандидата
    // НЕЛЬЗЯ — телефон не секрет, редирект на личную страницу раскрывал бы
    // третьему лицу имя/ответы и персональный токен чужого кандидата (152-ФЗ,
    // IDOR). Поэтому при совпадении возвращаем НЕЙТРАЛЬНЫЙ ответ без каких-либо
    // данных и без redirectUrl — кандидат продолжает по своей персональной
    // ссылке из переписки; новый телефон идёт полным потоком ниже.
    //
    // ⚠ '[^0-9]', НЕ '\D': drizzle-orm `sql` template использует «cooked»
    // строки (не .raw) — одиночный '\D' внутри sql`...` молча схлопывается в
    // 'D' (JS дропает backslash перед нераспознанным escape-символом), и
    // regexp_replace(..., 'D', ...) вообще ничего не режет — дедуп никогда не
    // матчился. Обнаружено живым прогоном этой фичи (см. отчёт); тот же
    // паттерн '\D' скопирован и в app/api/public/demo/[token]/apply/route.ts
    // (dupConds) — вероятно, страдает тем же багом, но это чужой файл, не
    // трогаем в рамках этой задачи. Символьный класс без backslash — надёжнее.
    const [existing] = await db
      .select({ id: candidates.id, shortId: candidates.shortId, token: candidates.token, consentAt: candidates.consentAt })
      .from(candidates)
      .where(and(
        eq(candidates.vacancyId, block.vacancyId),
        sql`regexp_replace(coalesce(${candidates.phone}, ''), '[^0-9]', '', 'g') = ${phoneNorm}`,
      ))
      .orderBy(desc(candidates.updatedAt))
      .limit(1)

    if (existing) {
      // Ничего не раскрываем и не редиректим (см. комментарий выше). Даже
      // consent не обновляем — личность отправителя формы не подтверждена.
      return apiSuccess({ alreadyCandidate: true })
    }

    // Новый кандидат — источник 'universal_link' (отличим от 'demo'/'hh'/etc в отчётах).
    const consentDocVersion = consentGiven ? await resolveHrPolicyVersion(block.vacancyId) : null
    const created = await db.transaction(async (tx) => {
      const short = await generateCandidateShortId(tx, block.vacancyId)
      const [row] = await tx
        .insert(candidates)
        .values({
          vacancyId:          block.vacancyId,
          name,
          phone:              phoneRaw,
          source:             "universal_link",
          stage:              "new",
          token:              generateCandidateToken(),
          shortId:            short?.shortId ?? null,
          sequenceNumber:     short?.sequenceNumber ?? null,
          consentAt:          consentGiven ? new Date() : null,
          consentDocVersion:  consentGiven ? consentDocVersion : null,
          lastActivityAt:     new Date(),
        })
        .returning()
      return row
    })

    return apiSuccess({
      redirectUrl: buildRedirectUrl(block.contentType, { id: created.id, shortId: created.shortId, token: created.token }, block.demoId),
    }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[public/start POST]", err)
    return apiError("Внутренняя ошибка сервера", 500)
  }
}
