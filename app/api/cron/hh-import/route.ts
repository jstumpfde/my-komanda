// POST /api/cron/hh-import
// Защищён X-Cron-Secret. Каждую минуту (crontab * * * * *) импортирует отклики с hh.ru
// по всем активным hh-вакансиям компаний и сразу запускает разбор:
//   • если рабочее время вакансии (canSendNow) — создаём кандидата,
//     шлём демо-приглашение, переводим стадию, расписываем follow-up;
//   • иначе оставляем status='response' до следующего cron'а.
//
// Лимит на разбор — PROCESS_LIMIT_PER_RUN откликов на компанию за один вызов
// (выставлен в 50, чтобы 388 откликов разбирались за 8 циклов вместо 49).
//
// Защита от параллельных запусков: pg_try_advisory_lock с фиксированным ключом.
// Если предыдущий cron ещё работает — возвращаем 409 «busy», не делаем
// повторный INSERT/обновление по тем же откликам.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hhVacancies, vacancies, hhResponses } from "@/lib/db/schema"
import { and, eq, inArray, count, sql, or, isNull } from "drizzle-orm"
import { getValidToken } from "@/lib/hh-helpers"
import { importHhResponsesForVacancy } from "@/lib/hh/import-responses"
import { checkCronAuth } from "@/lib/cron/auth"
import { processHhQueue } from "@/lib/hh/process-queue"
import { runCleanup as runHhCleanup } from "@/app/api/cron/hh-cleanup-stuck/route"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

// Лимит откликов в обработку за один вызов cron'а — на компанию.
// 20 (раньше 50) — сознательно держим прогон коротким. Разбор идёт
// последовательно с PROCESS_DELAY_SECONDS на отклик, и весь прогон держит
// единый advisory-lock. При 50×2с=~100с lock висел ~1.5 мин, и минутный cron
// ВСЕ это время возвращал busy → свежие отклики НЕ импортировались. Эффект:
// кандидат появлялся через 10–20 мин после отклика на hh (диагностика
// 01.06.2026: у Макарова resp_created == cand_created, т.е. тормозил импорт,
// а не разбор — разбор мгновенный). 20×1с=~20с → lock освобождается в ~4×
// чаще → импорт почти каждую минуту. Бэклог дренится меньше за прогон, но
// прогонов кратно больше — суммарная пропускная не падает.
const PROCESS_LIMIT_PER_RUN = 20

// Задержка между откликами при разборе (раньше 2с). 1с по-прежнему щадит hh
// per-employer rate-limit (~60 rps), но вдвое сокращает удержание lock'а.
const PROCESS_DELAY_SECONDS = 1

