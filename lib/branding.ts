export interface BrandConfig {
  primaryColor: string
  bgColor: string
  textColor: string
  logoUrl: string | null
  companyName: string
  greetingTemplate: string
  plan: "trial" | "starter" | "business" | "pro"
}

export const DEFAULT_BRAND: BrandConfig = {
  primaryColor: "#3b82f6",
  bgColor: "#f0f4ff",
  textColor: "#1e293b",
  logoUrl: null,
  companyName: "ООО Ромашка",
  greetingTemplate: "Привет, {name}! 👋",
  plan: "business",
}

export const BRAND_PRESETS: { id: string; label: string; emoji: string; primary: string; bg: string; text: string }[] = [
  { id: "light", label: "Светлая", emoji: "☀️", primary: "#3b82f6", bg: "#f8fafc", text: "#1e293b" },
  { id: "dark", label: "Тёмная", emoji: "🌙", primary: "#818cf8", bg: "#1e1b2e", text: "#e2e8f0" },
  { id: "brand", label: "Под бренд", emoji: "🎨", primary: "#1B4FD8", bg: "#eef2ff", text: "#1e293b" },
  { id: "neutral", label: "Нейтральная", emoji: "⚪", primary: "#6b7280", bg: "#f9fafb", text: "#374151" },
]

const STORAGE_KEY = "hireflow-brand"

export function getBrand(): BrandConfig {
  if (typeof window === "undefined") return DEFAULT_BRAND
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_BRAND, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_BRAND
}

export function saveBrand(config: Partial<BrandConfig>) {
  if (typeof window === "undefined") return
  const current = getBrand()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...config }))
}

export function canCustomizeBrand(plan: BrandConfig["plan"]): boolean {
  return plan === "business" || plan === "pro"
}

export function canCustomDomain(plan: BrandConfig["plan"]): boolean {
  return plan === "pro"
}

// CSS variables for public pages
export function brandCssVars(brand: BrandConfig): React.CSSProperties {
  return {
    "--brand-primary": brand.primaryColor,
    "--brand-bg": brand.bgColor,
    "--brand-text": brand.textColor,
  } as React.CSSProperties
}
