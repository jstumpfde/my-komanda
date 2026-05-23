// Дефолтные вопросы анкеты для новых вакансий. Хранятся в
// vacancy.descriptionJson.anketaQuestions — отдельный массив рядом с
// существующей структурой PostDemoSettings.formFields (которая описывает
// предопределённые поля контакта, и её мы не трогаем).
//
// Юрий: воронка по умолчанию короткая (5 вопросов) — длинная отсеивает
// сильных кандидатов. Только для НОВЫХ вакансий; существующие не менять.

export type AnketaQuestionType =
  | "contacts"
  | "text"
  | "textarea"
  | "select"
  | "checkbox_group"

export interface AnketaQuestion {
  id:         string
  type:       AnketaQuestionType
  label:      string
  required:   boolean
  fields?:    string[]   // для type=contacts: ["name","phone","email"]
  options?:   string[]   // для select / checkbox_group
  maxLength?: number     // для text / textarea
}

export function buildDefaultAnketaQuestions(): AnketaQuestion[] {
  return [
    {
      id:       crypto.randomUUID(),
      type:     "contacts",
      label:    "Ваши контакты",
      required: true,
      fields:   ["name", "phone", "email"],
    },
    {
      id:        crypto.randomUUID(),
      type:      "text",
      label:     "Опыт работы (основная роль и сколько лет)",
      required:  true,
      maxLength: 200,
    },
    {
      id:       crypto.randomUUID(),
      type:     "checkbox_group",
      label:    "Подтвердите готовность к условиям",
      required: true,
      options:  [
        "Зарплата соответствует ожиданиям",
        "Готов к указанной локации",
        "Согласен с форматом работы (офис/удалённо/гибрид)",
      ],
    },
    {
      id:        crypto.randomUUID(),
      type:      "textarea",
      label:     "Почему вас заинтересовала эта вакансия?",
      required:  true,
      maxLength: 500,
    },
    {
      id:       crypto.randomUUID(),
      type:     "select",
      label:    "Когда готовы выйти на работу?",
      required: true,
      options:  [
        "Сразу",
        "Через 1-2 недели",
        "Через месяц",
        "Через 2+ месяцев",
      ],
    },
  ]
}
