// Единый источник истины для дефолтов брендинга публичных страниц.
// Используется на /vacancy/[slug] и /demo/[token].
// Дефолты: белый фон + тёмный текст + синий акцент — нейтральная тема
// если у компании не заполнены поля brand_primary_color / brand_bg_color / brand_text_color.

export const DEFAULT_BRAND = {
  primary: "#3b82f6",  // синий акцент (кнопки, прогресс-бар, иконки)
  bg: "#ffffff",       // белый фон
  text: "#0f172a",     // почти-чёрный текст (slate-900)
} as const

export interface BrandColors {
  brandPrimaryColor?: string | null
  brandBgColor?: string | null
  brandTextColor?: string | null
}

export function resolveBrand(company: BrandColors) {
  return {
    primary: company.brandPrimaryColor || DEFAULT_BRAND.primary,
    bg: company.brandBgColor || DEFAULT_BRAND.bg,
    text: company.brandTextColor || DEFAULT_BRAND.text,
  }
}
