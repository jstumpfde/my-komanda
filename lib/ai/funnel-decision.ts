// Фаза 2 «бот ведёт» — МОЗГ (без рук). Решает, какой следующий шаг воронки
// уместен по текущему диалогу, НО сам ничего не отправляет и не двигает. Решение
// возвращается наружу: в песочницу (для проверки HR) и в лог. Исполнение —
// отдельный слой (Фаза 2b), под per-вакансия тумблерами autonomy.*.
//
// Принцип безопасности: бот предлагает действие ТОЛЬКО из списка разрешённых
// (allowed) — то, что HR явно включил. Никогда не предлагает интервью.

import { callClaudeHaiku } from "@/lib/ai/client"

export type FunnelAction =
  | "none"            // просто ответить, шаг воронки не нужен
  | "clarify"         // не хватает данных — задать уточняющий вопрос
  | "request_anketa"  // кандидат вовлечён → предложить демо+анкету
  | "send_test"       // готов → отправить тестовое задание
  | "advance"         // двинуть стадию вперёд без нового контента

export interface FunnelDecision {
  action:     FunnelAction
  reason:     string
  confidence: number   // 0..1
}

export interface FunnelDecisionInput {
  stageLabel:    string | null
  resumeSummary: string | null
  latestMessage: string
  history:       Array<{ role: "user" | "assistant"; text: string }>
  /** Действия, которые HR разрешил (из autonomy.*). Бот выбирает только из них. */
  allowed:       FunnelAction[]
}

const ACTION_DESC: Record<FunnelAction, string> = {
  none:           "ничего не делать (просто ответить на вопрос)",
  clarify:        "задать уточняющий вопрос — кандидат не дал важных данных",
  request_anketa: "предложить заполнить анкету/посмотреть демо — кандидат вовлечён и в целом подходит",
  send_test:      "отправить тестовое задание — кандидат прошёл предыдущие шаги и готов",
  advance:        "перевести на следующий этап без нового контента",
}

// Эвристическая страховка, если AI вернул мусор: безопасный дефолт — none.
function safeParse(raw: string, allowed: Set<FunnelAction>): FunnelDecision {
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return { action: "none", reason: "no_json", confidence: 0 }
    const j = JSON.parse(m[0]) as { action?: string; reason?: string; confidence?: number }
    const action = (j.action ?? "none") as FunnelAction
    const ok = allowed.has(action) || action === "none" || action === "clarify"
    return {
      action: ok ? action : "none",
      reason: typeof j.reason === "string" ? j.reason.slice(0, 200) : "",
      confidence: typeof j.confidence === "number" ? Math.max(0, Math.min(1, j.confidence)) : 0.5,
    }
  } catch {
    return { action: "none", reason: "parse_error", confidence: 0 }
  }
}

// Решает следующий шаг. allowed=[] (ничего не разрешено) → сразу none, без вызова AI.
export async function decideFunnelNextStep(input: FunnelDecisionInput): Promise<FunnelDecision> {
  const allowedSet = new Set(input.allowed)
  // clarify не требует разрешения (это просто вопрос в чате), но если нечего
  // разрешено двигать — нет смысла гонять AI.
  if (input.allowed.length === 0) return { action: "none", reason: "nothing_allowed", confidence: 1 }

  const allowedList = ["none", "clarify", ...input.allowed.filter(a => a !== "none" && a !== "clarify")]
  const histText = input.history.slice(-6)
    .map(t => `${t.role === "user" ? "Кандидат" : "Мы"}: ${t.text}`).join("\n")

  const system = `Ты — помощник рекрутера. По диалогу с кандидатом реши, какой СЛЕДУЮЩИЙ шаг воронки уместен ПРЯМО СЕЙЧАС. Выбирай ТОЛЬКО из разрешённых действий. Если сомневаешься — "none". Никогда не предлагай назначить интервью. Верни СТРОГО JSON: {"action": "...", "reason": "кратко по-русски", "confidence": 0..1}.

Разрешённые действия:
${allowedList.map(a => `- ${a}: ${ACTION_DESC[a as FunnelAction]}`).join("\n")}`

  const user = `Этап в воронке: ${input.stageLabel ?? "неизвестен"}
${input.resumeSummary ? `Резюме (кратко):\n${input.resumeSummary}\n` : ""}
Диалог:
${histText || "(пусто)"}
Последнее сообщение кандидата: "${input.latestMessage}"

Какой следующий шаг? Ответь JSON.`

  try {
    const raw = await callClaudeHaiku(user, system, 300)
    return safeParse(raw, allowedSet)
  } catch (err) {
    console.warn("[funnel-decision] failed:", err instanceof Error ? err.message : err)
    return { action: "none", reason: "ai_error", confidence: 0 }
  }
}

// Собирает список разрешённых действий из конфига автономности.
export function allowedActionsFromAutonomy(a: {
  enabled?: boolean; canRequestAnketa?: boolean; canSendTest?: boolean; canAdvanceStage?: boolean
} | undefined): FunnelAction[] {
  if (!a?.enabled) return []
  const out: FunnelAction[] = []
  if (a.canRequestAnketa) out.push("request_anketa")
  if (a.canSendTest)      out.push("send_test")
  if (a.canAdvanceStage)  out.push("advance")
  return out
}
