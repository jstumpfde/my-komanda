import { NextRequest } from "next/server"
import { eq, and, isNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, companies, testSubmissions } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"

// Публичный API теста. Безопасность как у /demo/[token]: token (short_id или
// token кандидата) — единственный ключ; вакансия берётся по candidate.vacancyId,
// доступа к чужим вакансиям нет. Тест — запись demos с kind='test'.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    const [candidate] = await db
      .select({ id: candidates.id, name: candidates.name, vacancyId: candidates.vacancyId, source: candidates.source })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)
    if (!candidate) return apiError("Кандидат не найден", 404)

    const [vacancy] = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        companyName: companies.name,
        companyBrandName: companies.brandName,
        brandPrimaryColor: companies.brandPrimaryColor,
        brandBgColor: companies.brandBgColor,
        brandTextColor: companies.brandTextColor,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(and(eq(vacancies.id, candidate.vacancyId), isNull(vacancies.deletedAt)))
      .limit(1)
    if (!vacancy) return apiError("Вакансия не найдена", 404)

    // Тест вакансии — demos kind='test' (фильтр kind обязателен, см. критич. фикс).
    const [demo] = await db
      .select({ id: demos.id, title: demos.title, lessonsJson: demos.lessonsJson, postDemoSettings: demos.postDemoSettings })
      .from(demos)
      .where(and(eq(demos.vacancyId, candidate.vacancyId), eq(demos.kind, "test")))
      .orderBy(desc(demos.updatedAt))
      .limit(1)
    if (!demo) return apiError("Тест не найден", 404)

    // Уже отправлял? — клиент покажет экран «Спасибо» (только при submitted_at;
    // черновик-автосохранение НЕ считается отправкой).
    const [existing] = await db
      .select({ id: testSubmissions.id, submittedAt: testSubmissions.submittedAt })
      .from(testSubmissions)
      .where(eq(testSubmissions.candidateId, candidate.id))
      .orderBy(desc(testSubmissions.submittedAt))
      .limit(1)

    // Открытие теста реальным кандидатом (не превью HR): отмечаем активность
    // (фильтр «активны сейчас») и заводим пустой черновик, если записи ещё нет —
    // чтобы в колонке «Тест» появилось «пер.» ещё до первого ответа.
    if (candidate.source !== "preview") {
      await db.update(candidates).set({ lastActivityAt: new Date() }).where(eq(candidates.id, candidate.id))
      if (!existing) {
        await db.insert(testSubmissions).values({
          candidateId: candidate.id,
          demoId:      demo.id,
          answersJson: { answers: [], objective: null },
          submittedAt: null,
        }).onConflictDoNothing()
      }
    }

    const pds = (demo.postDemoSettings && typeof demo.postDemoSettings === "object")
      ? demo.postDemoSettings as Record<string, unknown> : {}

    return apiSuccess({
      candidateName: candidate.name,
      vacancyTitle: vacancy.title,
      companyName: vacancy.companyBrandName || vacancy.companyName,
      brand: {
        primary: vacancy.brandPrimaryColor,
        bg: vacancy.brandBgColor,
        text: vacancy.brandTextColor,
      },
      lessons: Array.isArray(demo.lessonsJson) ? demo.lessonsJson : [],
      settings: {
        instructions: typeof pds.testTaskInstructions === "string" ? pds.testTaskInstructions : "",
        deadlineDays: typeof pds.testDeadlineDays === "number" ? pds.testDeadlineDays : null,
        responseFormat: pds.testResponseFormat === "file" || pds.testResponseFormat === "both" ? pds.testResponseFormat : "text",
      },
      alreadySubmitted: Boolean(existing?.submittedAt),
    })
  } catch (err) {
    console.error("[public/test GET]", err)
    return apiError("Внутренняя ошибка", 500)
  }
}
