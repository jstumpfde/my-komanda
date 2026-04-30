// HTML-шаблоны транзакционных писем.
// Inline-стили — для совместимости с почтовыми клиентами.

interface PasswordResetParams {
  resetUrl: string
  userName?: string | null
}

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

export function passwordResetEmail({ resetUrl, userName }: PasswordResetParams): EmailTemplate {
  const greeting = userName ? `Здравствуйте, ${userName}!` : "Здравствуйте!"

  const html =
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #1f2937;">' +
      '<h2 style="color: #111827; margin-bottom: 16px;">' + greeting + '</h2>' +
      '<p style="line-height: 1.6;">Вы запросили восстановление пароля для вашего аккаунта в Company24. Чтобы установить новый пароль, перейдите по ссылке:</p>' +
      '<p style="margin: 24px 0;">' +
        '<a href="' + resetUrl + '" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">Восстановить пароль</a>' +
      '</p>' +
      '<p style="color: #6b7280; font-size: 13px; line-height: 1.6;">Или скопируйте ссылку в браузер:<br/><span style="word-break: break-all;">' + resetUrl + '</span></p>' +
      '<p style="color: #6b7280; font-size: 14px; line-height: 1.6;">Ссылка действует 1 час. Если вы не запрашивали восстановление, просто проигнорируйте это письмо.</p>' +
      '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />' +
      '<p style="color: #9ca3af; font-size: 12px;">Company24.pro — AI Business OS</p>' +
    '</div>'

  const text =
    greeting + "\n\n" +
    "Вы запросили восстановление пароля для аккаунта в Company24.\n" +
    "Перейдите по ссылке для установки нового пароля:\n" +
    resetUrl + "\n\n" +
    "Ссылка действует 1 час. Если вы не запрашивали восстановление — проигнорируйте это письмо.\n\n" +
    "Company24.pro"

  return {
    subject: "Восстановление пароля Company24",
    html,
    text,
  }
}
