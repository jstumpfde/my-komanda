// Централизованное получение ИМЕНИ кандидата для подстановки {{name}} в
// шаблоны сообщений.
//
// Проблема: candidates.name хранится в формате "Фамилия Имя [Отчество]"
// (например "Петренко Александр"). Наивный split(/\s+/)[0] возвращал ФАМИЛИЮ —
// кандидату уходило сообщение «Петренко, привет!» вместо «Александр».
//
// Правильный источник имени — hh присылает его отдельным полем
// hh_responses.raw_data->'resume'->>'first_name' ("Александр", "Мариана").
// Если hh-связки/поля нет (manual / direct_link) — fallback на ВТОРОЕ слово
// candidates.name (формат "Фамилия Имя"), затем на первое слово, затем
// "Здравствуйте".
//
// Важно: candidates.name НЕ меняется — это только про подстановку в шаблон.

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, hhResponses } from "@/lib/db/schema"

export interface CandidateFirstName {
  firstName: string  // имя для подстановки {{name}}
  fallback:  boolean // true — имя из hh не нашли, использовали fallback по candidates.name
}

// Fallback по candidates.name: формат "Фамилия Имя [Отчество]" → берём ВТОРОЕ
// слово (имя). Если слово одно — его. Если пусто — "Здравствуйте".
function fallbackFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return parts[1] || parts[0] || "Здравствуйте"
}

export async function getCandidateFirstName(candidateId: string): Promise<CandidateFirstName> {
  // 1. candidates.name — источник для fallback.
  const [cand] = await db
    .select({ name: candidates.name })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  const fullName = (cand?.name ?? "").trim()

  // 2. hh_responses.raw_data->'resume'->>'first_name' — авторитетный источник.
  //    Кандидат может иметь несколько откликов — берём первый с непустым first_name.
  let hhFirstName = ""
  try {
    const rows = await db
      .select({ raw: hhResponses.rawData })
      .from(hhResponses)
      .where(eq(hhResponses.localCandidateId, candidateId))
      .limit(5)
    for (const r of rows) {
      const fn = (r.raw as { resume?: { first_name?: unknown } } | null)?.resume?.first_name
      if (typeof fn === "string" && fn.trim()) {
        hhFirstName = fn.trim()
        break
      }
    }
  } catch (err) {
    // Таблицы/связки может не быть в части окружений — тихо уходим в fallback.
    console.warn("[candidate-name] hh lookup failed:", err instanceof Error ? err.message : err)
  }

  if (hhFirstName) {
    return { firstName: hhFirstName, fallback: false }
  }

  const firstName = fallbackFromFullName(fullName)
  console.log("[candidate-name] fallback used", { candidateId, name: fullName })
  return { firstName, fallback: true }
}
