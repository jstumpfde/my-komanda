export const BOOKING_STATUSES = [
  { id: "confirmed", label: "Подтверждена", color: "#3B82F6", icon: "Check" },
  { id: "completed", label: "Завершена",   color: "#10B981", icon: "CheckCheck" },
  { id: "cancelled", label: "Отменена",    color: "#EF4444", icon: "X" },
  { id: "no_show",   label: "Не пришёл",   color: "#F59E0B", icon: "UserX" },
] as const

export type BookingStatusId = (typeof BOOKING_STATUSES)[number]["id"]

export const RESOURCE_TYPES = [
  { id: "specialist", label: "Специалист",    icon: "User" },
  { id: "room",       label: "Кабинет/Зал",  icon: "DoorOpen" },
  { id: "equipment",  label: "Оборудование", icon: "Wrench" },
] as const

export type ResourceTypeId = (typeof RESOURCE_TYPES)[number]["id"]

export const BOOKING_MODES = [
  { id: "time_slots", label: "По времени", description: "Клиники, салоны, консультации", active: true },
  { id: "days",       label: "По дням",    description: "Отели, аренда, апартаменты",    active: false },
  { id: "request",    label: "По заявке",  description: "Автосервис, ремонт",            active: false },
] as const

export const DEFAULT_SCHEDULE: Record<string, { start: string; end: string; active: boolean }> = {
  mon: { start: "09:00", end: "18:00", active: true },
  tue: { start: "09:00", end: "18:00", active: true },
  wed: { start: "09:00", end: "18:00", active: true },
  thu: { start: "09:00", end: "18:00", active: true },
  fri: { start: "09:00", end: "18:00", active: true },
  sat: { start: "10:00", end: "15:00", active: false },
  sun: { start: "10:00", end: "15:00", active: false },
}

export const DEFAULT_BREAKS = [
  { start: "13:00", end: "14:00" },
]

export const DAY_LABELS: Record<string, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс",
}

export const SERVICE_COLORS = [
  "#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444",
  "#EC4899", "#06B6D4", "#84CC16",
]

export function getStatusById(id: string) {
  return BOOKING_STATUSES.find((s) => s.id === id)
}
