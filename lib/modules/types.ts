export type ModuleId = 'hr' | 'marketing' | 'sales' | 'logistics'

export interface MenuItem {
  label: string
  href: string
  icon: string
}

export interface ModuleConfig {
  id: ModuleId
  name: string
  description: string
  icon: string
  basePath: string
  menuItems: MenuItem[]
}
