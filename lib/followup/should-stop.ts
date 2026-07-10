import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, followUpCampaigns } from "@/lib/db/schema"
import { STOP_WORDS, matchStopWordList, matchStopWordWith } from "@/lib/followup/stop-words"
import { getBaselineStopWords } from "@/lib/followup/effective-stop-words"
import { isBlockEnabled } from "@/lib/funnel-builder/runtime"

export type StopReason =
  | "vacancy_closed"
  | "vacancy_paused"
  | "demo_completed"
  | "candidate_refused"
  | "campaign_disabled"
  | "auto_processing_stopped"

export interface StopResult {
  stop: boolean
  reason?: StopReason
}

// Re-export для обратной совместимости (lib/hh/scan-incoming.ts всё ещё
// импортирует STOP_WORDS отсюда — постепенно переедет на @/lib/followup/stop-words).
export { STOP_WORDS }

export async function shouldStopFollowUp(
  candidateId: string,
  campaignId: string,
): Promise<StopResult> {
  const [campaign] = await db
    .select()
    .from(followUpCampaigns)
    .where(eq(followUpCampaigns.id, campaignId))
    .limit(1)

  if (!campaign || !campaign.enabled || campaign.preset === "off") {
    return { stop: true, reason: "campaign_disabled" }
  }

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)

  if (!candidate) return { stop: true, reason: "candidate_refused" }

  if (candidate.autoProcessingStopped || candidate.automationPaused) {
    return { stop: true, reason: "auto_processing_stopped" }
  }

  // Статус вакансии. paused («Приостановлена») останавливает дожим ВСЕГДА —
  // это явная команда HR притормозить всю работу по вакансии (в т.ч. дожимы
  // уже откликнувшихся). Закрытие/архив/корзина — стоп при stopOnVacancyClosed.
  // ВАЖНО: архив на hh.ru сюда НЕ относится — он не меняет локальный status,
  // и дожим уже откликнувшихся продолжается (объявление истекло ≠ найм закрыт).
  const [vacancy] = await db
    .select({ status: vacancies.status, deletedAt: vacancies.deletedAt })
    .from(vacancies)
    .where(eq(vacancies.id, candidate.vacancyId))
    .limit(1)
  if (vacancy?.status === "paused") {
    return { stop: true, reason: "vacancy_paused" }
  }
  if (campaign.stopOnVacancyClosed) {
    if (!vacancy || vacancy.status === "closed" || vacancy.status === "archived" || vacancy.deletedAt) {
      return { stop: true, reason: "vacancy_closed" }
    }
  }

  // Демо пройдено до конца — completedAt в demoProgressJson или стадия дальше demo
  const progress = candidate.demoProgressJson as { completedAt?: string | null } | null
  if (progress?.completedAt) return { stop: true, reason: "demo_completed" }
  // Любая стадия после demo_opened считается «продвинулся дальше», дожим больше не нужен.
  // decision, anketa_filled, ai_screening, interview, final_decision, scheduled, interviewed, hired.
  const ADVANCED_STAGES = new Set([
    "decision", "anketa_filled", "ai_screening",
    // Тест-стадии: кандидату отправлен/пройден тест — он продвинулся дальше
    // демо, дожим больше не нужен (иначе кандидат с тестом получает дожим —
    // баг C1, закрыт 01.06.2026 вместе с мини-фичей рассылки теста).
    "test_task_sent", "test_task_done", "test_passed", "test_failed",
    "interview", "final_decision",
    "scheduled", "interviewed", "hired",
  ])
  if (ADVANCED_STAGES.has(candidate.stage ?? "")) {
    return { stop: true, reason: "demo_completed" }
  }

  // Стоп-слова в anketa_answers.
  //
  // Структура поля шире, чем «массив {question, answer:string}»:
  //   - top-level: jsonb массив ИЛИ объект ИЛИ null;
  //   - каждый элемент массива: {answer, blockId, timeSpent, answeredAt}
  //     ИЛИ голая строка (legacy: дата рождения, ISO timestamp);
  //   - .answer: строка (свободный ответ), объект {viewed:true} (медиа-блок
  //     просмотрен), объект {q-XXX: "текст",...} (мульти-вопрос), массив
  //     строк (мульти-выбор), число, null.
  //
  // Старая логика «answers[last].answer.toLowerCase()» падала с
  // TypeError, когда последний элемент — медиа-блок (.answer — объект),
  // что верно почти для всех заполненных анкет (последний блок — это
  // обычно просмотр финального видео). Поэтому проходим по всем
  // элементам и извлекаем все доступные текстовые значения; matchStopWord
  // защищает от substring false-positive'ов (инцидент 04.05.2026).
  if (campaign.stopOnReply) {
    // P0-22: тянем editable список из vacancies.stop_words_json. Если он
    // пустой/невалидный — fallback на исторический matchStopWord (word-boundary),
    // чтобы не потерять защиту при пустой колонке.
    let vacancyStopWords: string[] | null = null
    try {
      const [vac] = await db
        .select({
          stopWordsJson:        vacancies.stopWordsJson,
          aiProcessSettings:    vacancies.aiProcessSettings,
          funnelRuntimeEnabled: vacancies.funnelRuntimeEnabled,
          funnelConfigJson:     vacancies.funnelConfigJson,
        })
        .from(vacancies)
        .where(eq(vacancies.id, candidate.vacancyId))
        .limit(1)
      // Funnel-флаг stop_words_chat: только явный false отключает КАСТОМНЫЙ
      // список стоп-слов вакансии (undefined/отсутствует = включено).
      // Жёстко закодированный baseline matchStopWord НЕ отключаем — это
      // защита от нежелательного дожима (инцидент 04.05.2026).
      // Phase 3: при funnelRuntimeEnabled источник — блок stop_words_chat.
      const funnelFlag = (vac?.aiProcessSettings as { stopWordsChatEnabled?: boolean } | null)?.stopWordsChatEnabled
      const stopWordsOn = isBlockEnabled(vac, "stop_words_chat", funnelFlag !== false)
      if (stopWordsOn && Array.isArray(vac?.stopWordsJson) && vac.stopWordsJson.length > 0) {
        vacancyStopWords = vac.stopWordsJson.filter((s): s is string => typeof s === "string")
      }
    } catch { /* silent — fallback ниже */ }

    // F6: baseline стоп-слов — из платформенной (редактируемой) записи, не хардкод.
    // Аудит 10.07: baseline ОБЪЕДИНЯЕТСЯ с кастомным списком вакансии, а не
    // заменяется им. Раньше при заданном кастомном списке (а он задан почти
    // всегда — DB-дефолт колонки) baseline отключался целиком: «не хочу»,
    // «прекратите», «нашел работу» (без «ё») не ловились — кандидат просил
    // перестать писать, а дожимы продолжали идти. Комментарий выше («baseline
    // НЕ отключаем») теперь соответствует коду.
    const baseline = await getBaselineStopWords()
    const matchAny = (text: string): boolean =>
      (vacancyStopWords ? matchStopWordList(text, vacancyStopWords) !== null : false)
      || matchStopWordWith(text, baseline)

    const answers = candidate.anketaAnswers
    if (Array.isArray(answers)) {
      for (const item of answers) {
        if (!item || typeof item !== "object") continue
        const rawAnswer = (item as { answer?: unknown }).answer
        if (typeof rawAnswer === "string") {
          if (matchAny(rawAnswer)) {
            return { stop: true, reason: "candidate_refused" }
          }
        } else if (Array.isArray(rawAnswer)) {
          for (const v of rawAnswer) {
            if (typeof v === "string" && matchAny(v)) {
              return { stop: true, reason: "candidate_refused" }
            }
          }
        }
        // {viewed:true}, {q-XXX:...}, числа, null — игнорируем.
        // Внутрь {q-XXX:"текст"} не лезем намеренно: это формальные
        // ответы на вопросы анкеты, кандидат туда отказы не пишет.
      }
    }
  }

  // TODO: AI-классификация ответа на отказ — следующая итерация (MVP только стоп-слова)

  return { stop: false }
}
