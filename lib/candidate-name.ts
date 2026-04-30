// Производит отображаемое имя кандидата с fallback-цепочкой:
//   1. candidates.name если он непустой и не равен placeholder-у
//   2. составное имя из anketa_answers (last + first + middle)
//   3. оригинальный name либо placeholder
//
// hh-кандидаты сохраняют имя в candidates.name напрямую при синке —
// fallback на anketa_answers нужен в первую очередь для прохождения
// демо: визит создаёт «Новый кандидат», блоки сохраняются в
// anketa_answers через /api/public/demo/[token]/answer, а имя из формы
// /apply иногда не доезжает (например, форма анкеты выключена в
// настройках вакансии). Тогда фронт всё равно увидит ФИО.

const PLACEHOLDER_NAME = "Новый кандидат"

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "string" && v.trim().length > 0) return v.trim()
  }
  return ""
}

export function deriveCandidateName(
  rawName: string | null | undefined,
  anketaAnswers: unknown,
): string {
  const name = (rawName ?? "").trim()
  if (name && name !== PLACEHOLDER_NAME) return name

  if (anketaAnswers && typeof anketaAnswers === "object") {
    // anketa_answers может быть массивом legacy записей [{question, answer}]
    // или объектом { firstName: "...", lastName: "..." }. В обоих случаях
    // достаём пары ключ/значение и пробуем найти имя.
    const flat: Record<string, unknown> = Array.isArray(anketaAnswers)
      ? Object.fromEntries(
          (anketaAnswers as unknown[])
            .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
            .flatMap((e) => Object.entries(e)),
        )
      : (anketaAnswers as Record<string, unknown>)

    const first = pickString(flat, "first_name", "firstName", "имя")
    const last  = pickString(flat, "last_name", "lastName", "фамилия")
    const mid   = pickString(flat, "middle_name", "middleName", "отчество")

    const composed = [last, first, mid].filter(Boolean).join(" ").trim()
    if (composed) return composed

    // Fallback: иногда сохраняют целиком в name/fullName
    const whole = pickString(flat, "name", "fullName", "full_name", "ФИО", "фио")
    if (whole) return whole
  }

  return name || PLACEHOLDER_NAME
}
