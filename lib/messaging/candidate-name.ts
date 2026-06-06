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

// Заглушки, которыми бэкфиллится candidates.name когда hh не дал имени.
// Это НЕ имена — приветствие по ним выглядело криво («с, привет» из второго
// слова "Кандидат с hh.ru»). Трактуем как «имени нет» → нейтральное приветствие.
const NON_NAME_VALUES = new Set(["кандидат с hh.ru", "кандидат"])

// Похоже ли значение на реальное имя, по которому можно обращаться?
// Отсекаем: пусто, заглушки бэкфилла («Кандидат с hh.ru»), «скрытое имя» с hh
// («Аноним» / «Анонимный соискатель»). По ним обращаться по имени нельзя —
// нужно нейтральное «Здравствуйте» (а не «Здравствуйте, Аноним»).
function isRealName(s: string | null | undefined): boolean {
  const c = (s ?? "").trim().toLowerCase()
  if (!c) return false
  if (NON_NAME_VALUES.has(c)) return false
  if (/hh\.ru/.test(c)) return false
  if (/аноним/.test(c)) return false
  return true
}

// Fallback по candidates.name: формат "Фамилия Имя [Отчество]" → берём ВТОРОЕ
// слово (имя). Если слово одно — его. Если пусто/заглушка/аноним — "Здравствуйте".
function fallbackFromFullName(fullName: string): string {
  if (!isRealName(fullName)) return "Здравствуйте"
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const name = parts[1] || parts[0] || ""
  return isRealName(name) ? name : "Здравствуйте"
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

  if (hhFirstName && isRealName(hhFirstName)) {
    return { firstName: hhFirstName, fallback: false }
  }

  const firstName = fallbackFromFullName(fullName)
  console.log("[candidate-name] fallback used", { candidateId, name: fullName })
  return { firstName, fallback: true }
}
