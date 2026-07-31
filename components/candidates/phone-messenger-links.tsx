"use client"

// Кликабельные значки мессенджеров рядом с телефоном кандидата (как на hh.ru).
// Deep link'и открывают чат по номеру БЕЗ каких-либо интеграций — просто ссылки
// вида wa.me/t.me/viber://. Переиспользуется в hh-resume-info.tsx (секция
// «Контакты» резюме hh) и candidate-drawer.tsx (вкладка «Контакты» кандидата).

import { Send } from "lucide-react"

/**
 * Нормализует телефон в чистые цифры для deep-link'ов мессенджеров.
 * 8XXXXXXXXXX (11 цифр, ведущая 8) → 7XXXXXXXXXX. Если после чистки меньше
 * 10 цифр — номер непригоден для мессенджеров (значки не показываем).
 */
export function normalizePhoneDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`
  }
  if (digits.length < 10) return null
  return digits
}

// lucide-react не имеет брендовых значков WhatsApp/Viber — рисуем инлайн-SVG
// в том же стиле (контур, stroke), чтобы не тащить новый npm-пакет.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" />
      <path d="M8.7 8.3c.2-.4.4-.5.6-.5h.5c.2 0 .4 0 .5.4.2.5.6 1.5.7 1.7.1.1.1.3 0 .5-.1.2-.2.3-.3.5-.2.2-.3.3-.1.6.2.3.8 1.2 1.7 2 1.1 1 2.1 1.4 2.4 1.5.3.1.4.1.6-.1.2-.2.7-.8.9-1.1.2-.2.4-.2.6-.1.2.1 1.5.7 1.8.8.3.1.4.2.5.3.1.2.1.9-.2 1.4-.3.5-1.5 1.1-2.1 1.1-.5 0-1.7 0-3.2-.9-2.5-1.5-4-4.1-4.2-4.3-.2-.2-1.3-1.7-1.3-3.2 0-1.4.8-2.2 1.1-2.6Z" />
    </svg>
  )
}

// Viber удалён по решению владельца 16.07 — оставляем WhatsApp/Telegram.

/**
 * Значки-ссылки (WhatsApp / Telegram) рядом с номером телефона.
 * Ничего не рендерит, если номер после нормализации короче 10 цифр.
 */
export function PhoneMessengerLinks({ phone, className }: { phone: string; className?: string }) {
  const digits = normalizePhoneDigits(phone)
  if (!digits) return null

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <a
        href={`https://wa.me/${digits}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Написать в WhatsApp"
        onClick={stop}
        className="text-muted-foreground hover:text-[#25D366] transition-colors"
      >
        <WhatsAppIcon className="w-3.5 h-3.5" />
      </a>
      <a
        href={`https://t.me/+${digits}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Написать в Telegram"
        onClick={stop}
        className="text-muted-foreground hover:text-[#229ED9] transition-colors"
      >
        <Send className="w-3.5 h-3.5" />
      </a>
    </span>
  )
}
