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
    message:  "hh.ru интеграция деактивирована (refresh_token отвергнут) — нужна ручная переподключка в Настройках → Интеграции.",
    actionUrl: "/settings/integrations",
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
