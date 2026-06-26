// Разбор дня через Claude: из списка коммитов (тема + объём) собираем
// человеческий журнал, список осмысленных задач и оценку содержательности.
//
// Мерим задачи, а не коммиты: несколько коммитов одной фичи = одна задача;
// чистый деплой/линт/tsconfig — пустяк (trivial). Это защищает от накрутки
// объёма AI-кодингом.

import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { PERSON_LABEL } from "./config"
import type { DaySummary, DayTask, Substance } from "./types"

const anthropic = new Anthropic({
  apiKey:  process.env.ANTHROPIC_API_KEY,
  baseURL: getClaudeApiUrl(),
})

export interface CommitForSummary {
  repo:    string   // ярлык проекта
  subject: string
  added:   number
  removed: number
}

function parseJsonFromText<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("Ответ AI не содержит JSON")
  return JSON.parse(match[0]) as T
}

const VALID_KINDS: Substance[] = ["trivial", "normal", "substantial"]
function normalizeKind(k: unknown): Substance {
  return VALID_KINDS.includes(k as Substance) ? (k as Substance) : "normal"
}

function buildPrompt(day: string, commits: CommitForSummary[]): string {
  const lines = commits
    .map(c => `- [${c.repo}] ${c.subject}  (+${c.added}/-${c.removed})`)
    .join("\n")

  return `Ты — техлид, который ведёт журнал продуктивности разработчика по имени ${PERSON_LABEL}.
Ниже коммиты за один день (${day}) по нескольким проектам. Темы коммитов на русском (conventional commits).

Коммиты:
${lines}

Задача: собрать сжатый отчёт о проделанной работе за день. Правила:
1. Объединяй связанные коммиты в ОДНУ задачу (несколько правок одной фичи = одна задача).
2. Оцени содержательность каждой задачи:
   - "substantial" — новая фича/модуль/значимая логика;
   - "normal" — обычная доработка, заметный фикс, рефакторинг;
   - "trivial" — мелочь: правка деплой-скрипта, линт, tsconfig, опечатка, бамп версии.
3. taskCount — число ОСМЫСЛЕННЫХ задач (trivial можно не считать отдельной задачей, если это шум).
4. substance дня — общий тон: "substantial" если был крупный результат, "normal" если рутина, "trivial" если день почти пустой.
5. summary — 1-3 предложения живым языком: что реально сделано за день. Без воды, по делу.

Верни СТРОГО JSON без пояснений:
{
  "summary": "строка",
  "tasks": [{"repo": "ярлык проекта", "title": "что сделано", "kind": "substantial|normal|trivial"}],
  "taskCount": число,
  "substance": "substantial|normal|trivial"
}`
}

export async function summarizeDay(day: string, commits: CommitForSummary[]): Promise<DaySummary> {
  if (commits.length === 0) {
    return { summary: "", tasks: [], taskCount: 0, substance: "trivial" }
  }

  const msg = await anthropic.messages.create({
    model:       "claude-sonnet-4-6",
    max_tokens:  2000,
    temperature: 0,
    messages:    [{ role: "user", content: buildPrompt(day, commits) }],
  })
  const block = msg.content.find(b => b.type === "text")
  if (!block || block.type !== "text") throw new Error("AI не ответил")

  const parsed = parseJsonFromText<{
    summary?: string
    tasks?: Array<{ repo?: string; title?: string; kind?: string }>
    taskCount?: number
    substance?: string
  }>(block.text)

  const tasks: DayTask[] = (parsed.tasks ?? []).map(t => ({
    repo:  String(t.repo ?? "").trim() || "—",
    title: String(t.title ?? "").trim(),
    kind:  normalizeKind(t.kind),
  })).filter(t => t.title)

  const taskCount = Number.isFinite(parsed.taskCount)
    ? Math.max(0, Math.round(parsed.taskCount as number))
    : tasks.filter(t => t.kind !== "trivial").length

  return {
    summary:   String(parsed.summary ?? "").trim(),
    tasks,
    taskCount,
    substance: normalizeKind(parsed.substance),
  }
}
