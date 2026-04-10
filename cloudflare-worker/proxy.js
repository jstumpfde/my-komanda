// Cloudflare Worker — обратный прокси для Claude API (api.anthropic.com).
//
// Нужен, чтобы серверные вызовы к Claude из регионов с блокировками проходили
// через Cloudflare. Клиентские вызовы (из браузера пользователя) этот воркер
// не трогает — они идут напрямую.
//
// Как это работает:
//   https://<your-worker>.workers.dev/v1/messages
//   → проксируется в https://api.anthropic.com/v1/messages
//
// Заголовки (в т.ч. x-api-key, anthropic-version) передаются как есть.

export default {
  async fetch(request) {
    const url = new URL(request.url)
    url.hostname = "api.anthropic.com"
    url.protocol = "https:"
    url.port = ""

    const newRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "follow",
    })

    return fetch(newRequest)
  },
}
