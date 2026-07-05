// Общие форматтеры для модуля «Мониторинг цен».

/** Относительное время на русском ("5 минут назад", "вчера", "3 июл, 14:20"). */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return "только что"
  if (diffMin < 60) return `${diffMin} ${pluralMinutes(diffMin)} назад`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} ${pluralHours(diffHours)} назад`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "вчера"
  if (diffDays < 7) return `${diffDays} ${pluralDays(diffDays)} назад`

  return formatDateTime(iso)
}

/** Абсолютные дата+время на русском ("5 июл, 09:00"). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const day = date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  return `${day.replace(".", "")}, ${time}`
}

function pluralMinutes(n: number): string {
  return pluralRu(n, "минуту", "минуты", "минут")
}
function pluralHours(n: number): string {
  return pluralRu(n, "час", "часа", "часов")
}
function pluralDays(n: number): string {
  return pluralRu(n, "день", "дня", "дней")
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

/** Склонение «ночь/ночи/ночей» для заголовков периодов (1 ночь, 3 ночи, 5 ночей). */
export function nightsLabel(n: number): string {
  return pluralRu(n, "ночь", "ночи", "ночей")
}
