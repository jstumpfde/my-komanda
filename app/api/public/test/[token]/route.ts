import { NextRequest, NextResponse } from "next/server"
import { eq, and, isNull, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, companies, testSubmissions } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { checkPublicTokenRateLimit } from "@/lib/public/rate-limit-public"
import { switchToTestBranchOpened } from "@/lib/followup/switch-branch"
import { normalizeFunnelV2 } from "@/lib/funnel-v2/types"
import { resolveCurrentStageContent } from "@/lib/funnel-v2/resolve-content"
import type { FunnelV2State } from "@/lib/db/schema"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

// Публичный API теста. Безопасность как у /demo/[token]: token (short_id или
// token кандидата) — единственный ключ; вакансия берётся по candidate.vacancyId,
// доступа к чужим вакансиям нет. Тест — запись demos с kind='test'.
//
// Фаза 3: v2-ветка при funnelV2RuntimeEnabled=true — контент берётся из
// contentBlockId текущей стадии кандидата (как в /demo/[token]).
// Если текущая стадия не test/task — редирект (защита URL, пункт C).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Анти-перебор предсказуемых short_id (см. lib/public/rate-limit-public).
    if (!checkPublicTokenRateLimit(req, "test-get")) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }

    const { token } = await params

    const [candidate] = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        vacancyId: candidates.vacancyId,
        source: candidates.source,
        funnelV2StateJson: candidates.funnelV2StateJson,
      })
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
        companyLogo: companies.logoUrl,
        brandPrimaryColor: companies.brandPrimaryColor,
        brandBgColor: companies.brandBgColor,
        brandTextColor: companies.brandTextColor,
        descriptionJson: vacancies.descriptionJson,
        funnelV2RuntimeEnabled: vacancies.funnelV2RuntimeEnabled,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      // Превью HR (source='preview') — показываем даже для черновика/удалённой
      // вакансии. Реальным кандидатам — только не удалённые.
      .where(candidate.source === "preview"
        ? eq(vacancies.id, candidate.vacancyId)
        : and(eq(vacancies.id, candidate.vacancyId), isNull(vacancies.deletedAt)))
      .limit(1)
    if (!vacancy) return apiError("Вакансия не найдена", 404)

    // ── ГЕЙТ ВОРОНКИ V2 ──────────────────────────────────────────────────────
    // При funnelV2RuntimeEnabled=true: контент берётся из текущей стадии
    // кандидата через resolveCurrentStageContent. Паттерн — как в /demo/[token].
    if (vacancy.funnelV2RuntimeEnabled) {
      const vacancyDescJson = (vacancy.descriptionJson as Record<string, unknown> | null) ?? {}
      const funnelV2 = normalizeFunnelV2(vacancyDescJson.funnelV2)
      const candState = candidate.funnelV2StateJson as FunnelV2State | null
      const currentStageId = candState?.stageId
      const currentStage = currentStageId
        ? funnelV2.stages.find(s => s.id === currentStageId)
        : null

      // C. Защита URL: если кандидат пришёл на /test, но его стадия — demo
      // (или любая другая не-test), редиректим на правильный URL.
      if (currentStage && currentStage.action !== "test" && currentStage.action !== "task") {
        if (currentStage.action === "demo") {
          // Редирект на /demo/<token> — там кандидат и должен быть сейчас.
          return NextResponse.redirect(`${getAppBaseUrl()}/demo/${token}`, { status: 302 })
        }
        // Любая другая стадия (interview, offer, hired и т.д.) — мягкий 410.
        return apiError(
          `Тест недоступен на текущей стадии (${currentStage.action}). Проверьте письмо с актуальной ссылкой.`,
          410,
        )
      }

      const candidateForV2 = {
        id:                candidate.id,
        token:             token,
        name:              candidate.name,
        email:             null as string | null,
        phone:             null as string | null,
        vacancyId:         candidate.vacancyId,
        funnelV2StateJson: candState ?? null,
      }
      const vacancyForV2 = {
        id:                     vacancy.id,
        funnelV2,
        funnelV2RuntimeEnabled: true,
      }

      const resolved = await resolveCurrentStageContent(candidateForV2, vacancyForV2)
      if (resolved) {
        // Активность + черновик для v2-теста (как в легаси-пути)
        if (candidate.source !== "preview") {
          await db.update(candidates)
            .set({ lastActivityAt: new Date() })
            .where(eq(candidates.id, candidate.id))
          // Проверяем черновик
          const [existingV2] = await db
            .select({ id: testSubmissions.id, submittedAt: testSubmissions.submittedAt })
            .from(testSubmissions)
            .where(eq(testSubmissions.candidateId, candidate.id))
            .orderBy(desc(testSubmissions.submittedAt))
            .limit(1)
          if (!existingV2) {
            await db.insert(testSubmissions).values({
              candidateId: candidate.id,
              demoId:      resolved.demoId,
              answersJson: { answers: [], objective: null },
              submittedAt: null,
            }).onConflictDoNothing()
            void switchToTestBranchOpened(candidate.id).catch(() => {})
            // Воронка v2: переключение ветки дожима А («не открыл») → Б
            // («открыл, не завершил») для branch=funnelv2:<stageId> — по
            // образцу markDemoOpened для /demo. Внутри сам проверяет, что
            // кандидат на v2; fire-and-forget, кандидата не блокируем.
            void import("@/lib/funnel-v2/runtime-executor")
              .then(m => m.switchV2BranchOpened(candidate.id))
              .catch((err) => {
                console.error("[public/test] switchV2BranchOpened failed:",
                  err instanceof Error ? err.message : err)
              })
          }
        }

        const pdsV2 = (resolved.postDemoSettings && typeof resolved.postDemoSettings === "object")
          ? resolved.postDemoSettings as Record<string, unknown> : {}

        return apiSuccess({
          candidateName: candidate.name,
          vacancyTitle:  vacancy.title,
          companyName:   vacancy.companyBrandName || vacancy.companyName,
          companyLogo:   vacancy.companyLogo || null,
          brand: {
            primary: vacancy.brandPrimaryColor,
            bg:      vacancy.brandBgColor,
            text:    vacancy.brandTextColor,
          },
          lessons: Array.isArray(resolved.lessonsJson) ? resolved.lessonsJson : [],
          settings: {
            instructions:   typeof pdsV2.testTaskInstructions === "string" ? pdsV2.testTaskInstructions : "",
            deadlineDays:   typeof pdsV2.testDeadlineDays === "number" ? pdsV2.testDeadlineDays : null,
            responseFormat: pdsV2.testResponseFormat === "file" || pdsV2.testResponseFormat === "both" ? pdsV2.testResponseFormat : "text",
          },
          alreadySubmitted: false, // черновик уже создан выше
          // Метка v2 для фронта
          _funnelV2: { stageId: resolved.stageId, demoKind: resolved.demoKind },
        })
      }
      // resolved=null: нет contentBlockId на стадии → падаем в легаси-путь ниже
    }
    // ── /ГЕЙТ ВОРОНКИ V2 ────────────────────────────────────────────────────

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
        // Тест-дожим: первое открытие → ветка «не открыл тест» больше не нужна,
        // переключаем на «открыл, но не заполнил» (no-op, если дожим выключен).
        void switchToTestBranchOpened(candidate.id).catch(() => {})
      }
    }

    const pds = (demo.postDemoSettings && typeof demo.postDemoSettings === "object")
      ? demo.postDemoSettings as Record<string, unknown> : {}

    return apiSuccess({
      candidateName: candidate.name,
      vacancyTitle: vacancy.title,
      companyName: vacancy.companyBrandName || vacancy.companyName,
      companyLogo: vacancy.companyLogo || null,
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
