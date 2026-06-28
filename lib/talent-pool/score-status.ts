// Единый источник: балл резерва → статус. Канон — пороги списка Резерва и
// scoring-badge (то, что HR видит в UI): ideal≥86 / hot≥61 / warming≥31 / cold.
// Раньше API записей и аналитики использовали другие пороги (80/65/40) →
// один кандидат показывался по-разному в списке, записи и аналитике (F5).
export type TalentScoreStatus = "cold" | "warming" | "hot" | "ideal"

export function scoreToStatus(score: number): TalentScoreStatus {
  if (score >= 86) return "ideal"
  if (score >= 61) return "hot"
  if (score >= 31) return "warming"
  return "cold"
}
