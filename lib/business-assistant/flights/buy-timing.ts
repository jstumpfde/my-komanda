// Бизнес-ассистент → Авиабилеты → «Когда покупать». Строит рекомендацию по
// выбранному маршруту+дате из (а) календаря цен по месяцу и (б) эвристик
// глубины покупки (внутренние/международные рейсы дешевеют/дорожают по-разному
// в зависимости от того, сколько недель осталось до вылета).
import { seedHash } from "./date-utils"

export type BuyVerdict = "buy_now" | "can_wait" | "watch"

export interface BuyTimingResult {
  verdict:            BuyVerdict
  verdictLabel:       string   // «покупать сейчас» / «можно подождать» / «следить»
  reasons:             string[]
  cheapestDatesNearby: { date: string; price: number }[]
  approximate:         boolean  // true = мок-данные, честно предупреждаем в UI
}

// Известные IATA/город-коды российских направлений — грубая эвристика
// "внутренний рейс vs международный". Не претендует на полноту справочника
// аэропортов, только для выбора окна глубины покупки.
const RU_DOMESTIC_CODES = new Set([
  "MOW", "SVO", "DME", "VKO", "LED", "AER", "KZN", "OVB", "SVX", "ROV",
  "KRR", "UFA", "VOZ", "KUF", "PEE", "CEK", "OMS", "KJA", "IKT", "VVO",
  "KHV", "TJM", "STW", "MRV", "GOJ", "KGD", "ARH", "MMK", "UUS", "PKC",
  "NUX", "NJC", "OGZ", "MCX", "NBC", "GDZ", "AAQ", "ASF", "VOG", "KVX",
  "UUD", "RGK", "KUF", "IAR",
])

export function isDomesticRoute(originIata: string, destinationIata: string): boolean {
  return RU_DOMESTIC_CODES.has(originIata.toUpperCase()) && RU_DOMESTIC_CODES.has(destinationIata.toUpperCase())
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`)
  const to = new Date(`${toISO}T00:00:00Z`)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Мок-календарь цен на месяц, окружающий departDate, с правдоподобной
 *  сезонностью (выходные — дороже, вт/ср — дешевле). Деterministic по seed
 *  от даты+маршрута, чтобы повторные запросы не "мерцали". */
export function mockMonthPriceMatrix(
  originIata: string,
  destinationIata: string,
  departDate: string,
  basePrice: number,
  windowDays = 30,
): { date: string; price: number }[] {
  const center = new Date(`${departDate}T00:00:00Z`)
  const matrix: { date: string; price: number }[] = []
  const half = Math.floor(windowDays / 2)
  for (let offset = -half; offset <= half; offset++) {
    const d = new Date(center)
    d.setUTCDate(d.getUTCDate() + offset)
    const date = d.toISOString().slice(0, 10)
    const dow = d.getUTCDay() // 0=вс, 6=сб
    const weekendFactor = dow === 0 || dow === 6 ? 1.25 : dow === 2 || dow === 3 ? 0.85 : 1.0
    const seed = seedHash(`${originIata}${destinationIata}${date}month`)
    const noise = 0.92 + ((seed % 100) / 100) * 0.16 // 0.92..1.08
    const price = Math.max(1000, Math.round(basePrice * weekendFactor * noise))
    matrix.push({ date, price })
  }
  return matrix
}

interface TravelpayoutsMonthRow {
  price: number
  departure_at: string
}

async function fetchRealMonthMatrix(
  originIata: string,
  destinationIata: string,
  monthISO: string, // YYYY-MM
  token: string,
): Promise<{ date: string; price: number }[]> {
  const query = new URLSearchParams({
    origin: originIata,
    destination: destinationIata,
    departure_at: monthISO,
    sorting: "price",
    limit: "60",
    token,
  })
  const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${query.toString()}`)
  if (!res.ok) throw new Error(`Travelpayouts API ${res.status}`)
  const body = (await res.json()) as { data: TravelpayoutsMonthRow[] }

  // Несколько предложений на одну дату — берём минимум по дате.
  const byDate = new Map<string, number>()
  for (const row of body.data) {
    const date = row.departure_at?.slice(0, 10)
    if (!date) continue
    const prev = byDate.get(date)
    if (prev == null || row.price < prev) byDate.set(date, row.price)
  }
  return [...byDate.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Календарь цен вокруг departDate — реальный Travelpayouts (если есть
 *  токен) или правдоподобный мок с сезонностью. approximate=true для мока —
 *  UI обязан честно показать пометку "оценка приблизительная". */
export async function getMonthPriceMatrix(
  originIata: string,
  destinationIata: string,
  departDate: string,
  basePriceForMock: number,
): Promise<{ matrix: { date: string; price: number }[]; approximate: boolean }> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN
  if (token) {
    try {
      const monthISO = departDate.slice(0, 7)
      const matrix = await fetchRealMonthMatrix(originIata, destinationIata, monthISO, token)
      if (matrix.length > 0) return { matrix, approximate: false }
    } catch {
      // провайдер недоступен — тихо падаем в мок ниже
    }
  }
  return { matrix: mockMonthPriceMatrix(originIata, destinationIata, departDate, basePriceForMock), approximate: true }
}

