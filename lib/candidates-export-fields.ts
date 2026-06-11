// Каталог полей экспорта кандидатов — общий для клиентского диалога
// (галочки полей) и серверного роута (валидация ключей). Порядок колонок в
// самом .xlsx задаётся COLUMN_DEFS в route.ts; здесь — только для UI-чекбоксов.
export const CANDIDATE_EXPORT_FIELDS: Array<{ key: string; label: string }> = [
  { key: "fio",              label: "ФИО" },
  { key: "birthDate",        label: "Дата рождения" },
  { key: "age",              label: "Возраст" },
  { key: "city",             label: "Город" },
  { key: "salary",           label: "Зарплата" },
  { key: "responseDate",     label: "Дата отклика" },
  { key: "resumeScore",      label: "AI-резюме" },
  { key: "aiScore",          label: "AI-оценка" },
  { key: "demoProgress",     label: "Прогресс демо" },
  { key: "stage",            label: "Этап воронки" },
  { key: "source",           label: "Источник" },
  { key: "resumeUrl",        label: "Резюме hh" },
  // Базовые контакты
  { key: "phone",            label: "Телефон" },
  { key: "email",            label: "Email" },
  // Расширенные контакты из hh raw_data
  { key: "hhPhones",         label: "Все телефоны (hh)" },
  { key: "hhEmail",          label: "Email (hh)" },
  { key: "hhTelegram",       label: "Telegram (hh)" },
  { key: "hhWhatsapp",       label: "WhatsApp (hh)" },
  { key: "hhOtherLinks",     label: "Прочие контакты/ссылки" },
  { key: "preferredContact", label: "Предпочтит. связь" },
  { key: "telegramLinked",   label: "Telegram привязан" },
  // Ссылка на тест
  { key: "testLink",         label: "Ссылка на тест" },
  // Готовое персональное сообщение (имя + шаблон + ссылка) — копировать и отправить вручную
  { key: "personalMessage",  label: "Персональное сообщение" },
]

export const CANDIDATE_EXPORT_FIELD_KEYS = CANDIDATE_EXPORT_FIELDS.map(f => f.key)
