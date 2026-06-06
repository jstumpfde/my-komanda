import path from "path"

// Резолвинг путей к публичной статике и папке загрузок.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ХЕЛПЕР: на проде public/uploads — это СИМЛИНК на постоянную
// папку вне корня проекта (/var/www/uploads, План A — переживает деплои).
// Статический трейсер Turbopack, встретив литерал
//     path.join(process.cwd(), "public", "uploads", …)
// пытается включить эту директорию в граф модулей, идёт по симлинку наружу
// корня и валит сборку:
//     "Symlink public/uploads/… is invalid, it points out of the filesystem root"
// (инцидент 03.06.2026). Сегмент "public" читаем через process.env (значение
// статически неизвестно) — это не даёт трейсеру свернуть путь в литерал и
// обойти папку.
//
// Поведение в рантайме НЕ меняется: без заданных env используется
// <cwd>/public/uploads, как и раньше (на проде — через симлинк). При желании
// на проде можно задать UPLOADS_DIR=/var/www/uploads, чтобы писать напрямую,
// минуя симлинк.

const PUBLIC_SEG = process.env.PUBLIC_DIR_NAME || "public"

/** Абсолютный путь внутри папки публичной статики (<cwd>/public/...). */
export function publicDir(...segments: string[]): string {
  const base = process.env.PUBLIC_DIR || path.join(process.cwd(), PUBLIC_SEG)
  return path.join(base, ...segments)
}

/** Абсолютный путь внутри папки загрузок (<cwd>/public/uploads/...). */
export function uploadsDir(...segments: string[]): string {
  const base = process.env.UPLOADS_DIR || publicDir("uploads")
  return path.join(base, ...segments)
}
