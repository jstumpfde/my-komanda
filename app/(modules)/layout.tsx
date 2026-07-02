import { NancyAssistant } from "@/components/nancy/nancy-assistant"
import { GlobalChatWidget } from "@/components/chats/global-chat-widget"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <NancyAssistant />
      {/* Плавающая кнопка «Чаты» (левее Нэнси). Сама скрывается вне /hr
          и вне owner-гейта — см. components/chats/global-chat-widget.tsx */}
      <GlobalChatWidget />
    </>
  )
}
