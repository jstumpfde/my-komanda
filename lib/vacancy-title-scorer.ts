// ── Скоринг названия вакансии (локальный, без AI) ────────────────────────────

export interface TitleCheck {
  status: "ok" | "warning" | "error"
  text: string
}

export interface TitleScore {
  score: number
  label: string
  checks: TitleCheck[]
}

export function scoreVacancyTitle(
  title: string,
  context: { format?: string; city?: string; salaryMin?: number } = {},
): TitleScore {
  if (!title.trim()) return { score: 0, label: "Слабо", checks: [{ status: "error", text: "Введите название вакансии" }] }

  let score = 0
  const checks: TitleCheck[] = []

  // 1. Длина (оптимум 25-65 символов) — до 15 баллов
  const len = title.length
  if (len >= 25 && len <= 65) {
    score += 15
    checks.push({ status: "ok", text: `Длина ${len} — оптимально` })
  } else if (len >= 15 && len < 25) {
    score += 8
    checks.push({ status: "warning", text: `Короткое (${len}). Рекомендуем 30-60 символов` })
  } else if (len > 65) {
    score += 5
    checks.push({ status: "warning", text: `Длинное (${len}). Может обрезаться в поиске hh.ru` })
  } else {
    checks.push({ status: "error", text: `Слишком короткое (${len})` })
  }

  // 2. Должность узнаваема — до 20 баллов
  const knownTitles = [
    "руководитель", "менеджер", "head of", "директор", "специалист",
    "аналитик", "разработчик", "дизайнер", "маркетолог", "бухгалтер",
    "рекрутер", "продакт", "инженер", "администратор", "оператор",
    "логист", "юрист", "тестировщик", "devops", "консультант",
  ]
  const hasKnownTitle = knownTitles.some(t => title.toLowerCase().includes(t))
  if (hasKnownTitle) {
    score += 20
    checks.push({ status: "ok", text: "Должность узнаваема" })
  } else {
    checks.push({ status: "warning", text: "Название нестандартное — может потерять в поиске" })
  }

  // 3. Формат работы — до 15 баллов
  if (/удалён|remote/i.test(title)) {
    score += 15
    checks.push({ status: "ok", text: "Указан формат работы (удалённо)" })
  } else if (/офис|гибрид|hybrid/i.test(title)) {
    score += 10
    checks.push({ status: "ok", text: "Указан формат работы" })
  } else if (context.format === "remote" || context.format === "Удалёнка") {
    score += 3
    checks.push({ status: "warning", text: "Добавьте «удалённо» в название — +15% к откликам" })
  } else {
    checks.push({ status: "warning", text: "Добавьте формат работы (удалённо/офис) — +15% к откликам" })
  }

  // 4. Ниша/отрасль — до 15 баллов
  const hasNiche = /b2b|b2c|saas|it|digital|финтех|логистик|медицин|недвижим|horeca|торгов|e-com|edtech/i.test(title)
  if (hasNiche) {
    score += 15
    checks.push({ status: "ok", text: "Указана ниша/отрасль" })
  } else {
    checks.push({ status: "warning", text: "Добавьте нишу (B2B, SaaS, IT...) — помогает целевым кандидатам" })
  }

  // 5. Зарплата в названии — до 10 баллов
  const hasSalary = /\d{2,3}\s*[кk]|от\s*\d{2,3}/i.test(title)
  if (hasSalary) {
    score += 10
    checks.push({ status: "ok", text: "Зарплата в названии — сильно повышает CTR" })
  } else if (context.salaryMin && context.salaryMin > 0) {
    checks.push({ status: "warning", text: `Добавьте «от ${Math.round(context.salaryMin / 1000)}к» — повышает CTR на 20-30%` })
  } else {
    checks.push({ status: "warning", text: "Зарплата в названии повышает CTR на 20-30%" })
  }

  // 6. Мотивирующие слова — до 10 баллов
  const hasPowerWords = /с нуля|построен|масштаб|рост|развити|лидер|head of|lead/i.test(title)
  if (hasPowerWords) {
    score += 10
    checks.push({ status: "ok", text: "Есть мотивирующие слова" })
  }

  // 7. Нет мусорных слов — до 5 баллов
  const hasJunk = /срочно|!!!|hot|внимани|шок|топ\s*вакан/i.test(title)
  if (!hasJunk) {
    score += 5
  } else {
    checks.push({ status: "error", text: "Уберите «срочно/!!!» — снижает доверие" })
  }

  // 8. Бонус за полноту — до 10 баллов
  const wordCount = title.trim().split(/\s+/).length
  if (wordCount >= 4 && wordCount <= 8) {
    score += 10
  }

  const clamped = Math.min(score, 100)
  const label = clamped >= 80 ? "Отлично" : clamped >= 60 ? "Хорошо" : clamped >= 40 ? "Средне" : "Слабо"
  return { score: clamped, label, checks }
}
