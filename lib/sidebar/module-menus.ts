import { MODULE_REGISTRY } from '../modules/registry'
import type { ModuleId, MenuItem, MenuGroup } from '../modules/types'

export type { MenuGroup }

// Определение групп для каждого модуля (href → группа)
const MODULE_GROUP_DEFS: Partial<Record<ModuleId, { label: string; hrefs: string[]; legacy?: boolean }[]>> = {
  hr: [
    { label: 'Найм',       hrefs: ['/hr/workspace', '/hr/dashboard', '/hr/report', '/hr/vacancies', '/hr/candidates', '/hr/library', '/hr/talent-pool', '/hr/interviews', '/hr/hiring-settings'] },
    { label: 'Оргструктура', hrefs: ['/hr/company-structure', '/hr/org-structure', '/hr/departments', '/hr/positions'] },
    { label: 'В разработке', hrefs: ['/hr/courses'] },
    // Заглушки — скрыты из меню 10.06.2026, вернуть по мере реализации:
    // /hr/onboarding — нет API, мокап роутера к под-страницам
    // /hr/employees — нет page.tsx (только [id]/skills/page.tsx)
  ],

  // Заглушки — скрыты из меню 10.06.2026, вернуть по мере реализации:
  // marketing: весь модуль — нет ни одного API-вызова, все данные из demo-data.ts
  //   /marketing/dashboard, /marketing/content, /marketing/landings, /marketing/seo,
  //   /marketing/campaigns, /marketing/social, /marketing/email, /marketing/reviews,
  //   /marketing/analytics, /marketing/budget
  marketing: [],

  // logistics: весь модуль — нет ни одного API-вызова, только хардкод
  //   /logistics/dashboard, /logistics/requests, /logistics/quotes,
  //   /logistics/shipments, /logistics/carriers, /logistics/settings
  logistics: [],

  // warehouse: весь модуль — нет ни одного API-вызова, только хардкод
  //   /warehouse/dashboard, /warehouse/inventory, /warehouse/warehouses,
  //   /warehouse/orders, /warehouse/shipments, /warehouse/returns,
  //   /warehouse/suppliers, /warehouse/purchases, /warehouse/analytics, /warehouse/reports
  warehouse: [],

  // tasks: весь модуль — нет ни одного API-вызова, только локальный state (kanban-мокап)
  //   /tasks, /tasks/projects, /tasks/analytics
  tasks: [],

  // b2b: весь модуль — нет ни одного API-вызова
  //   /b2b, /b2b/accounts, /b2b/tenders, /b2b/analytics, /b2b/settings
  b2b: [],

  // booking: весь модуль — нет ни одного API-вызова
  //   /booking, /booking/services, /booking/resources, /booking/settings
  booking: [],

  // dialer: весь модуль — нет ни одного API-вызова
  //   /dialer, /dialer/scripts, /dialer/history, /dialer/settings
  dialer: [],

  // qc: весь модуль — нет ни одного API-вызова
  //   /qc, /qc/checklists, /qc/settings
  qc: [],
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

  // Для клиентов (директор/HR-менеджер и т.д.) — внутри HR оставляем
  // только «Вакансии». Пункты «Обзор» (/overview) и «Настройки найма»
  // (/hr/hiring-settings) скрыты из клиентского сайдбара — роуты остаются
  // доступны напрямую и в админских сайдбарах (platform_admin /
  // platform_manager используют ветку ниже с полным MODULE_GROUP_DEFS).
  if (isClientLite && moduleId === 'hr') {
    const items: MenuItem[] = []
    const vacancy = byHref.get('/hr/vacancies')
    if (vacancy) items.push(vacancy)
    return [{ label: 'Найм', items }]
  }

  return groupDefs.map(({ label, hrefs, legacy }) => ({
    label,
    legacy,
    items: hrefs.map((h) => byHref.get(h)).filter(Boolean) as MenuItem[],
  }))
}
