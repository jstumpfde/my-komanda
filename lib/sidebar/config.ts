// Базовые пункты платформы (не привязаны к модулям)

export interface PlatformMenuItem {
  name: string
  href: string
  icon: string // lucide icon name
}

export const PLATFORM_MENU: PlatformMenuItem[] = [
  { name: 'Обзор',    href: '/overview',  icon: 'LayoutDashboard' },
  { name: 'Рефералы', href: '/referrals', icon: 'Gift' },
]

export const SETTINGS_MENU: PlatformMenuItem[] = [
  { name: 'Компания',       href: '/settings/company',       icon: 'Building2'   },
  { name: 'Профиль',        href: '/settings/profile',       icon: 'User'        },
  { name: 'Команда',        href: '/settings/team',          icon: 'Users'       },
  { name: 'Брендинг',       href: '/settings/branding',      icon: 'Palette'     },
  { name: 'Расписание',     href: '/settings/schedule',      icon: 'Calendar'    },
  { name: 'Уведомления',    href: '/settings/notifications', icon: 'Bell'        },
  { name: 'Интеграции',     href: '/settings/integrations',  icon: 'Plug'        },
  { name: 'Тариф и оплата', href: '/settings/billing',       icon: 'CreditCard'  },
  { name: 'Роли и доступ',  href: '/settings/roles',         icon: 'Shield'      },
]

export const ADMIN_MENU: PlatformMenuItem[] = [
  { name: 'Дашборд',        href: '/admin/dashboard',    icon: 'LayoutDashboard' },
  { name: 'Клиенты',        href: '/admin/clients',      icon: 'Building2' },
  { name: 'Тарифы',         href: '/admin/tariffs',      icon: 'CreditCard' },
  { name: 'Роли и доступ',  href: '/admin/roles',        icon: 'ShieldCheck' },
  { name: 'Интеграторы',    href: '/admin/integrators',  icon: 'Handshake' },
]
