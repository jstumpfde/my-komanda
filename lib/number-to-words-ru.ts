const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]

function plural(n: number, one: string, two: string, five: string): string {
  const abs = Math.abs(n) % 100
  if (abs >= 11 && abs <= 19) return five
  const last = abs % 10
  if (last === 1) return one
  if (last >= 2 && last <= 4) return two
  return five
}

function triplet(n: number, feminine: boolean): string {
  if (n === 0) return ""
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const remainder = n % 100
  const t = Math.floor(remainder / 10)
  const o = remainder % 10

  if (h > 0) parts.push(HUNDREDS[h])
  if (t === 1) {
    parts.push(TEENS[o])
  } else {
    if (t > 1) parts.push(TENS[t])
    if (o > 0) parts.push(feminine ? ONES_F[o] : ONES_M[o])
  }
  return parts.join(" ")
}

/**
 * Конвертирует сумму в копейках в строку прописью.
 * Пример: 5590000 → "Пятьдесят пять тысяч девятьсот рублей 00 копеек"
 */
export function amountToWordsRu(kopecks: number): string {
  const rubles = Math.floor(Math.abs(kopecks) / 100)
  const kop = Math.abs(kopecks) % 100

  if (rubles === 0) {
    return `Ноль рублей ${String(kop).padStart(2, "0")} ${plural(kop, "копейка", "копейки", "копеек")}`
  }

  const groups: { value: number; words: [string, string, string]; feminine: boolean }[] = [
    { value: 0, words: ["рубль", "рубля", "рублей"], feminine: false },
    { value: 0, words: ["тысяча", "тысячи", "тысяч"], feminine: true },
    { value: 0, words: ["миллион", "миллиона", "миллионов"], feminine: false },
    { value: 0, words: ["миллиард", "миллиарда", "миллиардов"], feminine: false },
  ]

  let remainder = rubles
  for (let i = 0; i < groups.length && remainder > 0; i++) {
    groups[i].value = remainder % 1000
    remainder = Math.floor(remainder / 1000)
  }

  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g.value === 0) continue
    const t = triplet(g.value, g.feminine)
    parts.push(`${t} ${plural(g.value, g.words[0], g.words[1], g.words[2])}`)
  }

  const rublesStr = parts.join(" ")
  const capitalized = rublesStr.charAt(0).toUpperCase() + rublesStr.slice(1)
  return `${capitalized} ${String(kop).padStart(2, "0")} ${plural(kop, "копейка", "копейки", "копеек")}`
}
