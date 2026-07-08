/**
 * scripts/build-funnel-v2-from-legacy.ts
 *
 * Читает ЖИВОЙ легаси-конфиг вакансии (vacancies.description_json,
 * vacancy_specs.spec, demos) и собирает из него ПОЛНУЮ Воронку v2
 * (descriptionJson.funnelV2.stages) — зеркало реального потока + все сообщения.
 *
 * По умолчанию DRY: печатает построенный JSON (ничего не пишет).
 * С флагом --apply: пишет в vacancies.description_json.funnelV2, МЕРДЖА с
 * существующим funnelV2 (сохраняет прочие ключи descriptionJson и сам
 * funnelV2.enabled — движок v2 НЕ включается). Перезаписывает только stages.
 *
 * ВАЖНО: скрипт только СТРОИТ и (с --apply) пишет. НЕ включает движок v2,
 * НЕ трогает поведение. Идемпотентно: повторный --apply даёт тот же результат.
 *
 * Запуск (DRY — печать):
 *   DATABASE_URL=... pnpm exec tsx scripts/build-funnel-v2-from-legacy.ts \
 *     [--vacancy=6916db01-a765-4c4e-a652-81475566f95b]
 *
 * Запуск (запись в БД):
 *   DATABASE_URL=... pnpm exec tsx scripts/build-funnel-v2-from-legacy.ts \
 *     [--vacancy=<uuid>] --apply
 *
 * Дефолтная вакансия: 6916db01-a765-4c4e-a652-81475566f95b.
 */

import { and, eq, asc } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { vacancies, vacancySpecs, demos } from "@/lib/db/schema"
import {
  normalizeFunnelV2,
  makeStage,
  dozhimChainFor,
  dozhimChainForOpened,
  DEFAULT_SCORE_GATE_THRESHOLD,
  type FunnelV2Config,
  type FunnelV2Stage,
  type ScoreGate,
} from "@/lib/funnel-v2/types"

const DEFAULT_VACANCY_ID = "6916db01-a765-4c4e-a652-81475566f95b"

// ─── CLI ─────────────────────────────────────────────────────────────────────

interface Args { vacancyId: string; apply: boolean; help: boolean }

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2)
  let vacancyId = DEFAULT_VACANCY_ID
  let apply = false
  let help = false
  for (const a of args) {
    if (a === "--help" || a === "-h") { help = true; continue }
    if (a === "--apply") { apply = true; continue }
    if (a.startsWith("--vacancy=")) { vacancyId = a.slice("--vacancy=".length).trim() || vacancyId; continue }
    if (a === "--vacancy") { /* значение через = обязательно */ continue }
  }
  return { vacancyId, apply, help }
}

function printHelp() {
  console.log(`
build-funnel-v2-from-legacy — собирает Воронку v2 из живого легаси-конфига вакансии

ИСПОЛЬЗОВАНИЕ:
  DATABASE_URL=... pnpm exec tsx scripts/build-funnel-v2-from-legacy.ts [опции]

ОПЦИИ:
  --vacancy=<uuid>   вакансия (дефолт ${DEFAULT_VACANCY_ID})
  --apply            записать в vacancies.description_json.funnelV2 (мердж; иначе DRY-печать)
  --help, -h         эта справка

DRY по умолчанию — печатает построенный funnelV2 JSON, ничего не пишет.
Идемпотентно: повторный --apply перезаписывает funnelV2.stages тем же результатом.
`)
}

// ─── Хелперы чтения ──────────────────────────────────────────────────────────

function descObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

