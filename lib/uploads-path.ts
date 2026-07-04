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
//
// TODO (аудит 28.06.2026, п.10, НЕ реализовано — архитектурная задача, не
// точечный фикс): /uploads/* сейчас раздаётся статически (Next public/ +
// nginx alias в проде) БЕЗ авторизации — кто угодно со ссылкой скачивает файл,
// не проверяется, что запрашивающий вправе видеть кандидата/компанию. Прямую
// правку nginx-конфига здесь не делаем (нет доступа к серверу из ворктри, и
// blanket-гейт рискован — 02.07 уже частично закрыли риск stored-XSS через
// CSP/nosniff+Content-Disposition на .svg, см. next.config.mjs).
//
// Предлагаемое решение (не сделано, требует отдельной задачи):
//  1. Завести /api/uploads/[...path] — авторизованный роут, который матчит
//     путь файла на владельца (candidate → vacancy.companyId, company → сама
//     компания) и требует requireCompany()/сессию соответствующего тенанта
//     ПЕРЕД streaming содержимого (fs.createReadStream + правильный Content-Type).
//  2. Разделить каталог по чувствительности: логотипы компаний/фавиконы,
//     видимые на ПУБЛИЧНЫХ страницах вакансий (/vacancy/[slug], /jobs/[slug]),
//     остаются статически доступны (это осознанно публичный контент). Фото
//     кандидатов, резюме-вложения, PDF курсов — переехать за авторизованный
//     роут (это PII, tenant-scoped).
//  3. Мигрировать 15 мест, пишущих/читающих "/uploads/..." (grep по кодовой
//     базе: app/api/upload/*, app/api/modules/hr/candidates/[id]/save-photo,
//     lib/hh/save-candidate-photo.ts, components/candidates/answers-tab.tsx,
//     components/vacancies/publish-tab.tsx и др.) на новый URL-паттерн для
//     чувствительных типов файлов.
//  4. На сервере (координатор, не агент) сузить nginx alias — отдавать напрямую
//     только подпапки из шага 2 (публичные), остальное проксировать в Next,
//     чтобы авторизованный роут реально отрабатывал (иначе nginx статика
//     обходит middleware/API целиком, как сейчас).
// Риск блокирующей правки без этого плана: сломать публичные вакансии/демо-
// страницы (логотипы, видео) или потерять доступ HR к уже загруженным файлам.

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
