import { MODULE_REGISTRY } from '../modules/registry'
import type { ModuleId, MenuItem, MenuGroup } from '../modules/types'

export type { MenuGroup }

// Определение групп для каждого модуля (href → группа)
const MODULE_GROUP_DEFS: Partial<Record<ModuleId, { label: string; hrefs: string[]; legacy?: boolean }[]>> = {
  hr: [
    { label: 'Найм',       hrefs: ['/hr/dashboard', '/hr/vacancies', '/hr/library', '/hr/candidates', '/hr/talent-pool', '/hr/analytics', '/hr/calendar', '/hr/hiring-settings'] },
    { label: 'Адаптация',  hrefs: ['/hr/assignments', '/hr/adaptation-analytics'] },
    { label: 'Оргструктура', hrefs: ['/hr/org-structure', '/hr/departments', '/hr/positions'] },
    { label: 'В разработке', hrefs: ['/hr/onboarding', '/hr/employees', '/hr/courses', '/hr/development', '/hr/retention', '/hr/people-analytics'] },
  ],
  marketing: [
    { label: 'Контент',    hrefs: ['/marketing/dashboard', '/marketing/content', '/marketing/landings'] },
    { label: 'Продвижение', hrefs: ['/marketing/seo', '/marketing/campaigns', '/marketing/social', '/marketing/email'] },
    { label: 'Аналитика',  hrefs: ['/marketing/reviews', '/marketing/analytics', '/marketing/budget'] },
  ],
  logistics: [
    { label: 'Операции',      hrefs: ['/logistics/dashboard', '/logistics/requests', '/logistics/quotes'] },
    { label: 'Исполнение',    hrefs: ['/logistics/shipments', '/logistics/carriers'] },
    { label: 'Конфигурация',  hrefs: ['/logistics/settings'] },
  ],
  warehouse: [
    { label: 'Склад',       hrefs: ['/warehouse/dashboard', '/warehouse/inventory', '/warehouse/warehouses'] },
    { label: 'Заказы',      hrefs: ['/warehouse/orders', '/warehouse/shipments', '/warehouse/returns'] },
    { label: 'Поставщики',  hrefs: ['/warehouse/suppliers', '/warehouse/purchases'] },
    { label: 'Аналитика',   hrefs: ['/warehouse/analytics', '/warehouse/reports'] },
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

export function getModuleGroups(moduleId: ModuleId, isClientLite?: boolean): MenuGroup[] {
  const groupDefs = MODULE_GROUP_DEFS[moduleId]
  if (!groupDefs) {
    return [{ label: '', items: MODULE_REGISTRY[moduleId]?.menuItems ?? [] }]
  }
  const allItems = MODULE_REGISTRY[moduleId]?.menuItems ?? []
  const byHref = new Map(allItems.map((item) => [item.href, item]))

  // Для клиентов (директор/HR-менеджер и т.д.) — внутри HR показываем
  // только базовый набор: Дашборд HR, Вакансии, Настройки найма.
  // Остальные пункты (Talent Pool, Аналитика, Календарь, ...) скрыты —
  // это углублённый HR-инструмент для платформенных ролей.
  if (isClientLite && moduleId === 'hr') {
    const wantedHrefs = ['/hr/dashboard', '/hr/vacancies', '/hr/hiring-settings']
    const items = wantedHrefs.map(h => {
      const item = byHref.get(h)
      if (!item) return undefined
      // Локально переименовываем «Дашборд» → «Дашборд HR», чтобы не
      // путать с другими «Дашбордами» в сайдбаре. Registry не трогаем —
      // там лейбл нужен в контексте админского полного меню.
      if (h === '/hr/dashboard') return { ...item, label: 'Дашборд HR' }
      return item
    }).filter(Boolean) as MenuItem[]
    if (items.length > 0) {
      return [{ label: 'Найм', items }]
    }
  }

  return groupDefs.map(({ label, hrefs, legacy }) => ({
    label,
    legacy,
    items: hrefs.map((h) => byHref.get(h)).filter(Boolean) as MenuItem[],
  }))
}
