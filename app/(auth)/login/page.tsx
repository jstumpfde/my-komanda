import { LoginFormWithSuspense } from "@/components/auth/login-form"

// Серверный компонент: видимость кнопок VK/Яндекс зависит от того, настроены
// ли реальные OAuth-ключи на сервере (без этого клик по кнопке уйдёт в ошибку
// провайдера). Проверка выполняется во время запроса — pm2 restart --update-env
// после добавления ключей включает кнопки без пересборки.
export default function LoginPage() {
  const vkEnabled = !!(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET)
  const yandexEnabled = !!(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET)
  return <LoginFormWithSuspense vkEnabled={vkEnabled} yandexEnabled={yandexEnabled} />
}
