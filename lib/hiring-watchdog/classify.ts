// «Сторож найма» (Юрий 07.07) — чистые функции классификации проблем и
// построения dedup_key. Вынесены отдельно от app/api/cron/hiring-watchdog/route.ts
// и lib/hiring-watchdog/checks.ts (которые ходят в БД), чтобы правила можно
// было юнит-тестировать без БД. Запуск тестов: pnpm exec tsx --test
// lib/hiring-watchdog/classify.test.ts (добавлено в package.json → "test").

export type WatchdogSeverity = "critical" | "warning" | "info"

// Каждая находка стража — до записи в admin_alerts. companyId=null → платформенная.
export interface WatchdogIssue {
  severity:   WatchdogSeverity
  dedupKey:   string
  title:      string
  message:    string
  actionUrl?: string | null
  companyId?: string | null
}

// ─── dedup-ключи ────────────────────────────────────────────────────────────
// Стабильные, детерминированные — один и тот же инцидент всегда даёт один и
// тот же ключ, поэтому повторные прогоны крона не плодят дубли (см. partial
// unique index admin_alerts_open_dedup_idx в drizzle/0260).

export function hhTokenDeadDedupKey(companyId: string): string {
  return `hh_token_dead:${companyId}`
}

export function hhImportStaleDedupKey(): string {
  return "hh_import_stale"
}

export function stuckQueueDedupKey(vacancyId: string): string {
  return `stuck_queue:${vacancyId}`
}

export function sendFailuresDedupKey(companyId: string): string {
  return `send_failures:${companyId}`
}

export function oldPublicationDedupKey(vacancyId: string): string {
  return `old_publication_cleanup:${vacancyId}`
}

export function cronStaleDedupKey(cronName: string): string {
  return `cron_stale:${cronName}`
}

export function aiScoringStuckDedupKey(companyId: string): string {
  return `ai_scoring_stuck:${companyId}`
}

// Платформенный (не per-company) — стабильный ключ, БЕЗ временного бакета.
// Пока проблема продолжается, повторные прогоны находят открытый алерт по
// этому же ключу и не создают дубль/не шлют Telegram повторно (см. upsertAlert).
// Когда сбои прекращаются — исчезает из currentDedupKeys текущего прогона →
// autoResolveStale закрывает алерт (тот же паттерн, что hh_import_stale).
export function aiOutageSpikeDedupKey(): string {
  return "ai_outage_spike"
}

export function blindInviteNoScoreDedupKey(): string {
  return "blind_invite_no_score"
}

export function hhStageMismatchDedupKey(candidateId: string): string {
  return `hh_stage_mismatch:${candidateId}`
}

// ─── Классификация hh-токена ────────────────────────────────────────────────
// getValidToken() из lib/hh-helpers.ts возвращает null в двух принципиально
// разных случаях: (1) интеграции нет вообще / isActive=false — деактивирована
// (обычно из-за invalid_grant, требуется ручная переподключка) → CRITICAL;
// (2) временный сбой (5xx/сеть/429) — getValidToken САМ не трогает isActive,
// так что если интеграция всё ещё isActive=true, но токен не добыт — тоже
// не наша забота чинить (следующий тик hh-import сам перепробует). Поэтому
// критерий CRITICAL стража — именно isActive=false (мёртвый refresh_token).
export function classifyHhToken(integration: { isActive: boolean } | null): WatchdogIssue | null {
  if (!integration) return null // нет интеграции вовсе — компания не подключала hh, не наша забота
  if (integration.isActive) return null
  return {
    severity: "critical",
    dedupKey: "", // проставляется вызывающей стороной (нужен companyId)
    title:    "hh отключён",
    message:  "hh.ru интеграция деактивирована (refresh_token отвергнут) — нужна ручная переподключка в Настройках найма → Интеграции.",
    actionUrl: "/hr/hiring-settings?tab=integrations",
  }
}

// ─── Классификация «импорт откликов не бежал» ──────────────────────────────
export function classifyImportStale(minutesSinceLastOk: number | null, thresholdMinutes = 60): WatchdogIssue | null {
  if (minutesSinceLastOk === null) return null // ни разу не было успешного прогона — отдельная история, не спамим при первом деплое
  if (minutesSinceLastOk <= thresholdMinutes) return null
  return {
    severity: "critical",
    dedupKey: hhImportStaleDedupKey(),
    companyId: null,
    title:    "Импорт откликов hh не бежал",
    message:  `Последний успешный прогон hh-import был ${minutesSinceLastOk} мин назад (порог ${thresholdMinutes} мин). Новые отклики кандидатов не попадают в систему.`,
    actionUrl: "/admin/platform",
  }
}

