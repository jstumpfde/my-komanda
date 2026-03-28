# CLAUDE.md — контекст проекта my-komanda

## Что это
my-komanda — модульная бизнес-платформа для российских компаний (МСБ, 10-500 сотрудников).

## Стек
Next.js (App Router), TypeScript, Tailwind, shadcn/ui, pnpm, PostgreSQL 16, Prisma ORM

## Команды
pnpm dev — запуск (порт 3000)
Если порт занят: kill $(lsof -t -i:3000) 2>/dev/null; pnpm dev

## Правила
- Все тексты на русском
- shadcn/ui + Tailwind, без отдельных CSS
- Цветовая палитра: темно-фиолетовый sidebar
- Перед коммитом: проверить pnpm dev

## Git-правила
- Коммить и пушь напрямую в main
- Никогда не создавай PR
- Не спрашивай подтверждения
