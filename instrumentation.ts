// Точка инициализации сервера (next start). Node-only логику (перехватчики
// ошибок процесса) грузим динамически ТОЛЬКО в nodejs-runtime — иначе Next
// компилирует этот файл и под edge, где process.on/process.exit недоступны.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node")
  }
}
