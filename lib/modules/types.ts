export type ModuleId = 'hr' | 'knowledge' | 'learning' | 'tasks' | 'marketing' | 'sales' | 'b2b' | 'ecommerce' | 'warehouse' | 'logistics' | 'booking' | 'dialer' | 'qc'

export interface MenuItem {
  label: string
  href: string
  icon: string
  legacy?: boolean   // v1 items — grayed out in sidebar
  divider?: boolean  // renders as a visual separator label, not a link
}

export interface MenuGroup {
  label: string
  items: MenuItem[]
  legacy?: boolean  // v1 accordion — muted/grayed header styling
}

export interface ModuleConfig {
  id: ModuleId
  name: string
  description: string
  icon: string
  basePath: string
  menuItems: MenuItem[]
}
