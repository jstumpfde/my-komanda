// Общие типы для страницы /schedule/[token] —
// используются в schedule-data.ts, schedule-client.tsx и API route.

export interface MethodConfig {
  method:   string
  label:    string
  enabled:  boolean
  duration: number // минуты
  buffer:   number // минуты буфера после встречи
}

export interface SlotDay {
  date:  string   // "YYYY-MM-DD"
  label: string   // "Пн, 9 июн"
  slots: string[] // ["09:00","09:30",...]
}

export interface SchedulePageData {
  candidateName:      string
  candidateFirstName: string
  vacancyTitle:       string
  companyName:        string
  companyLogo:        string | null
  brandPrimaryColor:  string
  brandBgColor:       string
  timezone:           string
  // Человекочитаемая подпись пояса, например «Москва (UTC+3)».
  // Кандидат пояс НЕ выбирает — показываем как есть.
  timezoneLabel:      string
  officeAddress:      string | null
  methods:            MethodConfig[]
  defaultMethod:      string
  days:               SlotDay[]
}

// Ответ POST /api/public/schedule/[token] — данные для экрана "Вы записаны"
// (тексты + слот в ISO UTC для календарных ссылок/.ics на клиенте).
export interface BookingResponse {
  booked?:        boolean
  alreadyBooked?: boolean
  eventId:        string
  bookedTitle:    string
  bookedText:     string
  startAt:        string // ISO UTC
  endAt:          string // ISO UTC
  timezone:       string
  methodLabel:    string
  location:       string | null
  vacancyTitle:   string
}