// ─── Классификация застрявшего разбора очереди ─────────────────────────────
export function classifyStuckQueue(
  vacancyId: string,
  companyId: string,
  stuckCount: number,
): WatchdogIssue | null {
  if (stuckCount <= 0) return null
  return {
    severity: "warning",
    dedupKey: stuckQueueDedupKey(vacancyId),
    companyId,
    title:    "Застрявший разбор откликов",
    message:  `${stuckCount} отклик(ов) в очереди разбора старше 4 часов. Watchdog не чинит это автоматически (нет отметки времени клейма) — требуется ручная проверка.`,
    actionUrl: `/hr/vacancies/${vacancyId}`,
  }
}

// ─── Классификация ошибок отправки ──────────────────────────────────────────
export interface FailureBreakdownEntry { reason: string; count: number }

export function classifySendFailures(
  vacancyId: string,
  companyId: string,
  failedCount: number,
  breakdown: FailureBreakdownEntry[],
  threshold = 5,
): WatchdogIssue | null {
  if (failedCount <= threshold) return null
  const top = breakdown
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((b) => `${b.reason}×${b.count}`)
    .join(", ")
  return {
    severity: "warning",
    dedupKey: sendFailuresDedupKey(companyId),
    companyId,
    title:    "Много неудачных отправок",
    message:  `${failedCount} неудачных отправок за последний час${top ? ` (${top})` : ""}.`,
    actionUrl: `/hr/vacancies/${vacancyId}`,
  }
}

// ─── Классификация «старая публикация» (авто-починка + info-алерт) ─────────
export function classifyOldPublicationCleanup(
  vacancyId: string,
  companyId: string,
  cancelledCount: number,
): WatchdogIssue | null {
  if (cancelledCount <= 0) return null
  return {
    severity: "info",
    dedupKey: oldPublicationDedupKey(vacancyId) + `:${Date.now()}`, // info — каждый прогон новый факт, не держим "open" вечно
    companyId,
    title:    "Отменены недоставляемые дожимы",
    message:  `Отменено ${cancelledCount} дожим(ов) кандидатам старой (закрытой) публикации hh — сообщения всё равно не доходили.`,
    actionUrl: `/hr/vacancies/${vacancyId}`,
  }
}

// ─── Классификация «крон не бежал» ──────────────────────────────────────────
export function classifyCronStale(
  cronName: string,
  minutesSinceLastOk: number | null,
  thresholdMinutes: number,
  hasWork: boolean,
): WatchdogIssue | null {
  if (!hasWork) return null // нет работы — молчание крона не проблема
  if (minutesSinceLastOk === null) return null
  if (minutesSinceLastOk <= thresholdMinutes) return null
  return {
    severity: "critical",
    dedupKey: cronStaleDedupKey(cronName),
    companyId: null,
    title:    `Крон ${cronName} не бежал`,
    message:  `Последний успешный прогон ${cronName} был ${minutesSinceLastOk} мин назад (порог ${thresholdMinutes} мин), при этом есть необработанная работа.`,
    actionUrl: "/admin/platform",
  }
}

// ─── Классификация сбоя AI-скоринга ─────────────────────────────────────────
export function classifyAiScoringStuck(
  companyId: string,
  stuckCount: number,
  threshold = 3,
): WatchdogIssue | null {
  if (stuckCount <= threshold) return null
  return {
    severity: "warning",
    dedupKey: aiScoringStuckDedupKey(companyId),
    companyId,
    title:    "AI-скоринг сбоит",
    message:  `${stuckCount} кандидат(ов) за 24ч застряли с entry_gate_ai_scoring_stuck — AI не смог оценить резюме, нужен ручной разбор.`,
    actionUrl: "/hr/candidates",
  }
}

// ─── Классификация массового сбоя AI-вызовов (инцидент 13.07) ──────────────
// screenResume/scoreResumeByAxes (и др. AI-скореры) при сбое API тихо глотали
// ошибку → console.warn + return null, без структурированного лога. Лимит
// Anthropic исчерпан несколько часов подряд остался незамеченным (38
// кандидатов зависли без балла). lib/ai/failure-log.ts::logAiCallFailure
// теперь пишет каждый такой сбой в ai_call_failures; здесь — платформенный
// (across companies) порог за короткое скользящее окно. severity=critical
// (в отличие от classifyAiScoringStuck выше — этот сигнал куда быстрее и
// точнее указывает на первопричину, должен долетать до Telegram немедленно).
export function classifyAiOutageSpike(
  failureCount: number,
  windowMinutes: number,
  threshold = 5,
): WatchdogIssue | null {
  if (failureCount < threshold) return null
  return {
    severity: "critical",
    dedupKey: aiOutageSpikeDedupKey(),
    companyId: null,
    title:    "AI недоступен — массовый сбой вызовов",
    message:  `${failureCount} сбоев AI-вызовов (скоринг резюме/тестов/анкет) за последние ${windowMinutes} мин. Вероятная причина — исчерпан лимит Anthropic API или сбой прокси: проверьте console.anthropic.com/settings/limits и claude-proxy.jstumpf-de.workers.dev. Пока не починено — кандидаты не получают AI-оценку, часть приглашений может зависнуть.`,
    actionUrl: "/admin/platform",
  }
}