export interface BuyTimingInput {
  originIata:      string
  destinationIata: string
  departDate:      string
  currentPriceRub: number
  monthMatrix:     { date: string; price: number }[]  // календарь цен вокруг departDate
  approximate:     boolean                             // true, если matrix — мок (нет реального провайдера)
  today?:          string                               // для тестов; по умолчанию — сегодня
}

/** Чистая функция построения рекомендации — без сети, тестируема напрямую. */
export function buildBuyTimingRecommendation(input: BuyTimingInput): BuyTimingResult {
  const today = input.today ?? todayISO()
  const daysUntil = daysBetween(today, input.departDate)
  const domestic = isDomesticRoute(input.originIata, input.destinationIata)

  // Окно "оптимальной глубины покупки": внутренние ~2-8 недель, международные ~6-16 недель.
  const windowLowDays = domestic ? 14 : 42
  const windowHighDays = domestic ? 56 : 112

  const reasons: string[] = []
  let verdict: BuyVerdict

  if (daysUntil < 0) {
    verdict = "watch"
    reasons.push("Дата вылета уже в прошлом — проверьте параметры поиска.")
  } else if (daysUntil <= windowLowDays) {
    verdict = "buy_now"
    reasons.push(
      daysUntil <= 7
        ? "До вылета меньше недели — цены на этом этапе обычно только растут."
        : `До вылета ${daysUntil} дн. — это уже поздний этап, дешевле вряд ли будет.`,
    )
  } else if (daysUntil > windowHighDays) {
    verdict = "watch"
    reasons.push(
      `До вылета ещё ${daysUntil} дн. (${domestic ? "внутренний" : "международный"} рейс) — рано для устойчивого прогноза, цены могут измениться в любую сторону.`,
    )
  } else {
    verdict = "can_wait"
    reasons.push(
      `Сейчас ${daysUntil} дн. до вылета — вы в окне обычно наиболее выгодных цен для ${domestic ? "внутреннего" : "международного"} рейса (${windowLowDays}-${windowHighDays} дн.).`,
    )
  }

  // Сверяем текущую цену с медианой календаря — если она уже заметно ниже, покупать сейчас.
  const prices = input.monthMatrix.map((m) => m.price).sort((a, b) => a - b)
  if (prices.length > 0) {
    const median = prices[Math.floor(prices.length / 2)]
    const min = prices[0]
    if (input.currentPriceRub <= min * 1.03) {
      verdict = "buy_now"
      reasons.push("Текущая цена — одна из самых низких в календаре за этот период.")
    } else if (median > 0 && input.currentPriceRub > median * 1.15 && verdict !== "buy_now") {
      reasons.push("Текущая цена заметно выше медианной по календарю — есть смысл присмотреться к соседним датам.")
    }
  }

  if (input.approximate) {
    reasons.push("Оценка приблизительная — календарь построен на модели, не на реальных данных провайдера.")
  }

  const cheapestDatesNearby = [...input.monthMatrix]
    .filter((m) => m.date !== input.departDate)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3)

  const verdictLabel: Record<BuyVerdict, string> = {
    buy_now: "покупать сейчас",
    can_wait: "можно подождать",
    watch: "следить",
  }

  return {
    verdict,
    verdictLabel: verdictLabel[verdict],
    reasons,
    cheapestDatesNearby,
    approximate: input.approximate,
  }
}
