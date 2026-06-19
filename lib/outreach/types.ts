// Модуль «Проработка базы» (outreach) — единый промежуточный формат строки
// после парсинга/маппинга любого источника, ДО записи в БД.

export type SourceType =
  | "globusved"   // ГлобусВЭД: импортёры с объёмами поставок и странами
  | "regional"    // GVмскМО*: импортёры по региону + контактные лица/почты/телефоны
  | "portal"      // выгрузка портала (широкая, 200+ колонок)
  | "egrul"       // ЕГРЮЛ-выгрузка: ОКВЭД/ОГРН/телефоны/мессенджеры
  | "calls"       // журнал звонков: организация/контакт/телефоны
  | "unknown"

export type ContactKind = "phone" | "email" | "person" | "whatsapp" | "telegram" | "site"

export interface UnifiedContact {
  kind: ContactKind
  value: string        // нормализованное значение
  valueRaw?: string    // как было в файле
  personName?: string  // ФИО (для kind=person или владельца контакта)
  position?: string
}

export interface UnifiedTrade {
  direction?: "import" | "export"
  tnvedCodes?: string[]
  countries?: string[]
  suppliesCount?: number
  supplySumUsd?: number
  supplySumRub?: number
  weightNet?: number
  revenueRub?: number
  year?: number
}

// Одна нормализованная компания (лид) из строки файла.
export interface UnifiedRow {
  inn?: string
  name?: string
  fullName?: string
  region?: string
  address?: string
  website?: string
  okvedCode?: string
  okvedName?: string
  ogrn?: string
  kpp?: string
  segment?: string                 // сегмент (роль/сфера деятельности)
  data?: Record<string, unknown>   // прочие колонки, что не легли в поля
  contacts: UnifiedContact[]
  trade?: UnifiedTrade
}

// Сырая строка файла: объект «заголовок → значение».
export type RawRow = Record<string, unknown>
