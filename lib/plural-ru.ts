// Универсальное русское склонение существительных по числу.
// pluralRu(1, ["год","года","лет"]) → "год"; (3) → "года"; (5) → "лет".
export function pluralRu(n: number, forms: [one: string, few: string, many: string]): string {
  const abs = Math.abs(Math.trunc(n)) % 100
  const n1 = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (n1 > 1 && n1 < 5) return forms[1]
  if (n1 === 1) return forms[0]
  return forms[2]
}

/** "1 год", "3 года", "5 лет", "11 лет". */
export function yearsRu(n: number): string {
  return `${n} ${pluralRu(n, ["год", "года", "лет"])}`
}
