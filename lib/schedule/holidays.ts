// Список государственных праздников РФ (нерабочие дни по ТК).
// Используется в UI для чекбоксов «исключить эти дни» и в can-send-now
// для блокировки отправки. Дата без года — повторяется каждый год.

export const RU_HOLIDAYS = [
  { id: "dec_31", month: 12, day: 31, label: "Канун Нового года" },
  { id: "jan_1",  month: 1,  day: 1,  label: "Новый год" },
  { id: "jan_2",  month: 1,  day: 2,  label: "Новогодние" },
  { id: "jan_3",  month: 1,  day: 3,  label: "Новогодние" },
  { id: "jan_4",  month: 1,  day: 4,  label: "Новогодние" },
  { id: "jan_5",  month: 1,  day: 5,  label: "Новогодние" },
  { id: "jan_6",  month: 1,  day: 6,  label: "Новогодние" },
  { id: "jan_7",  month: 1,  day: 7,  label: "Рождество" },
  { id: "jan_8",  month: 1,  day: 8,  label: "Новогодние" },
  { id: "feb_23", month: 2,  day: 23, label: "День защитника Отечества" },
  { id: "mar_8",  month: 3,  day: 8,  label: "Международный женский день" },
  { id: "may_1",  month: 5,  day: 1,  label: "Праздник Весны и Труда" },
  { id: "may_9",  month: 5,  day: 9,  label: "День Победы" },
  { id: "jun_12", month: 6,  day: 12, label: "День России" },
  { id: "nov_4",  month: 11, day: 4,  label: "День народного единства" },
] as const

export type HolidayId = typeof RU_HOLIDAYS[number]["id"]

// Идентификаторы по умолчанию — те, которые компании обычно НЕ работают.
// Используется как defaultValue для column schedule_excluded_holiday_ids
// и для нового UI «отметить все».
export const DEFAULT_EXCLUDED_HOLIDAY_IDS: HolidayId[] = RU_HOLIDAYS.map((h) => h.id)
