import { MODULE_REGISTRY } from '../modules/registry'
import type { ModuleId, MenuItem } from '../modules/types'

export interface MenuGroup {
  label: string
  items: MenuItem[]
}

// Определение групп для каждого модуля (href → группа)
const MODULE_GROUP_DEFS: Partial<Record<ModuleId, { label: string; hrefs: string[] }[]>> = {
  hr: [
    { label: 'Найм',         hrefs: ['/hr/vacancies', '/hr/candidates', '/hr/interviews', '/hr/sources', '/hr/demo-editor'] },
    { label: 'Адаптация',    hrefs: ['/hr/onboarding'] },
    { label: 'Обучение',     hrefs: [] },
    { label: 'Развитие',     hrefs: ['/hr/talent-pool'] },
    { label: 'Аналитика HR', hrefs: ['/hr/analytics'] },
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
  return groupDefs.map(({ label, hrefs }) => ({
    label,
    items: hrefs.map((h) => byHref.get(h)).filter(Boolean) as MenuItem[],
  }))
}
