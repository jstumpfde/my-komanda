/**
 * Хелпер разрешения эффективных настроек интеграций для вакансии.
 *
 * 3-уровневая модель (Уровень 3 = Вакансия):
 *   - Если vacancy.integrationsOverride.enabled === true → используем поля вакансии.
 *   - Иначе → наследуем настройки компании (company-level, hiringDefaultsJson).
 *
 * Поведение по умолчанию (enabled = false/undefined) НЕ меняется:
 * возвращаются те же данные, что и раньше читались напрямую из hiringDefaults.
 */

interface WebhookConfig {
  url:    string | null
  events: Record<string, boolean>
}

interface BitrixConfig {
  url:     string | null
  trigger: string | null
}

interface CompanyWebhooks {
  url?:    string
  events?: Record<string, boolean>
}

interface CompanyBitrix {
  url?:     string
  trigger?: string
}

interface VacancyIntegrationsOverride {
  enabled?:  boolean
  webhooks?: { url?: string; events?: Record<string, boolean> }
  bitrix?:   { url?: string; trigger?: string }
}

/**
 * Возвращает эффективный webhook-конфиг для вакансии.
 * Если override включён — берёт url/events из вакансии, иначе из компании.
 */
export function resolveVacancyWebhook(
  vacancyOverride: VacancyIntegrationsOverride | null | undefined,
  companyWebhooks:  CompanyWebhooks | null | undefined,
): WebhookConfig {
  const override = vacancyOverride ?? {}

  if (override.enabled === true && override.webhooks !== undefined) {
    // Вакансия переопределяет
    return {
      url:    override.webhooks.url ?? null,
      events: override.webhooks.events ?? {},
    }
  }

  // Наследуем компанию
  return {
    url:    companyWebhooks?.url ?? null,
    events: companyWebhooks?.events ?? {},
  }
}

/**
 * Возвращает эффективный Битрикс-конфиг для вакансии.
 * Если override включён — берёт url/trigger из вакансии, иначе из компании.
 */
export function resolveVacancyBitrix(
  vacancyOverride: VacancyIntegrationsOverride | null | undefined,
  companyBitrix:   CompanyBitrix | null | undefined,
): BitrixConfig {
  const override = vacancyOverride ?? {}

  if (override.enabled === true && override.bitrix !== undefined) {
    // Вакансия переопределяет
    return {
      url:     override.bitrix.url ?? null,
      trigger: override.bitrix.trigger ?? null,
    }
  }

  // Наследуем компанию
  return {
    url:     companyBitrix?.url ?? null,
    trigger: companyBitrix?.trigger ?? null,
  }
}
