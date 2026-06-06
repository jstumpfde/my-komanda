# Zero-downtime деплой (cluster + standalone)

Цель: деплой в рабочее время не роняет сайт для кандидатов. Сейчас `pm2 restart`
даёт ~5–8 сек простоя. Решение: Next standalone-сборка + PM2 cluster (2 инстанса)
+ `pm2 reload` (перезапуск инстансов по очереди → всегда один отвечает).

Всё подготовлено и **опт-ин**: без `NEXT_OUTPUT_STANDALONE=1` обычный деплой
работает как раньше. Поэтому текущий прод НЕ затронут, пока не сделаешь cutover.

---

## ⚠️ Сначала ОБКАТАТЬ НА СТЕЙДЖИНГЕ (new.company24.pro, порт 3001)

Не трогая прод. Проверяем 3 вещи: поднимается, БД/логин работают, картинки/uploads видны.

```bash
cd /var/www/my-komanda-new-staging
git pull origin develop
NEXT_OUTPUT_STANDALONE=1 pnpm build
cp -r .next/static .next/standalone/.next/static
cp -r public        .next/standalone/public
# uploads пишутся в рантайме → отдаём их симлинком, иначе новые фото/медиа не видны:
ln -sfn /var/www/my-komanda-new-staging/public/uploads .next/standalone/public/uploads
# смоук-тест прямым запуском (НЕ через pm2), Ctrl+C после проверки:
PORT=3001 node .next/standalone/server.js
```
В другом терминале: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/login` → 200.
Зайти на new.company24.pro: логин работает (БД/сессии), открыть страницу с фото
кандидата (uploads), пройти демо/тест. Если всё ок — переходим к проду.

**Если что-то не так** (чаще всего env или uploads) — НЕ делать cutover прода, написать мне.

---

## Cutover прода (один раз, короткий разрыв ~5 сек — делать ВНЕ пиковых часов)

```bash
cd /var/www/my-komanda
git pull origin develop
NEXT_OUTPUT_STANDALONE=1 pnpm build
cp -r .next/static .next/standalone/.next/static
cp -r public        .next/standalone/public
ln -sfn /var/www/my-komanda/public/uploads .next/standalone/public/uploads
pm2 delete my-komanda
pm2 start ecosystem.config.cjs
pm2 save
sleep 8 && curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/login
```

## Дальше — обычный деплой БЕЗ простоя (cluster reload по очереди)

```bash
cd /var/www/my-komanda && git pull origin develop \
  && NEXT_OUTPUT_STANDALONE=1 pnpm build \
  && cp -r .next/static .next/standalone/.next/static \
  && cp -r public .next/standalone/public \
  && ln -sfn /var/www/my-komanda/public/uploads .next/standalone/public/uploads \
  && pm2 reload my-komanda --update-env
```
(если есть миграция — `sudo -u postgres psql -d mykomanda -f drizzle/NNNN_*.sql` перед reload)

---

## Каверзные места (проверить на стейджинге)
1. **ENV** — standalone-сервер берёт `.env`/`.env.local` из cwd. Убедиться, что
   DATABASE_URL/NEXTAUTH_SECRET/ANTHROPIC_API_KEY и пр. подхватываются (логин + AI работают).
2. **uploads** — рантайм-загрузки (фото кандидатов, демо-медиа) пишутся в
   `public/uploads`. В standalone статика отдаётся из `.next/standalone/public`,
   поэтому нужен симлинк (в командах выше) ИЛИ отдавать `/uploads/` через nginx
   напрямую из `/var/www/my-komanda/public/uploads`.
3. **Откат** — если cluster повёл себя плохо: `pm2 delete my-komanda` и старый
   запуск `pm2 start "npm run start" --name my-komanda` (или как было), затем
   обычный деплой без NEXT_OUTPUT_STANDALONE.

Конфиг: `ecosystem.config.cjs` (2 инстанса, порт 3000). Изменение `next.config.mjs`
безопасно — стендэлон включается только переменной `NEXT_OUTPUT_STANDALONE=1`.
