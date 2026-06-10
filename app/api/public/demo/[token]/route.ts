import { NextRequest } from "next/server"
import { eq, and, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, companies, hhResponses } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { buildCandidateDeepLink, generateInviteToken } from "@/lib/telegram/candidate-bot"

// Достаём first/last/city из hh resume. У части записей raw_data — это сам
// resume, у других обёрнут в { resume: ... }. Альтернативные ключи
// (firstName/lastName/имя) тоже встречаются — повторяем подход
// deriveCandidateName в lib/candidate-name.ts.
function pickStr(o: unknown, ...keys: string[]): string | null {
  if (!o || typeof o !== "object") return null
  const obj = o as Record<string, unknown>
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "string" && v.trim().length > 0) return v.trim()
  }
  return null
}

function extractHhPrefill(rawData: unknown): { first_name: string | null; last_name: string | null; city: string | null } {
  const raw = (rawData && typeof rawData === "object") ? rawData as Record<string, unknown> : {}
  const resume = (raw.resume && typeof raw.resume === "object")
    ? raw.resume as Record<string, unknown>
    : raw
  const first_name = pickStr(resume, "first_name", "firstName", "имя")
  const last_name  = pickStr(resume, "last_name", "lastName", "фамилия")
  const area       = (resume.area && typeof resume.area === "object") ? resume.area as Record<string, unknown> : null
  const city       = pickStr(area ?? {}, "name") ?? pickStr(resume, "city", "город")
  return { first_name, last_name, city }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    // Резолв: сначала по short_id, иначе по token (preview/nanoid/uuid).
    const candidateRows = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        vacancyId: candidates.vacancyId,
        anketaAnswers: candidates.anketaAnswers,
        demoProgressJson: candidates.demoProgressJson,
        aiScore: candidates.aiScore,
        source: candidates.source,
        // F7: для deep-link на финальном экране
        telegramInviteToken: candidates.telegramInviteToken,
      })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)

    if (candidateRows.length === 0) {
      return apiError("Кандидат не найден", 404)
    }

    const candidate = candidateRows[0]

    // Find vacancy + company
    const vacancyRows = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        companyId: vacancies.companyId,
        descriptionJson: vacancies.descriptionJson,
        salaryMin: vacancies.salaryMin,
        salaryMax: vacancies.salaryMax,
        city: vacancies.city,
        format: vacancies.format,
        companyName: companies.name,
        companyBrandName: companies.brandName,
        companyLogo: companies.logoUrl,
        brandPrimaryColor: companies.brandPrimaryColor,
        brandBgColor: companies.brandBgColor,
        brandTextColor: companies.brandTextColor,
        // F7: username бота для формирования deep-link на финальном экране
        candidateBotUsername: companies.candidateBotUsername,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(
        // Превью HR (source='preview') показываем даже для черновика/удалённой
        // вакансии — это внутренний предпросмотр. Реальным кандидатам — только
        // не удалённые (deleted_at IS NULL).
        candidate.source === "preview"
          ? eq(vacancies.id, candidate.vacancyId)
          : and(eq(vacancies.id, candidate.vacancyId), isNull(vacancies.deletedAt)),
      )
      .limit(1)

    if (vacancyRows.length === 0) {
      return apiError("Вакансия не найдена", 404)
    }

    const vacancy = vacancyRows[0]

    // Find published demo for this vacancy
    const demoRows = await db
      .select({
        id: demos.id,
        title: demos.title,
        lessonsJson: demos.lessonsJson,
        postDemoSettings: demos.postDemoSettings,
      })
      .from(demos)
      // kind='demo': кандидату отдаём только демонстрацию. Без фильтра запись
      // с kind='test' (таб «Тест», Этап 2.5) могла оказаться новее и подменить
      // демо → кандидат видел пустой тест (критический баг).
      .where(and(eq(demos.vacancyId, vacancy.id), eq(demos.kind, "demo")))
      .orderBy(sql`${demos.updatedAt} DESC`)
      .limit(1)

    if (demoRows.length === 0) {
      return apiError("Демо-курс не найден", 404)
    }

    const demo = demoRows[0]

    // hh prefill — если кандидат пришёл с hh.ru, достаём имя/город из resume.
    // Реферальные/прямые кандидаты hh-записи не имеют — prefill будет null.
    const [hhRow] = await db
      .select({ rawData: hhResponses.rawData })
      .from(hhResponses)
      .where(eq(hhResponses.localCandidateId, candidate.id))
      .limit(1)
    const prefill = hhRow ? extractHhPrefill(hhRow.rawData) : { first_name: null, last_name: null, city: null }

    // Ф5: текст-обёртка анкеты — vacancies.description_json.anketaIntro
    const dj = (vacancy.descriptionJson as Record<string, unknown> | null) ?? {}

    // F4: конфиг видео-интервью — vacancies.description_json.videoIntro.
    // Передаём только questions (для безопасности, минимальный объём).
    const videoIntroRaw = (dj.videoIntro && typeof dj.videoIntro === "object")
      ? dj.videoIntro as Record<string, unknown>
      : null
    const videoIntroQuestions: { text: string; maxDurationSeconds: number }[] = []
    if (videoIntroRaw && Array.isArray(videoIntroRaw.questions)) {
      for (const q of videoIntroRaw.questions) {
        if (q && typeof q === "object") {
          const o = q as Record<string, unknown>
          const text = typeof o.text === "string" ? o.text.trim() : ""
          const maxDurationSeconds = typeof o.maxDurationSeconds === "number" ? o.maxDurationSeconds : 60
          if (text) videoIntroQuestions.push({ text, maxDurationSeconds })
        }
      }
    }
    const videoIntro = videoIntroRaw
      ? {
          required:           typeof videoIntroRaw.required === "boolean" ? videoIntroRaw.required : false,
          instruction:        typeof videoIntroRaw.instruction === "string" ? videoIntroRaw.instruction : "",
          maxDurationSeconds: typeof videoIntroRaw.maxDurationSeconds === "number" ? videoIntroRaw.maxDurationSeconds : 60,
          minDurationSeconds: typeof videoIntroRaw.minDurationSeconds === "number" ? videoIntroRaw.minDurationSeconds : 15,
          thankYouText:       typeof videoIntroRaw.thankYouText === "string" ? videoIntroRaw.thankYouText : "",
          questions:          videoIntroQuestions,
        }
      : null
    const introRaw = (dj.anketaIntro && typeof dj.anketaIntro === "object")
      ? dj.anketaIntro as Record<string, unknown>
      : null
    const anketaIntro = introRaw
      ? {
          title: typeof introRaw.title === "string" ? introRaw.title : "",
          description: typeof introRaw.description === "string" ? introRaw.description : "",
        }
      : null

    // #16/#25: тексты двух финальных экранов из descriptionJson.finalScreens.
    // Если поля не заданы — frontend применит дефолты.
    const finalScreensRaw = (dj.finalScreens && typeof dj.finalScreens === "object")
      ? dj.finalScreens as Record<string, unknown>
      : null
    const finalScreens = finalScreensRaw
      ? {
          afterVideo: {
            title:    typeof (finalScreensRaw.afterVideo as { title?: string } | undefined)?.title    === "string" ? (finalScreensRaw.afterVideo as { title: string }).title    : "",
            subtitle: typeof (finalScreensRaw.afterVideo as { subtitle?: string } | undefined)?.subtitle === "string" ? (finalScreensRaw.afterVideo as { subtitle: string }).subtitle : "",
            button:   typeof (finalScreensRaw.afterVideo as { button?: string } | undefined)?.button   === "string" ? (finalScreensRaw.afterVideo as { button: string }).button   : "",
          },
          afterAnketa: {
            title:    typeof (finalScreensRaw.afterAnketa as { title?: string } | undefined)?.title    === "string" ? (finalScreensRaw.afterAnketa as { title: string }).title    : "",
            subtitle: typeof (finalScreensRaw.afterAnketa as { subtitle?: string } | undefined)?.subtitle === "string" ? (finalScreensRaw.afterAnketa as { subtitle: string }).subtitle : "",
          },
        }
      : null

    // F7: deep-link для кандидата в Telegram — только если у компании подключён бот.
    // Если у кандидата ещё нет invite-токена — генерируем и сохраняем.
    let candidateTelegramDeepLink: string | null = null
    if (vacancy.candidateBotUsername && candidate.source !== "preview") {
      let inviteToken = candidate.telegramInviteToken
      if (!inviteToken) {
        inviteToken = generateInviteToken()
        await db.update(candidates)
          .set({ telegramInviteToken: inviteToken, updatedAt: new Date() })
          .where(eq(candidates.id, candidate.id))
      }
      candidateTelegramDeepLink = buildCandidateDeepLink(vacancy.candidateBotUsername, inviteToken)
    }

    return apiSuccess({
      candidateName: candidate.name,
      vacancyTitle: vacancy.title,
      companyName: vacancy.companyBrandName || vacancy.companyName,
      companyLogo: vacancy.companyLogo,
      brandPrimaryColor: vacancy.brandPrimaryColor,
      brandBgColor: vacancy.brandBgColor,
      brandTextColor: vacancy.brandTextColor,
      salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax,
      city: vacancy.city,
      format: vacancy.format,
      lessons: demo.lessonsJson,
      progress: candidate.demoProgressJson,
      answers: candidate.anketaAnswers,
      aiScore: candidate.aiScore,
      postDemoSettings: demo.postDemoSettings ?? {},
      anketaIntro,
      finalScreens,
      prefill,
      videoIntro,
      candidateTelegramDeepLink,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("GET /api/public/demo/[token]", err)
    return apiError("Internal server error", 500)
  }
}
