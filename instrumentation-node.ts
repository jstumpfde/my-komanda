// Node-only перехватчики ошибок процесса (грузится из instrumentation.ts только
// в nodejs-runtime).
//
// ЗАЧЕМ: при `next start` обрыв соединения клиентом (закрыл вкладку во время
// ответа) приходит как `Error: aborted` / `ECONNRESET` и БЕЗ обработчика
// всплывает в uncaughtException → Node падает → pm2 рестарт → 5-8 сек простоя.
// Это и есть «каждый раз захожу — сайт не работает» (в логе было 48 таких
// падений, 465 рестартов процесса). Перехватываем и НЕ роняем процесс на таких
// безобидных сетевых обрывах.

function isBenignNetworkError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  const code = (e?.code ?? "").toString()
  const msg = (e?.message ?? "").toString()
  return (
    code === "ECONNRESET" || code === "ECONNABORTED" ||
    code === "EPIPE" || code === "ERR_STREAM_PREMATURE_CLOSE" ||
    msg === "aborted" || msg.includes("aborted")
  )
}

process.on("uncaughtException", (err) => {
  if (isBenignNetworkError(err)) {
    // Обрыв соединения клиентом — норма веба, не повод ронять весь сервер.
    console.warn("[uncaughtException:ignored]", err?.message, (err as { code?: string })?.code)
    return
  }
  // Настоящая неизвестная ошибка: состояние процесса могло повредиться —
  // логируем и даём pm2 перезапустить ЧИСТО (это редко, в отличие от aborted).
  console.error("[uncaughtException:fatal]", err)
  setTimeout(() => process.exit(1), 100)
})

process.on("unhandledRejection", (reason) => {
  if (isBenignNetworkError(reason)) {
    console.warn("[unhandledRejection:ignored]", (reason as { code?: string })?.code)
    return
  }
  // Необработанные промисы НЕ роняют процесс (логируем для разбора).
  console.error("[unhandledRejection]", reason)
})

console.log("[instrumentation] process error guards installed")