/** Достаёт значение по цепочке ключей (терпимо к отсутствию). */
function pick(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const k of keys) {
    if (!cur || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

function asInt(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

function asBool(v: unknown): boolean {
  return v === true
}

// ─── Сборка scoreGate (autoEnabled ВСЕГДА false — включит HR вручную) ─────────

function scoreGate(
  scoreType: ScoreGate["scoreType"],
  threshold: number,
  failAction: ScoreGate["failAction"],
): ScoreGate {
  const t = Number.isFinite(threshold) && threshold > 0
    ? Math.max(0, Math.min(100, Math.round(threshold)))
    : DEFAULT_SCORE_GATE_THRESHOLD
  return { scoreType, threshold: t, failAction, autoEnabled: false }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const { vacancyId, apply, help } = parseArgs(process.argv)
  if (help) { printHelp(); return }

  // 1) Вакансия (description_json)
  const [vac] = await db
    .select({
      id: vacancies.id,
      title: vacancies.title,
      companyId: vacancies.companyId,
      descriptionJson: vacancies.descriptionJson,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)

  if (!vac) {
    console.error(`Вакансия ${vacancyId} не найдена.`)
    await pgClient.end()
    process.exit(1)
    return
  }

  const desc = descObj(vac.descriptionJson)
  const existingFunnel: FunnelV2Config = normalizeFunnelV2(desc.funnelV2)

  // 2) Spec (последний по updated_at; PK — одна строка на вакансию)
  const [specRow] = await db
    .select({ spec: vacancySpecs.spec })
    .from(vacancySpecs)
    .where(eq(vacancySpecs.vacancyId, vacancyId))
    .limit(1)
  const spec = descObj(specRow?.spec)
  const resumeT = descObj(pick(spec, "resumeThresholds"))
  const anketaPass = descObj(pick(spec, "anketaPassInvite"))
  // Текст приглашения 1-го касания — spec.inviteLetter (Портрет), не resumeThresholds
  // (там только пороги/флаги). Пусто → используем платформенный дефолт в рантайме.
  const inviteLetterText = asStr(pick(spec, "inviteLetter")) ?? ""

  // 3) Демо-блоки (контент): «Презентация» (1-я часть) и «Путь менеджера» (2-я)
  const demoRows = await db
    .select({ id: demos.id, title: demos.title, kind: demos.kind, contentType: demos.contentType, sortOrder: demos.sortOrder })
    .from(demos)
    .where(eq(demos.vacancyId, vacancyId))
    .orderBy(asc(demos.sortOrder))

  // ── Значения из легаси ──
  // Порог резюме: upperThreshold (если 0/пусто → 50 по умолчанию — см. scoreGate()).
  const resumeThreshold = asInt(pick(resumeT, "upperThreshold"), 0)
  const inviteContentBlockId = asStr(pick(resumeT, "inviteContentBlockId")) ?? null
  const inviteHhStage = asStr(pick(resumeT, "inviteHhStage")) ?? undefined
  const inviteDelaySeconds = asInt(pick(resumeT, "inviteDelaySeconds"), 0)
  const autoRejectEnabled = asBool(pick(resumeT, "autoRejectEnabled"))

  // Гейт анкеты (2-я часть, «Путь менеджера»)
  const anketaPassThreshold = asInt(pick(anketaPass, "passThreshold"), 0)
  const anketaContentBlockId = asStr(pick(anketaPass, "contentBlockId")) ?? null
  const anketaMessageText = asStr(pick(anketaPass, "messageText")) ?? ""
  const anketaDelaySeconds = asInt(pick(anketaPass, "delaySeconds"), 0)
  const anketaHhAction = asStr(pick(anketaPass, "hhAction")) ?? undefined
  const anketaAdvanceToStage = asStr(pick(anketaPass, "advanceToStage")) ?? undefined

  const idSeed = (suffix: string) => `legacy-${suffix}`

  // ── Стадия 1: «Отклик → приглашение на демо» (message + scoreGate resume) ──
  const respond = makeStage("message", idSeed("respond"))
  respond.title = "Отклик → приглашение на демо"
  respond.color = "slate"
  respond.contentBlockId = inviteContentBlockId
  if (inviteHhStage) respond.hhStatus = inviteHhStage
  respond.rule.rejectDelayMinutes = asInt(pick(resumeT, "rejectionDelayMinutes"), respond.rule.rejectDelayMinutes)
  // autoReject как в конфиге (autoEnabled самого гейта всё равно false).
  respond.rule.autoReject = false // авто-отказ через движок v2 не включаем; легаси autoRejectEnabled=${autoRejectEnabled}
  respond.rule.scoreGate = scoreGate("resume", resumeThreshold, "manual")
  // Задержка приглашения — держим в дожиме/сообщении легаси; сохраняем в passCriteria-примечании нет,
  // фиксируем сам факт задержки в rule (движок v2 подтянет из firstMessagesChain).
  // (inviteDelaySeconds=${inviteDelaySeconds}s — легаси-задержка первого касания.)
  // Сообщения 1-го касания (п.2+6): текст приглашения из Портрета (spec.inviteLetter)
  // первым элементом + отдельная строка со ссылкой на демо вторым (если текст задан).
  // Пусто → messages не проставляем, рантайм использует платформенный дефолт (messagePresetId остаётся null).
  if (inviteLetterText) {
    respond.messages = [inviteLetterText, "{{demo_link}}"]
  }

  // ── Стадия 2: «Демонстрация» (1-я часть) — demo, блок «Презентация» ──
  const demo = makeStage("demo", idSeed("demo"))
  demo.title = "Демонстрация"
  demo.color = "blue"
  // Блок Презентации: приоритет inviteContentBlockId (spec), иначе 1-я demo-запись.
  const presentationBlock = inviteContentBlockId
    ?? demoRows.find(d => d.contentType === "presentation" || d.kind === "demo")?.id
    ?? demoRows[0]?.id
    ?? null
  demo.contentBlockId = presentationBlock

  // ── Стадия 3: 2-я часть демо (напр. «Путь менеджера» у эталонной вакансии) —
  // demo + scoreGate anketa. Название стадии берём из реального контент-блока
  // вакансии (не хардкодим имя конкретной вакансии — оно у каждой своё).
  const managerPath = makeStage("demo", idSeed("manager-path"))
  managerPath.color = "indigo"
  // Эвристика поиска блока 2-й части по легаси-данным без anketaContentBlockId:
  // ищем "менеджер" в названии (так исторически называли этот блок), иначе
  // берём второй по порядку demo-блок.
  const managerBlock = demoRows.find(d => /менеджер/i.test(d.title))
    ?? demoRows.filter(d => d.kind === "demo" || d.contentType === "presentation").slice(1, 2)[0]
    ?? null
  // Название — из блока, на который РЕАЛЬНО указывает итоговый contentBlockId
  // (guard-minor 08.07: title и contentBlockId не должны расходиться).
  managerPath.contentBlockId = anketaContentBlockId ?? managerBlock?.id ?? null
  const linkedBlock = managerPath.contentBlockId
    ? (demoRows.find(d => d.id === managerPath.contentBlockId) ?? managerBlock)
    : managerBlock
  managerPath.title = linkedBlock?.title ?? "Демо (2-я часть)"
  managerPath.rule.scoreGate = scoreGate("anketa", anketaPassThreshold || 45, "preliminary_reject")
  if (anketaHhAction) managerPath.hhStatus = anketaHhAction
  managerPath.rule.advanceTo = anketaAdvanceToStage ?? "test_task_sent"
  // Текст приглашения на 2-ю часть — из anketaPassInvite.messageText (п.2+6: реальный
  // легаси-текст стадии анкеты/предквалификации кладём в messages основным сообщением).
  if (anketaMessageText) {
    managerPath.messages = [anketaMessageText]
  }

  // ── Стадия 4: «Интервью» — ВЗЯТЬ существующую из funnelV2 как есть ──
  // Пустое название (легаси-стадии часто без title) → подставляем «Интервью», чтобы
  // повторный прогон скрипта давал корректное название (п.6, Юрий).
  const existingInterview = existingFunnel.stages.find(s => s.action === "interview")
  const interview: FunnelV2Stage = existingInterview
    ? { ...existingInterview, title: existingInterview.title?.trim() ? existingInterview.title : "Интервью" }
    : (() => {
        const it = makeStage("interview", idSeed("interview"))
        it.title = "Интервью"
        it.color = "violet"
        return it
      })()

  // ── Стадия 5: «Оффер» — ручное ──
  const offer = makeStage("offer", idSeed("offer"))
  offer.title = "Оффер"
  offer.color = "amber"
  offer.rule.autoAdvance = false
  offer.rule.autoReject = false
  offer.dozhimChain = dozhimChainFor("standard", "offer")
  offer.dozhimChainOpened = dozhimChainForOpened("standard", "offer")

  // ── Стадия 6: «Нанят» — terminal ──
  const hired = makeStage("hired", idSeed("hired"))
  hired.title = "Нанят"
  hired.color = "green"
  hired.terminal = true

  const stages: FunnelV2Stage[] = [respond, demo, managerPath, interview, offer, hired]

  // Мердж: сохраняем прочие ключи funnelV2 (в т.ч. enabled — движок НЕ включаем).
  const outFunnel: FunnelV2Config = {
    ...existingFunnel,
    enabled: existingFunnel.enabled, // не трогаем флаг движка
    stages,
  }

  // ── Отчёт о маппинге (в stderr, чтобы stdout оставался чистым JSON в DRY) ──
  console.error(`\nВакансия: ${vac.title ?? "(без названия)"} [${vac.id}]`)
  console.error(`Демо-блоков: ${demoRows.length}`)
  for (const d of demoRows) console.error(`  • ${d.title}  (kind=${d.kind}, contentType=${d.contentType}, id=${d.id})`)
  console.error(`Существующая стадия «Интервью»: ${existingInterview ? "взята из funnelV2 как есть" : "не найдена → создана дефолтная"}`)
  console.error("Маппинг стадий:")
  console.error(`  1) Отклик → приглашение на демо  gate=resume/${respond.rule.scoreGate?.threshold} (autoEnabled=false), contentBlock=${respond.contentBlockId ?? "—"}, hh=${respond.hhStatus ?? "—"}, messages=${respond.messages?.length ?? 0}`)
  console.error(`  2) Демонстрация          contentBlock=${demo.contentBlockId ?? "—"}`)
  console.error(`  3) ${managerPath.title.padEnd(24)} gate=anketa/${managerPath.rule.scoreGate?.threshold} (autoEnabled=false), contentBlock=${managerPath.contentBlockId ?? "—"}, hh=${managerPath.hhStatus ?? "—"}, advance=${managerPath.rule.advanceTo}, messages=${managerPath.messages?.length ?? 0}`)
  console.error(`  4) Интервью              ${existingInterview ? "(сохранена)" : "(дефолт)"}`)
  console.error(`  5) Оффер                 ручное`)
  console.error(`  6) Нанят                 terminal`)
  console.error(`Легаси-справка: resume.upperThreshold=${resumeThreshold || "0→50"}, autoRejectEnabled=${autoRejectEnabled}, inviteDelaySeconds=${inviteDelaySeconds}, anketa.passThreshold=${anketaPassThreshold}, anketa.delaySeconds=${anketaDelaySeconds}\n`)

  if (!apply) {
    console.error("── DRY (печать funnelV2, БД не тронута). Для записи добавьте --apply. ──")
    console.log(JSON.stringify(outFunnel, null, 2))
    await pgClient.end()
    return
  }

  // ── APPLY: мердж в descriptionJson, движок не включаем ──
  await db.update(vacancies)
    .set({
      descriptionJson: { ...desc, funnelV2: outFunnel },
      updatedAt: new Date(),
    })
    .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, vac.companyId)))

  console.error(`✔ Записано: vacancies.description_json.funnelV2 (${stages.length} стадий). Движок v2 НЕ включён.`)
  console.log(JSON.stringify(outFunnel, null, 2))
  await pgClient.end()
}

main().catch(async (e) => {
  console.error("Ошибка:", e)
  try { await pgClient.end() } catch { /* noop */ }
  process.exit(1)
})
