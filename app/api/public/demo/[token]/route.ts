import { NextRequest } from "next/server"
import { eq, and, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, companies, hhResponses, vacancySpecs, followUpMessages } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { isShortId } from "@/lib/short-id"
import { checkPublicTokenRateLimit } from "@/lib/public/rate-limit-public"
import { buildCandidateDeepLink, generateInviteToken } from "@/lib/telegram/candidate-bot"
import { normalizeFunnelV2 } from "@/lib/funnel-v2/types"
import { resolveCurrentStageContent } from "@/lib/funnel-v2/resolve-content"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import { getSpec } from "@/lib/core/spec/store"
import { resolveTransferMode } from "@/lib/demo/anketa-pass-gate"
import { resolveEffectiveAnketaPassInvite } from "@/lib/funnel-v2/native-config"

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
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Анти-перебор предсказуемых short_id (см. lib/public/rate-limit-public).
    if (!checkPublicTokenRateLimit(req, "demo-get")) {
      return apiError("Слишком много запросов, попробуйте позже", 429)
    }

    const { token } = await params

    // Резолв: сначала по short_id, иначе по token (preview/nanoid/uuid).
    const candidateRows = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        vacancyId: candidates.vacancyId,
        // Умное правило финальной анкеты: если у кандидата уже есть контакт
        // (email или телефон, напр. из hh) — анкету пропускаем, её цель —
        // собрать контакты, а они уже есть. Поля отдаём фронту флагом
        // candidateHasContacts (сами значения наружу не светим).
        email: candidates.email,
        phone: candidates.phone,
        anketaAnswers: candidates.anketaAnswers,
        demoProgressJson: candidates.demoProgressJson,
        // aiScore намеренно НЕ выбирается — внутренняя AI-оценка не должна
        // уходить кандидату в публичный ответ (security, S-5).
        source: candidates.source,
        // F7: для deep-link на финальном экране
        telegramInviteToken: candidates.telegramInviteToken,
        // Воронка v2: состояние кандидата (stageId, completedAt и т.д.)
        funnelV2StateJson: candidates.funnelV2StateJson,
        // «2-я часть демо»: per-candidate override блока (миграция 0236).
        overrideContentBlockId: candidates.overrideContentBlockId,
      })
      .from(candidates)
      .where(isShortId(token) ? eq(candidates.shortId, token) : eq(candidates.token, token))
      .limit(1)

    if (candidateRows.length === 0) {
      return apiError("Кандидат не найден", 404)
    }

    const candidate = candidateRows[0]

    // Умное правило финальной анкеты: уже есть контакт (email ИЛИ телефон)?
    const candidateHasContacts =
      (candidate.email?.trim().length ?? 0) > 0 ||
      (candidate.phone?.trim().length ?? 0) > 0

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
        // Источники переменных демо (buildDemoVarsMap в demo-client):
        // {{график}} + профиль компании — {{офис}}/{{отрасль}}/{{сотрудников}}/
        // {{лет_на_рынке}}/{{руководитель}}. Публично-безопасные поля: они и
        // предназначены для вставки в текст демо кандидату.
        schedule: vacancies.schedule,
        officeAddress: companies.officeAddress,
        industry: companies.industry,
        employeeCount: companies.employeeCount,
        foundedYear: companies.foundedYear,
        director: companies.director,
        companyName: companies.name,
        companyBrandName: companies.brandName,
        companyLogo: companies.logoUrl,
        // 152-ФЗ: subdomain для ссылки чекбокса согласия на политику КОМПАНИИ
        // (/politicahr2026?company=<subdomain>) — оператор ПД у анкеты кандидата
        // это компания-наниматель, не платформа.
        companySubdomain: companies.subdomain,
        brandPrimaryColor: companies.brandPrimaryColor,
        brandBgColor: companies.brandBgColor,
        brandTextColor: companies.brandTextColor,
        // F7: username бота для формирования deep-link на финальном экране
        candidateBotUsername: companies.candidateBotUsername,
        // Воронка v2: флаг рантайма
        funnelV2RuntimeEnabled: vacancies.funnelV2RuntimeEnabled,
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

    // ── ГЕЙТ ВОРОНКИ V2 ──────────────────────────────────────────────────────
    // При funnelV2RuntimeEnabled=true: контент берётся из текущей стадии
    // кандидата (resolveCurrentStageContent), а не из легаси kind='demo'.
    // При флаге=false — весь легаси-путь ниже без изменений.
    const vacancyDescJson = (vacancy.descriptionJson as Record<string, unknown> | null) ?? {}
    if (vacancy.funnelV2RuntimeEnabled) {
      const funnelV2 = normalizeFunnelV2(vacancyDescJson.funnelV2)
      // Текущая стадия кандидата (funnelV2StateJson добавлен в select выше)
      const candState = candidate.funnelV2StateJson
      const currentStageId = candState?.stageId
      const currentStage = currentStageId
        ? funnelV2.stages.find(s => s.id === currentStageId)
        : null

      // C. Защита URL: если кандидат пришёл на /demo, но его стадия — test/task
      // (или любая другая не-demo), редиректим на правильный URL.
      if (currentStage && currentStage.action !== "demo") {
        if (currentStage.action === "test" || currentStage.action === "task") {
          // Редирект на /test/<token> — там кандидат и должен быть сейчас.
          const { NextResponse } = await import("next/server")
          return NextResponse.redirect(`${getAppBaseUrl()}/test/${token}`, { status: 302 })
        }
        // Любая другая стадия (interview, offer, hired и т.д.) — мягкий 410.
        return apiError(
          `Демо недоступно на текущей стадии (${currentStage.action}). Проверьте письмо с актуальной ссылкой.`,
          410,
        )
      }

      const candidateForV2 = {
        id:                candidate.id,
        token:             token,
        name:              candidate.name,
        email:             null,
        phone:             null,
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
        // Контент из v2-блока текущей стадии
        return apiSuccess({
          candidateName:      candidate.name,
          vacancyTitle:       vacancy.title,
          companyName:        vacancy.companyBrandName || vacancy.companyName,
          companyLogo:        vacancy.companyLogo,
          companySubdomain:   vacancy.companySubdomain,
          brandPrimaryColor:  vacancy.brandPrimaryColor,
          brandBgColor:       vacancy.brandBgColor,
          brandTextColor:     vacancy.brandTextColor,
          salaryMin:          vacancy.salaryMin,
          salaryMax:          vacancy.salaryMax,
          city:               vacancy.city,
          format:             vacancy.format,
          schedule:           vacancy.schedule,
          officeAddress:      vacancy.officeAddress,
          industry:           vacancy.industry,
          employeeCount:      vacancy.employeeCount,
          foundedYear:        vacancy.foundedYear,
          director:           vacancy.director,
          lessons:            resolved.lessonsJson,
          progress:           candidate.demoProgressJson,
          answers:            candidate.anketaAnswers,
          postDemoSettings:   resolved.postDemoSettings ?? {},
          candidateHasContacts,
          anketaIntro:        null,
          finalScreens:       null,
          prefill:            { first_name: null, last_name: null, city: null },
          videoIntro:         null,
          candidateTelegramDeepLink: null,
          passInviteScreens:  null,
          // Метка v2 для фронта (опционально, можно игнорировать)
          _funnelV2:          { stageId: resolved.stageId, demoKind: resolved.demoKind },
        })
      }
      // resolved=null: нет contentBlockId на стадии → падаем в легаси-путь ниже
    }
    // ── /ГЕЙТ ВОРОНКИ V2 ────────────────────────────────────────────────────

    // #2: какой блок показать. Если в Портрете (vacancy_specs) выбран конкретный
    // демо-блок (resumeThresholds.inviteContentBlockId) → грузим его по id строки
    // demos; иначе «боевой» kind='demo' (легаси-поведение).
    let inviteBlockId: string | null = null
    // «2-я часть демо»: per-candidate override (миграция 0236) перекрывает резолв
    // на уровне вакансии. Прошедший анкету кандидат видит «Путь менеджера».
    if (candidate.overrideContentBlockId) {
      inviteBlockId = candidate.overrideContentBlockId
      // Кандидат РЕАЛЬНО открыл 2-ю часть — страховочное письмо-приглашение
      // (branch='second_demo_invite', режим both) больше не нужно: гасим pending,
      // чтобы прошедший инлайн не получил «приглашаем на 2-ю часть» задним
      // числом. Кто ушёл не открыв — письмо остаётся и уйдёт по расписанию.
      db.update(followUpMessages)
        .set({ status: "cancelled", errorMessage: "block2_opened" })
        .where(and(
          eq(followUpMessages.candidateId, candidate.id),
          eq(followUpMessages.branch, "second_demo_invite"),
          eq(followUpMessages.status, "pending"),
        ))
        .catch((err: unknown) => console.error("[demo GET] cancel second_demo_invite failed:", err))
      // Дожим 2-й части: «не открыл» → «открыл, но не прошёл» (тексты из
      // test_messages_opened кампании; гейт test_enabled внутри). Fire-and-forget.
      import("@/lib/followup/switch-branch")
        .then(m => m.switchToTestBranchOpened(candidate.id))
        .catch((err: unknown) => console.error("[demo GET] switch test branch failed:", err))
    } else {
      try {
        const [specRow] = await db
          .select({ spec: vacancySpecs.spec })
          .from(vacancySpecs)
          .where(eq(vacancySpecs.vacancyId, vacancy.id))
          .limit(1)
        const rt = (specRow?.spec as { resumeThresholds?: { inviteContentBlockId?: string | null } } | undefined)?.resumeThresholds
        inviteBlockId = rt?.inviteContentBlockId ?? null
      } catch { /* нет спеки — легаси-путь */ }
    }

    // Find published demo for this vacancy.
    // inviteContentBlockId = id строки demos (ContentBlock.id), поэтому ищем
    // выбранный блок ПО id (в kind='block:<uuid>' uuid — внутренний, ≠ id строки).
    // kind='demo' fallback: кандидату отдаём только демонстрацию (без фильтра
    // запись с kind='test' могла бы подменить демо — критический баг Этапа 2.5).
    const demoCols = {
      id: demos.id,
      title: demos.title,
      lessonsJson: demos.lessonsJson,
      postDemoSettings: demos.postDemoSettings,
    }
    let demoRows = inviteBlockId
      ? await db.select(demoCols).from(demos)
          .where(and(eq(demos.vacancyId, vacancy.id), eq(demos.id, inviteBlockId)))
          .limit(1)
      : await db.select(demoCols).from(demos)
          .where(and(eq(demos.vacancyId, vacancy.id), eq(demos.kind, "demo")))
          .orderBy(sql`${demos.updatedAt} DESC`)
          .limit(1)

    // Фолбэк: выбранный блок удалён/не найден → «боевой» kind='demo',
    // чтобы кандидат не получил 404.
    if (demoRows.length === 0 && inviteBlockId) {
      demoRows = await db.select(demoCols).from(demos)
        .where(and(eq(demos.vacancyId, vacancy.id), eq(demos.kind, "demo")))
        .orderBy(sql`${demos.updatedAt} DESC`)
        .limit(1)
    }

    if (demoRows.length === 0) {
      return apiError("Демо-курс не найден", 404)
    }

    const demo = demoRows[0]

    // «Склейка демо1 + блок 2»: тексты плашки-поздравления (для прошедших, seamless/both)
    // и экрана «Спасибо» (для НЕ прошедших). Берём из Портрета (spec.anketaPassInvite).
    // Наружу отдаём ТОЛЬКО тексты + режим transferMode — пороги/логику гейта
    // кандидату не светим (security). Пусто = фронт применит свои дефолты.
    let passInviteScreens: {
      transferMode:    "seamless" | "message" | "both"
      passScreenTitle: string
      passScreenText:  string
      failScreenTitle: string
      failScreenText:  string
    } | null = null
    try {
      const spec = await getSpec(vacancy.id)
      // Стадия 2: эффективный конфиг (native при движке v2, Портрет иначе).
      const ap = resolveEffectiveAnketaPassInvite(
        (spec?.anketaPassInvite ?? null) as Record<string, unknown> | null,
        normalizeFunnelV2(vacancyDescJson.funnelV2),
        vacancy.funnelV2RuntimeEnabled === true,
      )
      if (ap?.enabled === true) {
        // Обратная совместимость: старые спеки без transferMode → inlineContinue
        // (lib/demo/anketa-pass-gate.ts — единственный источник истины).
        const transferMode = resolveTransferMode(ap)
        passInviteScreens = {
          transferMode,
          passScreenTitle: ap.passScreenTitle ?? "",
          passScreenText:  ap.passScreenText ?? "",
          failScreenTitle: ap.failScreenTitle ?? "",
          failScreenText:  ap.failScreenText ?? "",
        }
      }
    } catch { /* нет спеки — экраны по дефолту фронта */ }

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
      companySubdomain: vacancy.companySubdomain,
      brandPrimaryColor: vacancy.brandPrimaryColor,
      brandBgColor: vacancy.brandBgColor,
      brandTextColor: vacancy.brandTextColor,
      salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax,
      city: vacancy.city,
      format: vacancy.format,
      schedule: vacancy.schedule,
      officeAddress: vacancy.officeAddress,
      industry: vacancy.industry,
      employeeCount: vacancy.employeeCount,
      foundedYear: vacancy.foundedYear,
      director: vacancy.director,
      lessons: demo.lessonsJson,
      progress: candidate.demoProgressJson,
      answers: candidate.anketaAnswers,
      // aiScore намеренно НЕ включается в публичный ответ — внутренняя оценка
      // не должна быть видна кандидату в DevTools (security S-5).
      postDemoSettings: demo.postDemoSettings ?? {},
      candidateHasContacts,
      anketaIntro,
      finalScreens,
      prefill,
      videoIntro,
      candidateTelegramDeepLink,
      passInviteScreens,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("GET /api/public/demo/[token]", err)
    return apiError("Internal server error", 500)
  }
}
