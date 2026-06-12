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
import { isKnownGivenName } from "@/lib/messaging/russian-given-names"

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
// слово (имя). Если слово ОДНО — оно неоднозначно (см. ниже) → "Здравствуйте".
// Если пусто/заглушка/аноним — тоже "Здравствуйте".
function fallbackFromFullName(fullName: string): string {
  if (!isRealName(fullName)) return "Здравствуйте"
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  // Формат "Фамилия Имя [Отчество]" → имя = ВТОРОЕ слово.
  if (parts.length >= 2) {
    return isRealName(parts[1]) ? parts[1] : "Здравствуйте"
  }
  // Одно слово неоднозначно: у hh-кандидатов со скрытым именем это почти всегда
  // ФАМИЛИЯ. Обращаться по ней («Здравствуйте, Петренко») — та самая ошибка
  // «фамилия вместо имени». Безопаснее нейтральное приветствие, чем угадывать.
  return "Здравствуйте"
}

// Первое слово токена (на случай «Игорь Вячеславович» в одном поле hh).
function word1(s: string): string {
  return s.trim().split(/\s+/)[0] ?? ""
}

// ЧИСТЫЙ резолвер имени из уже-загруженных частей — БЕЗ обращения к БД.
// Используется и хелпером getCandidateFirstName (после выборки), и местами, где
// raw hh-данные уже на руках (рассылка, экспорт), чтобы логика была ОДНА.
//
// Устойчив к перепутанным полям hh (кандидат вписал фамилию в «Имя») и к
// неизвестному порядку слов в ФИО: берёт ПЕРВЫЙ токен, опознанный словарём как
// имя. Приоритет: hh first_name → hh last_name → слова candidates.name.
// Если словарь молчит (имя редкое/нерусское) — валидный hh first_name, иначе
// fallback по ФИО. Возвращает токен с оригинальным регистром либо «Здравствуйте».
export type NameSource =
  | "override"      // ручная коррекция HR
  | "hh_first"      // hh first_name опознан словарём как имя (норма)
  | "hh_last_swap"  // имя нашлось в hh last_name — поля перепутаны
  | "fullname"      // имя нашлось в словах candidates.name
  | "hh_first_raw"  // словарь молчит, взяли hh first_name как есть (МОЖЕТ быть фамилией)
  | "neutral"       // имени нет — нейтральное «Здравствуйте»

export interface GivenNameMeta {
  firstName: string
  source:    NameSource
  confident: boolean   // false → стоит проверить глазами (источник ненадёжен)
}

// Мета-резолвер: имя + ОТКУДА взято + уверенность. Единственный источник правды
// для определения имени; pickGivenName — тонкая обёртка над ним.
export function resolveGivenNameMeta(opts: {
  override?: string | null
  hhFirst?: string | null
  hhLast?:  string | null
  fullName?: string | null
}): GivenNameMeta {
  const override = (opts.override ?? "").trim()
  if (override && isRealName(override)) {
    return { firstName: word1(override), source: "override", confident: true }
  }

  const hhFirst  = (opts.hhFirst ?? "").trim()
  const hhLast   = (opts.hhLast ?? "").trim()
  const fullName = (opts.fullName ?? "").trim()
  const fullWords = fullName.split(/\s+/).filter(Boolean)
  const w1f = word1(hhFirst)
  const w1l = word1(hhLast)

  if (w1f && isKnownGivenName(w1f) && isRealName(w1f)) {
    return { firstName: w1f, source: "hh_first", confident: true }
  }
  if (w1l && isKnownGivenName(w1l) && isRealName(w1l)) {
    // Имя опознано в поле «Фамилия» hh — кандидат перепутал поля. Словарь
    // уверен, но помечаем источник, чтобы HR при желании глянул.
    return { firstName: w1l, source: "hh_last_swap", confident: true }
  }
  for (const w of fullWords) {
    if (isKnownGivenName(w) && isRealName(w)) {
      return { firstName: w, source: "fullname", confident: true }
    }
  }
  if (hhFirst && isRealName(hhFirst)) {
    // Имя не из словаря (редкое/нерусское) — берём hh first_name как есть, но
    // НЕ уверены: вдруг это фамилия. Такие строки HR стоит проверить.
    return { firstName: word1(hhFirst), source: "hh_first_raw", confident: false }
  }
  return { firstName: fallbackFromFullName(fullName), source: "neutral", confident: false }
}

// Тонкая обёртка: только имя (для подстановки {{name}}).
export function pickGivenName(opts: {
  override?: string | null
  hhFirst?: string | null
  hhLast?:  string | null
  fullName?: string | null
}): string {
  return resolveGivenNameMeta(opts).firstName
}

export async function getCandidateFirstName(candidateId: string): Promise<CandidateFirstName> {
  // 1. candidates.name — источник для fallback.
  const [cand] = await db
    .select({ name: candidates.name, firstNameOverride: candidates.firstNameOverride })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  const fullName = (cand?.name ?? "").trim()
  const override = (cand?.firstNameOverride ?? "").trim()

  // 2. hh_responses.raw_data->'resume' — first_name И last_name. Кандидат может
  //    иметь несколько откликов — берём первый, где есть имя/фамилия.
  //    ВАЖНО: hh-поля бывают ПЕРЕПУТАНЫ самим кандидатом (вписал фамилию в «Имя»,
  //    имя в «Фамилию») — напр. first_name="Макаренко", last_name="Сергей".
  //    Поэтому ниже не доверяем порядку, а опознаём имя по словарю.
  let hhFirstName = ""
  let hhLastName  = ""
  try {
    const rows = await db
      .select({ raw: hhResponses.rawData })
      .from(hhResponses)
      .where(eq(hhResponses.localCandidateId, candidateId))
      .limit(5)
    for (const r of rows) {
      const resume = (r.raw as { resume?: { first_name?: unknown; last_name?: unknown } } | null)?.resume
      const fn = resume?.first_name
      const ln = resume?.last_name
      if (!hhFirstName && typeof fn === "string" && fn.trim()) hhFirstName = fn.trim()
      if (!hhLastName  && typeof ln === "string" && ln.trim()) hhLastName  = ln.trim()
      if (hhFirstName && hhLastName) break
    }
  } catch (err) {
    // Таблицы/связки может не быть в части окружений — тихо уходим в fallback.
    console.warn("[candidate-name] hh lookup failed:", err instanceof Error ? err.message : err)
  }

  // 3. Единый чистый резолвер (override HR → словарь имён, устойчив к перепутанным полям hh).
  const firstName = pickGivenName({ override, hhFirst: hhFirstName, hhLast: hhLastName, fullName })
  // Ручная коррекция или опознанное имя — это НЕ fallback.
  const recognized =
    (!!override && isRealName(override)) ||
    isKnownGivenName(firstName) || (!!hhFirstName && isRealName(hhFirstName) && firstName === word1(hhFirstName))
  if (!recognized) {
    console.log("[candidate-name] fallback used", { candidateId, name: fullName })
  }
  return { firstName, fallback: !recognized }
}