// Стабильный ключ pg_advisory_lock. int4 (Postgres принимает int4/int8) —
// сознательно держим в безопасном диапазоне, чтобы не конфликтовать с
// будущими ключами других cron'ов. Менять только если меняется семантика.
const HH_IMPORT_LOCK_KEY = 7470001

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response

  // Пробуем взять advisory lock. true → можно работать; false → предыдущий
  // cron ещё в процессе, выходим с 409 (Conflict, идемпотентно — клиент знает,
  // что обработка уже идёт, и можно подождать).
  const lockRows = await db.execute(
    sql`SELECT pg_try_advisory_lock(${HH_IMPORT_LOCK_KEY}) AS acquired`,
  ) as unknown as Array<{ acquired: boolean }>
  const acquired = lockRows?.[0]?.acquired === true
  if (!acquired) {
    // НЕ пишем busy-тики в cron_runs: cron минутный, ~60% тиков заняты —
    // это ~1400 строк/сутки шума. Логируем только прогоны, реально взявшие
    // lock (ниже), чтобы видеть честную частоту и длительность работы.
    return NextResponse.json(
      { ok: false, busy: true, error: "hh-import already running, try later" },
      { status: 409 },
    )
  }

  // Всё, что после захвата lock'а — в try/finally, чтобы unlock выполнился на
  // ЛЮБОМ пути выхода (в т.ч. если startCronRun/запросы бросят исключение).
  // Иначе lock завис бы до рестарта процесса, и следующий cron вечно ловил 409.
  let imported  = 0
  let processed = 0
  let deferredOffHours = 0
  let skipped   = 0
  let orphanedCleanup = 0
  const errors: string[] = []

  try {
    // Записываем запуск только после захвата lock'а — это реальный рабочий
    // прогон. По cron_runs.duration_ms видно, сколько lock держится (главный
    // фактор задержки импорта свежих откликов), и реальную частоту прогонов.
    const run = await startCronRun("hh-import")

    try {
    // P0-53: до основного прохода чистим "застрявшие" hh_responses —
    // status='response' с linked candidate в стадии rejected/hired или
    // autoProcessingStopped=true. Это позволяет основному processHhQueue
    // ниже не упираться в ORDER BY createdAt ASC LIMIT 50 на старых
    // stopped-откликах и доходить до свежих.
    try {
      const cleanupRes = await runHhCleanup()
      orphanedCleanup = cleanupRes.orphaned
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[hh-import] cleanup failed:", msg)
      errors.push(`cleanup: ${msg}`)
    }

    // Все активные hh-вакансии всех компаний с включённым авто-разбором.
    const activeRows = await db
      .select({
        hhVacancyId:           hhVacancies.hhVacancyId,
        // vacancies.hh_vacancy_id — тот же hh-идентификатор, что использует
        // кнопка «Синхронизировать» (доказанно рабочий путь). Берём его как
        // приоритетный источник, hhVacancies.hhVacancyId — fallback.
        vacancyHhId:           vacancies.hhVacancyId,
        vacancyId:             hhVacancies.localVacancyId,
        companyId:             vacancies.companyId,
        autoProcessingEnabled: vacancies.autoProcessingEnabled,
      })
      .from(hhVacancies)
      .innerJoin(vacancies, eq(hhVacancies.localVacancyId, vacancies.id))
      .where(and(
        // hh.ru API возвращает 'open' для опубликованных вакансий (см.
        // /api/integrations/hh/vacancies, status: item.status?.id ?? "open").
        // Старое значение 'active' остаётся для ранее залинкованных вручную
        // через /publish — обоих формата засчитываем как «живая вакансия».
        inArray(hhVacancies.status, ["active", "open"]),
        eq(vacancies.autoProcessingEnabled, true),
        // Гард архива (владелец 15.07: «не тянуть по вакансиям, неактивным на
        // hh»). Одного hhVacancies.status мало — он ПРОТУХАЕТ: пишется при
        // линковке/публикации и дальше не обновляется. Замер на проде 15.07:
        // у всех 7 hh-вакансий он говорил active/open, тогда как на hh живой
        // была ОДНА (Revoluterra) — то есть 5 архивных опрашивались каждый
        // прогон впустую. vacancies.hh_archived — свежий сигнал, его ставит
        // крон hh-vacancy-sync из ДЕТАЛИ /vacancies/{id} (404 = удалена).
        // Пропускаем только ЯВНЫЙ архив: NULL (ещё не синкали) продолжаем
        // тянуть — иначе новая вакансия молча не импортировалась бы до
        // первого прогона hh-vacancy-sync.
        or(isNull(vacancies.hhArchived), eq(vacancies.hhArchived, false)),
      ))

    // Группируем по компании — каждой компании один токен и один проход разбора.
    const byCompany = new Map<string, typeof activeRows>()
    for (const row of activeRows) {
      const list = byCompany.get(row.companyId) ?? []
      list.push(row)
      byCompany.set(row.companyId, list)
    }

    // Компании с накопленной очередью добираем в проход, даже если живых
    // hh-вакансий у них не осталось. Иначе гард архива выше молча заморозил
    // бы их отклики: «Шаг 2 — разбор накопленных откликов» ниже привязан к
    // КОМПАНИИ, но живёт внутри этого прохода, а проход строился только из
    // неархивных вакансий — компания, заархивировавшая последнюю вакансию с
    // непустой очередью, выпала бы из карты навсегда. Список вакансий для
    // таких компаний пустой: Шаг 1 (импорт) для них ничего не делает, Шаг 2
    // (разбор очереди) отрабатывает как обычно.
    //
    // ОБЯЗАТЕЛЬНО с eq(autoProcessingEnabled, true) — снимаем ТОЛЬКО гард
    // архива, ради которого добор и сделан (находка predeploy-guard 15.07,
    // blocker). Без этого условия добор ловил бы и компании, где HR СОЗНАТЕЛЬНО
    // выключил авто-разбор: processHhQueue зовётся без localVacancyId и внутри
    // (lib/hh/process-queue.ts) autoProcessingEnabled не проверяет вообще —
    // то есть крон разослал бы приглашения реальным кандидатам вопреки
    // выключенному тумблеру. Тумблер выключен по умолчанию (schema.ts:1072),
    // а строки status='response' создаются независимо от него (ручной синк и
    // GET /api/integrations/hh/responses при открытии вкладки) — то есть это
    // был бы не экзотический, а рядовой сценарий.
    const pendingCompanies = await db
      .select({ companyId: hhResponses.companyId })
      .from(hhResponses)
      .innerJoin(vacancies, and(
        eq(vacancies.companyId, hhResponses.companyId),
        eq(vacancies.hhVacancyId, hhResponses.hhVacancyId),
      ))
      .where(and(
        eq(hhResponses.status, "response"),
        eq(vacancies.autoProcessingEnabled, true),
      ))
      .groupBy(hhResponses.companyId)
    for (const { companyId } of pendingCompanies) {
      if (!byCompany.has(companyId)) byCompany.set(companyId, [])
    }

    // Параллельная обработка компаний — каждая компания идёт своим потоком.
    // Внутри компании (импорт в hh_responses + processHhQueue) сохраняется
    // последовательность, чтобы не словить 429 от hh.ru на одном employer.
    await Promise.all(Array.from(byCompany.entries()).map(async ([companyId, rows]) => {
      // Без валидного токена hh — пропускаем компанию. getValidToken — тот же
      // путь, что и у кнопки: сам рефрешит протухший access_token.
      const tokenResult = await getValidToken(companyId)
      if (!tokenResult) {
        skipped++
        return
      }
      const accessToken = tokenResult.accessToken

      // Шаг 1 — импорт новых откликов в hh_responses (status='response').
      // ПЕРЕВЕДЕНО на тот же путь, что и кнопка «Синхронизировать»
      // (importHhResponsesForVacancy → negotiations → upsert hh_responses).
      // Раньше тут был HHClient.importApplications, который писал НАПРЯМУЮ в
      // candidates (минуя hh_responses), поэтому processHhQueue ниже не видел
      // новых откликов. mode "new" — тянем полное резюме только для новых
      // откликов, чтобы не выжигать hh /resumes rate-limit на каждом тике.
      for (const row of rows) {
        // INNER JOIN гарантирует non-null, но schema разрешает null —
        // на всякий случай защищаемся.
        if (!row.vacancyId) continue
        const localVacancyId = row.vacancyId
        const hhVacancyId = row.vacancyHhId ?? row.hhVacancyId
        // hh API ждёт числовой vacancy_id; некорректный — пропускаем (как кнопка).
        if (!hhVacancyId || !/^\d+$/.test(hhVacancyId)) {
          console.warn(`[hh-import] vacancy ${localVacancyId} — пропуск, hh_vacancy_id не числовой: "${hhVacancyId}"`)
          continue
        }
        try {
          const r = await importHhResponsesForVacancy({
            companyId,
            accessToken,
            hhVacancyId,
            mode: "new",
          })
          imported += r.imported
          // Отмечаем реальное время cron-синхронизации этой вакансии. Поле
          // «Синк» в UI раньше показывало max(последний отклик, updatedAt) —
          // обманчиво (выглядело «не синкалось» при работающем cron'е). Теперь
          // пишем фактическую метку успешного импорта в hh_vacancies.syncedAt.
          await db.update(hhVacancies)
            .set({ syncedAt: new Date() })
            .where(and(
              eq(hhVacancies.companyId, companyId),
              eq(hhVacancies.hhVacancyId, hhVacancyId),
            ))
            .catch(() => {})
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[hh-import] vacancy ${localVacancyId} failed:`, msg)
          errors.push(`vacancy ${localVacancyId}: ${msg}`)
        }
      }

      // Шаг 2 — разбор накопленных откликов с уважением рабочих часов.
      // Лимит общий на компанию (а не на каждую вакансию), чтобы один прогон
      // cron'а не превышал PROCESS_LIMIT_PER_RUN.
      try {
        const [{ pending }] = await db
          .select({ pending: count() })
          .from(hhResponses)
          .where(and(eq(hhResponses.companyId, companyId), eq(hhResponses.status, "response")))
        if (pending > 0) {
          const result = await processHhQueue({
            companyId,
            limit:               Math.min(pending, PROCESS_LIMIT_PER_RUN),
            delaySeconds:        PROCESS_DELAY_SECONDS,
            respectWorkingHours: true,
          })
          processed        += result.invited
          deferredOffHours += result.deferredOffHours
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[hh-import] processQueue company ${companyId} failed:`, msg)
        errors.push(`processQueue ${companyId}: ${msg}`)
      }
    }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[hh-import] top-level:", msg)
      await finishCronRun(run.id, "error", { imported, processed, deferredOffHours, skipped, orphanedCleanup }, msg).catch(() => {})
      return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }

    await finishCronRun(run.id, "ok", { imported, processed, deferredOffHours, skipped, orphanedCleanup, errors: errors.length }).catch(() => {})

    return NextResponse.json({
      ok: true,
      imported,
      processed,
      deferredOffHours,
      skipped,
      orphanedCleanup,
      errors,
    })
  } finally {
    // Гарантированное освобождение lock'а на любом пути выхода (успех, ошибка
    // обработки, ИЛИ падение startCronRun) — иначе cron вечно возвращал бы 409.
    await db.execute(sql`SELECT pg_advisory_unlock(${HH_IMPORT_LOCK_KEY})`).catch(() => {})
  }
}
