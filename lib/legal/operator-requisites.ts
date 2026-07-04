// Реквизиты Оператора персональных данных для ПЛАТФОРМЕННЫХ юридических
// документов Company24.pro (Политика конфиденциальности, Оферта, Согласие на
// рекламную рассылку — /privacy, /terms, /marketing-consent).
//
// НЕ путать с lib/legal/default-privacy-policy.ts — та генерирует политику
// ПО ЗАКАЗЧИКАМ (арендаторам HR-модуля) для их СОБСТВЕННЫХ соискателей,
// на основе реквизитов компании-клиента. Этот файл — реквизиты самого
// оператора платформы Company24.pro.
//
// Источник реквизитов — те же, что уже используются в собственных счетах
// платформы (lib/billing/invoice-pdf-html.ts, lib/billing/act-pdf-html.ts):
// Company24.pro работает на юрлице ИП Штумпф Юрий Геннадьевич (то же лицо
// оперирует и MarketRadar на marketradar24.ru — см. VENDOR_* в его .env).
export const OPERATOR_REQUISITES = {
  legalName: "Индивидуальный предприниматель Штумпф Юрий Геннадьевич",
  inn: "550615955642",
  // ОГРНИП совпадает с указанным в реквизитах того же ИП на marketradar24.ru
  // (lib/requisites.ts VENDOR_OGRN) — не задваивался отдельно в биллинге
  // Company24.pro, оставлен как есть; Юрию стоит перепроверить при случае.
  ogrnip: "317774600595262",
  legalAddress: "123290, г. Москва, ул. Шелепихинская наб., д. 34, оф. 704",
  phone: "+7 (926) 483-77-88",
  email: "admin@company24.pro",
} as const

// Версии документов — дата последней смысловой правки текста. Меняйте при
// каждой правке содержимого страницы, чтобы в consent_log.document_version
// однозначно фиксировалось, на какую редакцию было дано согласие.
export const PRIVACY_POLICY_VERSION = "2026-07-04"
export const TERMS_OFFER_VERSION = "2026-07-04"
export const MARKETING_CONSENT_VERSION = "2026-07-04"
export const COOKIE_POLICY_VERSION = "2026-07-04"
