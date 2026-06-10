Прочитай это ТЗ и выполни.

# TZ-LOGISTICS-01: Новый модуль «Логистика» — структура + настройки

## Контекст
Создаём НОВЫЙ модуль грузоперевозок (freight forwarding). Папка app/(modules)/logistics/ сейчас пустая или не существует (склад переехал в warehouse).
Все данные МОКОВЫЕ — UI-демо для презентации.
Дизайн-референс: HR дашборд /hr/dashboard и настройки /settings/notifications (accordion style).
Посмотри как устроены HR-страницы и используй тот же layout/паттерн (DashboardLayout или DashboardSidebar + DashboardHeader + SidebarProvider).

## Что сделать

### 1. Структура папок
Создай ВСЕ page.tsx:

app/(modules)/logistics/
├── page.tsx                    # Redirect → /logistics/dashboard
├── dashboard/page.tsx          # Заглушка: "Дашборд — будет в TZ-02"
├── requests/page.tsx           # Заглушка: "Запросы — будет в TZ-03"
├── quotes/page.tsx             # Заглушка: "Расчёты — будет в TZ-04"
├── shipments/page.tsx          # Заглушка: "Перевозки — будет в TZ-05"
├── carriers/page.tsx           # Заглушка: "Перевозчики — будет в TZ-06"
└── settings/page.tsx           # ДЕЛАЕМ ПОЛНОСТЬЮ (см. ниже)

Заглушки — полноценные страницы с sidebar. Используй тот же паттерн что в warehouse или HR:
```tsx
'use client'
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

export default function Page() {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
          <h1 className="text-2xl font-semibold mb-2">Название</h1>
          <p className="text-muted-foreground">В разработке</p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

### 2. Регистрация в registry
В lib/modules/registry.ts — добавь новый блок logistics (ниже warehouse):

```typescript
logistics: {
  id: 'logistics',
  name: 'Логистика',
  description: 'Грузоперевозки, трекинг, перевозчики, расчёты ставок',
  icon: 'Truck',
  color: '#D85A30',
  basePath: '/logistics',
  menuItems: [
    { label: 'Дашборд', href: '/logistics/dashboard', icon: 'LayoutDashboard' },
    { label: 'Запросы', href: '/logistics/requests', icon: 'Inbox' },
    { label: 'Расчёты', href: '/logistics/quotes', icon: 'Calculator' },
    { label: 'Перевозки', href: '/logistics/shipments', icon: 'Ship' },
    { label: 'Перевозчики', href: '/logistics/carriers', icon: 'Building2' },
    { label: 'Настройки', href: '/logistics/settings', icon: 'Settings' },
  ]
}
```

### 3. Sidebar groups
В lib/sidebar/module-menus.ts — добавь:
```typescript
logistics: [
  { label: 'Операции', hrefs: ['/logistics/dashboard', '/logistics/requests', '/logistics/quotes'] },
  { label: 'Исполнение', hrefs: ['/logistics/shipments', '/logistics/carriers'] },
  { label: 'Конфигурация', hrefs: ['/logistics/settings'] },
],
```

### 4. Страница /logistics/settings — ПОЛНАЯ РЕАЛИЗАЦИЯ

5 секций accordion (раскрываемые блоки, стиль как /settings/notifications):

#### Секция 1: Регионы и география
Pill-badge чекбоксы (кликабельные):
🇷🇺 Россия, 🇰🇿 Казахстан, 🇧🇾 Беларусь, 🇺🇿 Узбекистан, 🇰🇬 Кыргызстан, 🇹🇯 Таджикистан, 🇦🇿 Азербайджан, 🇬🇪 Грузия, 🇦🇲 Армения, 🇹🇲 Туркменистан, 🇲🇳 Монголия, 🇨🇳 Китай, 🇹🇷 Турция, 🇮🇳 Индия, 🇪🇺 Европа (ЕС), 🇬🇧 Великобритания, 🇺🇸 США / Канада, 🌍 Другие

По умолчанию: Россия, Казахстан, Китай.
Selected: bg-primary/10 border-primary text-primary
Unselected: border-border text-muted-foreground

#### Секция 2: Виды транспорта
Toggle-карточки:
🚛 Автоперевозки (FTL / LTL), 🚂 Железнодорожные, 🚢 Морские контейнерные (FCL / LCL), ✈️ Авиаперевозки, 📦 Мультимодальные, 🏭 Складские услуги

Каждая: иконка + название + описание + toggle switch.
По умолчанию ON: Авто, Морские, Авиа.

#### Секция 3: Маржа и наценка
Поля:
- Стандартная маржа %: 5
- Минимальная маржа %: 3
- Маржа постоянных клиентов %: 3
- Маржа новых клиентов %: 7
- Округление: select (до 100₽ / до 1000₽ / до $10 / без)
- Валюта: select (RUB / USD / EUR / CNY)

#### Секция 4: Площадки и сервисы
Карточки интеграций (все disabled, badge "Скоро"):
ATI.su, Della, Trans.eu, TimoCom, Freightos, SeaRates, cargo.one, WebCargo

#### Секция 5: Уведомления логистики
Toggle-switches:
Новый запрос (ON), Клиент принял оффер (ON), Статус перевозки (ON), Задержка (ON), Документы готовы (ON), Повторный контакт (ON), Email (OFF), Telegram (OFF)

### Общие правила
- useState для данных, кнопки "Сохранить" → toast "Настройки сохранены"
- Accordion: ChevronDown rotate при open

## НЕ ТРОГАЙ
- warehouse/ страницы, HR-страницы, globals.css, API routes

## Проверка
pnpm tsc --noEmit 2>&1 | head -20
Открой /logistics/settings — все 5 accordion работают
