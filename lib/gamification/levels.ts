export const LEVELS = [
  { level: 1, name: "Новичок",      min: 0 },
  { level: 2, name: "Ученик",       min: 100 },
  { level: 3, name: "Специалист",   min: 300 },
  { level: 4, name: "Профессионал", min: 700 },
  { level: 5, name: "Эксперт",      min: 1500 },
  { level: 6, name: "Мастер",       min: 3000 },
]

export function calcLevel(points: number): number {
  let level = 1
  for (const l of LEVELS) {
    if (points >= l.min) level = l.level
  }
  return level
}

export function nextLevelPoints(points: number): number {
  const current = calcLevel(points)
  const next = LEVELS.find(l => l.level === current + 1)
  return next ? next.min : LEVELS[LEVELS.length - 1].min
}

export function levelInfo(level: number) {
  return LEVELS.find(l => l.level === level) ?? LEVELS[0]
}
