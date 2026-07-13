// Универсальный рендерер шаблонов с поддержкой 5 legacy-синтаксисов.
//
// Canonical:   {{name}}, {{vacancy}}, {{company}}, {{demo_link}},
//              {{salary_from}}, {{salary_to}}, {{interview_at}},
//              {{tg_upload_link}} (запасной канал загрузки видео через бота)
// Legacy (читаем для обратной совместимости, навсегда):
//   - {{key}} / {key} / [key] / любой регистр / русские алиасы из ALIASES.
//
// Гарантии:
//   1. Один проход — подставленное значение НЕ перепарсивается
//      (защита от двойной подстановки, если value содержит «{{name}}»).
//   2. Неизвестная переменная → литерал «{{key}}» в результате + warn.
//   3. Пустое value → пустая строка.
//
// Используется во всех точках отправки кандидатам: hh process-queue,
// scan-incoming (call-intent), cron follow-up, prequalification reminders,
// anketa confirmation, automation send-message и т.д.

import { inCityRu } from "./city-case-ru"

const ALIASES: Record<string, string> = {
  // ─── имя ─────────────────
  "имя":                       "name",
  "Имя":                       "name",
  "ИМЯ":                       "name",
  "имя_кандидата":             "name",
  "name":                      "name",
  "Name":                      "name",
  // ─── должность ────────────
  "должность":                 "vacancy",
  "Должность":                 "vacancy",
  "vacancy":                   "vacancy",
  "Vacancy":                   "vacancy",
  "position":                  "vacancy",
  // ─── компания ─────────────
  "компания":                  "company",
  "Компания":                  "company",
  "company":                   "company",
  "Company":                   "company",
  // ─── ссылка на демо ───────
  "ссылка":                    "demo_link",
  "Ссылка":                    "demo_link",
  "ссылка_на_демонстрацию":    "demo_link",
  "ссылка_на_демо":            "demo_link",
  "demo_link":                 "demo_link",
  "link":                      "demo_link",
  // ─── ссылка на тест ───────
  "ссылка_на_тест":            "test_link",
  "тест_ссылка":               "test_link",
  "test_link":                 "test_link",
  // ─── ссылка на запись (интервью) ──
  "ссылка_на_запись":          "schedule_link",
  "записаться_на_интервью":    "schedule_link",
  "schedule_link":             "schedule_link",
  // ─── менеджер (подпись) ───
  "менеджер":                  "manager",
  "Менеджер":                  "manager",
  "имя_менеджера":             "manager",
  "manager":                   "manager",
  "Manager":                   "manager",
  // ─── ЗП и интервью ────────
  "зп_от":                     "salary_from",
  "зп_до":                     "salary_to",
  "salary_from":               "salary_from",
  "salary_to":                 "salary_to",
  "дата_время":                "interview_at",
  "interview_at":              "interview_at",
  // ─── запасной канал загрузки видео (Telegram-бот) ───
  "ссылка_на_бота":            "tg_upload_link",
  "tg_upload_link":            "tg_upload_link",
  // ─── ссылка на встречу (Zoom и т.п.) + контакты HR ───
  "ссылка_на_встречу":         "meeting_link",
  "meeting_link":              "meeting_link",
  "контакты":                  "contacts",
  "контакты_hr":               "contacts",
  "contacts":                  "contacts",
  // ─── перенос интервью: новые дата/время (reschedule-and-notify) ───
  "новая_дата":                "new_date",
  "new_date":                  "new_date",
  "новое_время":               "new_time",
  "new_time":                  "new_time",
  // ─── город: именительный (city) и «в …» — предложный падеж (city_in).
  //     city_in автоматически выводится из city через lib/city-case-ru.ts;
  //     если точка отправки city не передаёт — см. passthrough в
  //     renderTemplate (литерал сохраняется, warn не шумит) ───
  "город":                     "city",
  "Город":                     "city",
  "city":                      "city",
  "City":                      "city",
  "в_городе":                  "city_in",
  "В_городе":                  "city_in",
  "city_in":                   "city_in",
}

// Регулярка единым проходом ловит:
//   {{...}}  — canonical (двойные фигурные)
//   {...}    — single brace (одинарные фигурные)
//   [...]    — square brackets
// Внутри допустимы кириллица/латиница/цифры/_ — это все формы из ALIASES.
// Захваты:
//   1: содержимое {{...}}
//   2: содержимое {...}
//   3: содержимое [...]
const PLACEHOLDER_RE = /\{\{([^{}\[\]]+?)\}\}|\{([^{}\[\]]+?)\}|\[([^\[\]]+?)\]/g

function resolveKey(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Прямое попадание (canonical name, latin lowercase и др.)
  if (ALIASES[trimmed]) return ALIASES[trimmed]
  // Кейс-инсенситивный поиск по русским вариантам
  // (например, «должность» в любом регистре).
  const lower = trimmed.toLowerCase()
  if (ALIASES[lower]) return ALIASES[lower]
  return null
}

export function renderTemplate(
  text: string,
  vars: Record<string, string>,
): string {
  if (!text) return ""
  // «в_городе»/city_in выводится из city автоматически (единая грамматика
  // городов — lib/city-case-ru.ts), явно переданный city_in важнее.
  const cityIn = vars.city_in ?? (vars.city !== undefined ? inCityRu(vars.city) : undefined)
  return text.replace(PLACEHOLDER_RE, (match, doubleBrace?: string, singleBrace?: string, square?: string) => {
    const raw = doubleBrace ?? singleBrace ?? square ?? ""
    const canonical = resolveKey(raw)
    if (!canonical) {
      // Не наш плейсхолдер — оставляем как есть (может быть JSON, обычный
      // текст в фигурных скобках и т.п.). Не warn'им — слишком шумно.
      return match
    }
    const value = canonical === "city_in" ? cityIn : vars[canonical]
    if (value === undefined) {
      if (canonical === "city" || canonical === "city_in") {
        // Город есть не во всех точках отправки: пока вызывающий код его не
        // передаёт, сохраняем текст байт-в-байт (как до введения переменной)
        // и не шумим warn'ом.
        return match
      }
      console.warn(`[template-renderer] Unknown variable "${canonical}" (matched "${match}") — left as literal`)
      return `{{${canonical}}}`
    }
    return value ?? ""
  })
}
