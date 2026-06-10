# ТЗ: CRM Deals — Редизайн под стиль базы знаний

## Контекст
Страница /sales/deals работает, но дизайн скучный. Нужно привести к стилю дашборда базы знаний (/knowledge-v2/dashboard).

## Перед началом
- Прочитай `app/(modules)/knowledge-v2/dashboard/page.tsx` — это эталон дизайна
- Прочитай текущий `app/(modules)/sales/deals/page.tsx`

## 1. Summary карточки (4 штуки сверху)
Сейчас: белые скучные карточки с обводкой
Нужно: как на дашборде базы знаний — ПОЛНАЯ ЗАЛИВКА цветом + белый текст + иконка

- Всего сделок → bg-blue-500, иконка TrendingUp
- В работе → bg-purple-500, иконка DollarSign  
- Выиграно → bg-emerald-500, иконка Trophy
- Конверсия → bg-orange-500, иконка Percent

Стиль каждой карточки: rounded-xl shadow-sm hover:shadow-md transition-all duration-300
p-5 text-white

Число — text-3xl font-bold, анимация countUp (считает от 0 до значения за 1 сек)
Подпись — text-sm opacity-80
Иконка — w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center

## 2. Канбан колонки
Сейчас: серые скучные
Нужно:
- Верхняя цветная полоска 3px в цвет этапа (из DEAL_STAGES.color)
- Заголовок колонки: цветная точка + название + badge с количеством
- Сумма под заголовком — text-sm text-muted-foreground
- Фон колонки: bg-muted/30 rounded-xl
- Минимальная высота чтобы пустые колонки не схлопывались (min-h-[300px])

## 3. Карточки сделок (внутри колонок)
Сейчас: плоские
Нужно:
- bg-[var(--card)] rounded-xl shadow-sm hover:shadow-md transition-all duration-200
- hover: translate-y-[-2px] (лёгкий подъём)
- Название — font-semibold text-sm
- Сумма — font-bold text-base (выделяется)
- Компания — text-xs text-muted-foreground с цветной точкой приоритета слева
- Ответственный — аватарка/инициалы в правом нижнем углу (w-7 h-7 rounded-full bg-primary/10 text-xs)
- Цветная левая полоска 3px по приоритету: high=#EF4444, medium=#F59E0B, low=#6B7280

## 4. Кнопка "+ Новая сделка"
- bg-primary text-primary-foreground rounded-xl shadow-sm hover:shadow-md
- Иконка Plus слева

## 5. Фильтры
- Поиск: rounded-xl border bg-[var(--input-bg)]
- Селект приоритета: аналогичный стиль
- Всё в одну строку с gap-3

## 6. Пустая колонка
Если в этапе 0 сделок — показать ghost-текст: "Перетащите сделку сюда" с иконкой (dashed border, opacity-50)

## 7. Анимации
- Карточки появляются с staggered анимацией (каждая с задержкой 50ms)
- Summary карточки — countUp числа
- Hover на карточках сделок — плавный подъём

## НЕ ТРОГАЙ
- API endpoints
- Логику drag & drop
- Страницу /sales/deals/[id]
- Sidebar
- Модалку создания (пока)

## Файл для редактирования
ТОЛЬКО `app/(modules)/sales/deals/page.tsx`
