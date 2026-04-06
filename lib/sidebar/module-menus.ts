import { MODULE_REGISTRY } from '../modules/registry'
import type { ModuleId, MenuItem, MenuGroup } from '../modules/types'

export type { MenuGroup }

// Определение групп для каждого модуля (href → группа)
const MODULE_GROUP_DEFS: Partial<Record<ModuleId, { label: string; hrefs: string[]; legacy?: boolean }[]>> = {
  hr: [
    { label: 'Найм',       hrefs: ['/hr/dashboard', '/hr/vacancies', '/hr/candidates', '/hr/talent-pool', '/hr/calendar', '/hr/hiring-settings'] },
    { label: 'Адаптация',  hrefs: ['/hr/onboarding', '/hr/assignments', '/hr/adaptation-analytics'] },
    { label: 'Персонал',   hrefs: ['/hr/employees', '/hr/courses', '/hr/development', '/hr/retention', '/hr/people-analytics'] },
    { label: 'CRM',        hrefs: ['/sales/clients', '/sales/contacts'] },
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
