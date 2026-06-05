// Группа 38: централизованный брендинг компании + per-vacancy override.
//
// Источник истины — companies.{logoUrl, brandPrimaryColor, brandBgColor,
// brandTextColor, brandingJson}. По умолчанию vacancy.brandingOverrideEnabled
// = false → используем company-уровень. Если HR явно включил override —
// читаем из vacancy.descriptionJson.branding.

import { DEFAULT_BRAND } from "@/lib/brand-colors"

export interface EffectiveBranding {
  source:          "company" | "vacancy" | "default"
  logoUrl:         string | null
  primaryColor:    string
  backgroundColor: string
  textColor:       string
  accentColor:     string
  fontFamily:      string
  slogan:          string | null
  website:         string | null
}

export interface CompanyBrandingInput {
  logoUrl?:           string | null
  brandPrimaryColor?: string | null
  brandBgColor?:      string | null
  brandTextColor?:    string | null
  brandingJson?:      { accentColor?: string; fontFamily?: string } | null
  brandSlogan?:       string | null
  website?:           string | null
}

export interface VacancyBrandingInput {
  brandingOverrideEnabled?: boolean | null
  descriptionJson?:         Record<string, unknown> | null
}

const FALLBACK_ACCENT = "#10b981"
const FALLBACK_FONT   = "inter"

interface LegacyVacancyBranding {
  logo?:    string
  color?:   string
  slogan?:  string
  website?: string
}

export function getEffectiveBranding(
  vacancy: VacancyBrandingInput | null | undefined,
  company: CompanyBrandingInput | null | undefined,
): EffectiveBranding {
  // 1. Override на вакансии — самый высокий приоритет.
  const overrideOn = vacancy?.brandingOverrideEnabled === true
  if (overrideOn) {
    const dj = vacancy?.descriptionJson ?? {}
    const vb = (dj as Record<string, unknown>).branding as LegacyVacancyBranding | undefined
    if (vb) {
      return {
        source:          "vacancy",
        logoUrl:         typeof vb.logo === "string" && vb.logo ? vb.logo : (company?.logoUrl ?? null),
        primaryColor:    vb.color || company?.brandPrimaryColor || DEFAULT_BRAND.primary,
        backgroundColor: company?.brandBgColor || DEFAULT_BRAND.bg,
        textColor:       company?.brandTextColor || DEFAULT_BRAND.text,
        accentColor:     company?.brandingJson?.accentColor || FALLBACK_ACCENT,
        fontFamily:      company?.brandingJson?.fontFamily || FALLBACK_FONT,
        slogan:          (typeof vb.slogan === "string" && vb.slogan) ? vb.slogan : (company?.brandSlogan ?? null),
        website:         (typeof vb.website === "string" && vb.website) ? vb.website : (company?.website ?? null),
      }
    }
  }

  // 2. Уровень компании — дефолт для всех вакансий.
  if (company) {
    return {
      source:          "company",
      logoUrl:         company.logoUrl ?? null,
      primaryColor:    company.brandPrimaryColor || DEFAULT_BRAND.primary,
      backgroundColor: company.brandBgColor      || DEFAULT_BRAND.bg,
      textColor:       company.brandTextColor    || DEFAULT_BRAND.text,
      accentColor:     company.brandingJson?.accentColor || FALLBACK_ACCENT,
      fontFamily:      company.brandingJson?.fontFamily  || FALLBACK_FONT,
      slogan:          company.brandSlogan ?? null,
      website:         company.website ?? null,
    }
  }

  // 3. Совсем без данных — дефолты.
  return {
    source:          "default",
    logoUrl:         null,
    primaryColor:    DEFAULT_BRAND.primary,
    backgroundColor: DEFAULT_BRAND.bg,
    textColor:       DEFAULT_BRAND.text,
    accentColor:     FALLBACK_ACCENT,
    fontFamily:      FALLBACK_FONT,
    slogan:          null,
    website:         null,
  }
}
