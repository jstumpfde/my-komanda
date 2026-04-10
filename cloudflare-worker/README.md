# Claude API Proxy (Cloudflare Worker)

Обратный прокси для `api.anthropic.com`. Нужен, чтобы серверные вызовы к
Claude проходили из регионов с блокировками (Россия и т.п.). Клиентские
вызовы (из браузера) этот воркер не трогает.

## Как задеплоить

1. Установить wrangler (один раз, глобально или в этот каталог):

   ```bash
   npm install -g wrangler
   # или: cd cloudflare-worker && npm install --save-dev wrangler
   ```

2. Авторизоваться в Cloudflare (откроет браузер):

   ```bash
   wrangler login
   ```

3. Задеплоить воркер из каталога `cloudflare-worker/`:

   ```bash
   cd cloudflare-worker
   wrangler deploy
   ```

   Wrangler напечатает URL вида `https://claude-proxy.<account>.workers.dev`.

4. Установить переменную окружения в проде (Vercel / другой хостинг):

   ```
   CLAUDE_PROXY_URL=https://claude-proxy.<account>.workers.dev
   ```

   На следующем деплое все серверные вызовы `fetch(getClaudeMessagesUrl(), …)`
   автоматически пойдут через воркер. Локально без переменной всё работает
   как раньше — напрямую в `api.anthropic.com`.

## Проверка

После деплоя можно дёрнуть вручную:

```bash
curl -X POST "$CLAUDE_PROXY_URL/v1/messages" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":64,"messages":[{"role":"user","content":"ping"}]}'
```

Должен вернуться обычный ответ Claude API.

## Что НЕ надо проксировать

Клиентские страницы (`app/(modules)/knowledge-v2/create/demo/page.tsx`,
`components/knowledge/ai-assistant-widget.tsx`, `app/(public)/ask/[code]/page.tsx`
и т.п.) обращаются к Claude напрямую из браузера пользователя с флагом
`anthropic-dangerous-direct-browser-access`. Браузер пользователя не
блокируется, так что прокси не нужен.