// ─── Классификация «слепого инвайта» без resume_score ───────────────────────
// Вакансии БЕЗ настроенного входного гейта (isEntryGateConfigured=false) при
// сбое AI-скоринга сохраняют legacy-поведение: приглашение уходит БЕЗ балла
// (см. комментарий «слепой инвайт при сбое AI» в lib/hh/process-queue.ts).
// Такой кандидат НЕ получает entry_gate_ai_scoring_stuck (эта причина ставится
// только когда гейт настроен) — invisible для classifyAiScoringStuck выше.
// Платформенный (не per-company) грубый индикатор: много кандидатов без
// resume_score, продвинутых по воронке — обычно и есть первый видимый симптом
// того же самого сбоя AI, который ловит classifyAiOutageSpike точнее.
export function classifyBlindInviteNoScore(
  count: number,
  threshold = 5,
): WatchdogIssue | null {
  if (count < threshold) return null
  return {
    severity: "critical",
    dedupKey: blindInviteNoScoreDedupKey(),
    companyId: null,
    title:    "Кандидаты продвинуты без AI-оценки резюме",
    message:  `${count} кандидат(ов) платформенно за последние 48ч продвинуты по воронке (stage≠new) без resume_score — похоже на «слепой инвайт» при сбое AI-скоринга (вакансии без входного гейта). Проверьте, не сбоит ли AI (см. также «AI недоступен»), и разберите кандидатов вручную.`,
    actionUrl: "/hr/candidates",
  }
}

// ─── Классификация расхождения «наша стадия vs реальная hh-папка» ──────────
// Инцидент 13.07: changeNegotiationState() в одном PUT и шлёт сообщение, и
// переводит hh-папку — у части кандидатов из-за устаревшего inviteHhStage=
// "consider" в vacancy_specs папка переводилась НЕ туда. Симметрично отправке
// (см. lib/hh/process-queue.ts:764 + lib/hh-api.ts:364-369): ожидаемое hh-
// состояние = spec.resumeThresholds.inviteHhStage конкретной вакансии
// (дефолт phone_interview) — двойной action↔state маппинг там взаимно
// сокращается до тождества, поэтому сравниваем напрямую.
export function classifyHhStageMismatch(
  candidateId: string,
  companyId: string,
  vacancyId: string,
  expectedHhState: string,
  actualHhState: string,
): WatchdogIssue | null {
  if (expectedHhState === actualHhState) return null
  return {
    severity: "critical",
    dedupKey: hhStageMismatchDedupKey(candidateId),
    companyId,
    title:    "Кандидат на hh не в той папке",
    message:  `Кандидат приглашён (ожидали hh-папку «${expectedHhState}»), но на hh.ru реально находится в «${actualHhState}» — наша воронка разошлась с hh. Проверьте вручную (могла отправиться не туда из-за настройки «Приглашать в стадию hh» в Портрете).`,
    actionUrl: `/hr/vacancies/${vacancyId}`,
  }
}

// Округление минут для стабильных сообщений/дедупа (не завязываемся на секунды).
export function minutesSince(date: Date | null, now: Date = new Date()): number | null {
  if (!date) return null
  return Math.floor((now.getTime() - date.getTime()) / 60_000)
}

// ─── Решение о Telegram-нотификации ─────────────────────────────────────────
// Шлём ТОЛЬКО если алерт реально СОЗДАН в этом прогоне (created=true) И он
// critical. created=false означает «открытый алерт с тем же dedup_key уже
// существует» — в т.ч. когда наша вставка проиграла гонку параллельному
// прогону (insert ON CONFLICT DO NOTHING вернул 0 строк): нотификацию уже
// отправил/отправит победитель, дублировать нельзя. Warning/info в Telegram
// не идут вовсе (только UI), чтобы не заспамить.
export function shouldNotifyTelegram(severity: WatchdogSeverity, created: boolean): boolean {
  return created && severity === "critical"
}
