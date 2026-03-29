import { MODULE_REGISTRY } from '../modules/registry'
import type { ModuleId, MenuItem } from '../modules/types'

export interface MenuGroup {
  label: string
  items: MenuItem[]
}

// Определение групп для каждого модуля (href → группа)
const MODULE_GROUP_DEFS: Partial<Record<ModuleId, { label: string; hrefs: string[] }[]>> = {
  hr: [
    { label: 'Найм',          hrefs: ['/hr/vacancies', '/hr/candidates', '/hr/funnel', '/hr/demo-editor'] },
    { label: 'Адаптация',     hrefs: ['/hr/onboarding', '/hr/adaptation/plans', '/hr/adaptation/assignments', '/hr/buddy', '/hr/adaptation/gamification', '/hr/adaptation/analytics'] },
    { label: 'Lifecycle',     hrefs: ['/hr/preboarding', '/hr/offboarding'] },
    { label: 'Обучение',      hrefs: ['/hr/courses', '/hr/certificates'] },
    { label: 'Развитие',      hrefs: ['/hr/talent-pool', '/hr/skills', '/hr/assessments'] },
    { label: 'Аналитика HR',  hrefs: ['/hr/flight-risk', '/hr/pulse-surveys', '/hr/reskilling', '/hr/predictive-hiring', '/hr/analytics'] },
    { label: 'Инструменты',  hrefs: ['/hr/marketplace', '/hr/ai-assistant'] },
    { label: 'Обзор',         hrefs: ['/overview', '/hr/interviews', '/referrals'] },
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
