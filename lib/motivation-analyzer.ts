// ── Анализ мотивации вакансии (локальный, без AI) ────────────────────────────

export interface MotivationCheck {
  status: "ok" | "warning" | "error"
  text: string
}

export interface MotivationAnalysis {
  score: number
  label: string
  checks: MotivationCheck[]
  suggestions: string[]
}

export function analyzeMotivation(data: {
  salaryMin?: number
  salaryMax?: number
  bonuses?: string
  payFrequency?: string[]
  category?: string
}): MotivationAnalysis {
  let score = 0
  const checks: MotivationCheck[] = []
  const suggestions: string[] = []
  const bonusText = (data.bonuses || "").toLowerCase()

  // 1. Зарплата указана — 20 баллов
  if (data.salaryMin && data.salaryMax) {
    score += 20
    checks.push({ status: "ok", text: `Вилка указана: ${Math.round(data.salaryMin / 1000)}к – ${Math.round(data.salaryMax / 1000)}к` })
  } else if (data.salaryMin) {
    score += 10
    checks.push({ status: "warning", text: "Укажите верхнюю границу — кандидаты хотят видеть потолок" })
  } else if (data.salaryMax) {
    score += 10
    checks.push({ status: "warning", text: "Укажите нижнюю границу — кандидаты хотят видеть минимум" })
  } else {
    checks.push({ status: "error", text: "Зарплата не указана — теряется до 50% откликов" })
  }

  // 2. Фикс указан — 15 баллов
  if (/фикс|оклад|ставка|гарантир/i.test(bonusText)) {
    score += 15
    checks.push({ status: "ok", text: "Указан фиксированный оклад" })
    // Проверить соотношение
    const fixMatch = bonusText.match(/(\d[\d\s]*)\s*₽?\s*(фикс|оклад)/i) || bonusText.match(/фикс[а-яё]*\s*(\d[\d\s]*)/i)
    if (fixMatch && data.salaryMin) {
      const fix = parseInt(fixMatch[1].replace(/\s/g, ""))
      if (!isNaN(fix) && fix > 0) {
        const ratio = fix / data.salaryMin
        if (ratio < 0.3) {
          checks.push({ status: "warning", text: `Фикс ${Math.round(fix / 1000)}к — менее 30% от минимума. Может отпугнуть кандидатов` })
        } else if (ratio >= 0.4 && ratio <= 0.7) {
          checks.push({ status: "ok", text: `Фикс ${Math.round(fix / 1000)}к — ${Math.round(ratio * 100)}% от минимума. Оптимально` })
        }
      }
    }
  } else {
    checks.push({ status: "warning", text: "Укажите размер фикса — кандидаты хотят знать гарантированную часть" })
    suggestions.push("Фикс XX 000 ₽ + KPI")
  }

  // 3. KPI/бонусная часть — 15 баллов
  if (/kpi|процент|бонус|премия|%/i.test(bonusText)) {
    score += 15
    checks.push({ status: "ok", text: "Указана бонусная часть (KPI/%)" })
  } else {
    suggestions.push("Опишите структуру бонусов: за что платится, какой % или сумма")
  }

  // 4. Конкретика бонусов — 15 баллов
  if (/за каждого|за клиент|за сделку|за выполнен|за перевыполн|за подключен/i.test(bonusText)) {
    score += 15
    checks.push({ status: "ok", text: "Конкретные условия бонусов" })
  } else if (/kpi|бонус|%/i.test(bonusText)) {
    score += 5
    suggestions.push("За каждого клиента — X ₽, за выполнение плана — +Y%")
  }

  // 5. Частота выплат — 10 баллов
  if (data.payFrequency && data.payFrequency.length > 0) {
    score += 10
    checks.push({ status: "ok", text: "Частота выплат указана" })
  } else {
    suggestions.push("Выберите частоту выплат")
  }

  // 6. Доп. бенефиты в бонусах — 10 баллов
  if (/отпуск|дмс|обучен|наставн|рост|карьер|13.*зарплат|квартальн/i.test(bonusText)) {
    score += 10
    checks.push({ status: "ok", text: "Упомянуты дополнительные бенефиты" })
  } else {
    suggestions.push("Оплачиваемый отпуск, 13-я зарплата, квартальная премия")
  }

  // 7. Потолок дохода — 5 баллов
  if (/без потолка|без ограничен|неограничен|и выше/i.test(bonusText)) {
    score += 5
    checks.push({ status: "ok", text: "\"Без потолка дохода\" — мотивирует сильных кандидатов" })
  } else if (data.category && /продаж/i.test(data.category)) {
    suggestions.push("Потолка дохода нет — если это правда, сильный аргумент для продажников")
  }

  // 8. Прозрачность / пример расчёта — 10 баллов
  if (/формула|расчёт|пример|сценарий|при \d|месяц.*~?\d/i.test(bonusText)) {
    score += 10
    checks.push({ status: "ok", text: "Есть пример расчёта — высокое доверие" })
  } else {
    suggestions.push("При 5 клиентах доход ~200к, при 10 — ~350к")
  }

  const clamped = Math.min(score, 100)
  const label = clamped >= 80 ? "Отлично" : clamped >= 60 ? "Хорошо" : clamped >= 40 ? "Средне" : "Слабо"
  return { score: clamped, label, checks, suggestions }
}
