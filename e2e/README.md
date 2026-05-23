# E2E Tests (Playwright)

Smoke-tests против staging (`new.company24.pro`) и production (`company24.pro`).
Цель — поймать регрессии после деплоев. НЕ полное покрытие, только базовые
пути, которые ломать дорого: login, список вакансий, создание вакансии,
конструктор воронки, публичная страница, Юлия, /admin/platform.

## Локально

Получи пароли тестовых юзеров у Юрия (tester-hr@company24.pro, director@
company24.pro):

```bash
export PLAYWRIGHT_HR_PASSWORD=...
export PLAYWRIGHT_DIRECTOR_PASSWORD=...

# Если staging за basic-auth — добавь:
export PLAYWRIGHT_HTTP_USER=...
export PLAYWRIGHT_HTTP_PASSWORD=...

pnpm test:e2e:staging           # дефолт — против new.company24.pro
pnpm test:e2e:prod              # против company24.pro (осторожно)
pnpm test:e2e:ui                # интерактивный UI Mode
pnpm test:e2e -- 02-login       # один спек
```

Без паролей тесты, требующие логина, грациозно skipped (см.
`hasCredentials()` в `e2e/helpers/auth.ts`).

## CI

GitHub Actions запускается автоматически на push/PR в `develop` и `main`
против staging. Для ручного запуска против прода:

GitHub → Actions → Playwright E2E → **Run workflow** → target: `production`.

Нужные repository secrets:
- `PLAYWRIGHT_HR_PASSWORD`
- `PLAYWRIGHT_DIRECTOR_PASSWORD`
- `PLAYWRIGHT_HTTP_USER` / `PLAYWRIGHT_HTTP_PASSWORD` (basic-auth)

## Файлы

| Файл                          | Что проверяет                                     |
| ----------------------------- | -------------------------------------------------- |
| `01-smoke.spec.ts`            | Корень не валится в 5xx                            |
| `02-login.spec.ts`            | HR логинится → редирект в кабинет                  |
| `03-vacancy-list.spec.ts`     | Список вакансий + CTA «Создать»                    |
| `04-create-vacancy.spec.ts`   | Страница /new рендерится + баннер Юли + поле title |
| `05-funnel-builder.spec.ts`   | Конструктор воронки доступен, блоки видны          |
| `06-vacancy-public.spec.ts`   | Публичная страница `/vacancy/[slug]` открывается   |
| `07-platform-admin.spec.ts`   | /admin/platform с 6 табами (для PLATFORM_ADMIN)    |
| `08-yulia.spec.ts`            | Баннер Юли → Dialog → приветствие. AI-ход опционально |
| `09-ai-scoring.spec.ts`       | Sheet AI-скоринга открывается с кнопкой «Предложить» |

## Опциональные env-флаги

| Env                              | Эффект                                       |
| -------------------------------- | --------------------------------------------- |
| `PLAYWRIGHT_BASE_URL`            | Override baseURL (default staging)            |
| `PLAYWRIGHT_HR_PASSWORD`         | Пароль tester-hr@company24.pro                |
| `PLAYWRIGHT_DIRECTOR_PASSWORD`   | Пароль director@company24.pro                 |
| `PLAYWRIGHT_HTTP_USER/PASSWORD`  | Basic-auth для staging                        |
| `PLAYWRIGHT_ALLOW_AI_CALLS=1`    | Включает реальный AI-ход в `08-yulia`         |

## Добавление новых тестов

Создавай `e2e/NN-name.spec.ts`. Используй `login(page, "hr")` из
`e2e/helpers/auth.ts`. Помечай тест `test.skip(...)` если ему нужны
данные/доступы которых может не быть (см. примеры в существующих файлах).

## Важно

- НЕ нажимаем deletion / Emergency / Confirm-action в тестах — это боевая БД.
- Тесты, создающие новые сущности (test 04), используют timestamp в названии
  чтобы не дублировать и легко находить мусор.
- Не создавай новых юзеров — используй существующих.
