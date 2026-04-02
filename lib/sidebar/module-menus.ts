import { MODULE_REGISTRY } from '../modules/registry'
import type { ModuleId, MenuItem, MenuGroup } from '../modules/types'

export type { MenuGroup }

// Определение групп для каждого модуля (href → группа)
const MODULE_GROUP_DEFS: Partial<Record<ModuleId, { label: string; hrefs: string[]; legacy?: boolean }[]>> = {
  hr: [
    { label: 'Найм',          hrefs: ['/hr/overview', '/hr/vacancies', '/hr/candidates', '/hr/funnel', '/hr/demo-editor', '/hr/calendar'] },
    { label: 'Настройки HR',  hrefs: ['/hr/settings/notifications', '/hr/settings/schedule', '/hr/settings/funnel-stages', '/hr/settings/templates', '/hr/settings/sources'] },
    { label: 'Адаптация',     hrefs: ['/hr/onboarding', '/hr/adaptation/plans', '/hr/adaptation/assignments', '/hr/buddy', '/hr/adaptation/gamification', '/hr/adaptation/analytics'] },
    { label: 'Lifecycle',     hrefs: ['/hr/preboarding', '/hr/offboarding'] },
    { label: 'Обучение',      hrefs: ['/hr/courses', '/hr/certificates'] },
    { label: 'Развитие',      hrefs: ['/hr/talent-pool', '/hr/skills', '/hr/assessments'] },
    { label: 'Аналитика HR',  hrefs: ['/hr/flight-risk', '/hr/pulse-surveys', '/hr/reskilling', '/hr/predictive-hiring', '/hr/analytics'] },
    { label: 'Инструменты',   hrefs: ['/hr/marketplace', '/hr/ai-assistant'] },
    { label: 'Обзор',         hrefs: ['/overview', '/referrals'] },
  ],
  marketing: [
    { label: 'Контент',    hrefs: ['/marketing/dashboard', '/marketing/content', '/marketing/landings'] },
    { label: 'Продвижение', hrefs: ['/marketing/seo', '/marketing/campaigns', '/marketing/social', '/marketing/email'] },
    { label: 'Аналитика',  hrefs: ['/marketing/reviews', '/marketing/analytics', '/marketing/budget'] },
  ],
  sales: [
    { label: 'CRM',         hrefs: ['/sales/dashboard', '/sales/deals', '/sales/pipeline'] },
    { label: 'Клиенты',     hrefs: ['/sales/clients', '/sales/contacts'] },
    { label: 'Активности',  hrefs: ['/sales/tasks', '/sales/meetings', '/sales/products'] },
    { label: 'Аналитика',   hrefs: ['/sales/analytics', '/sales/forecasts'] },
  ],
  logistics: [
    { label: 'Склад',       hrefs: ['/logistics/dashboard', '/logistics/inventory', '/logistics/warehouses'] },
    { label: 'Заказы',      hrefs: ['/logistics/orders', '/logistics/shipments', '/logistics/returns'] },
    { label: 'Поставщики',  hrefs: ['/logistics/suppliers', '/logistics/purchases'] },
    { label: 'Аналитика',   hrefs: ['/logistics/analytics', '/logistics/reports'] },
  ],
}

export function getModuleMenuItems(activeModules: ModuleId[]) {
  return activeModules
    .filter((id) => MODULE_REGISTRY[id])
    .map((id) => ({
      module: MODULE_REGISTRY[id],
      items: MODULE_REGISTRY[id].menuItems,
    }))
}

export function getModuleGroups(moduleId: ModuleId): MenuGroup[] {
  const groupDefs = MODULE_GROUP_DEFS[moduleId]
  if (!groupDefs) {
    return [{ label: '', items: MODULE_REGISTRY[moduleId]?.menuItems ?? [] }]
  }
  const allItems = MODULE_REGISTRY[moduleId]?.menuItems ?? []
  const byHref = new Map(allItems.map((item) => [item.href, item]))
  return groupDefs.map(({ label, hrefs, legacy }) => ({
    label,
    legacy,
    items: hrefs.map((h) => byHref.get(h)).filter(Boolean) as MenuItem[],
  }))
}
