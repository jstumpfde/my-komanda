import { AiAssistantWidget } from "@/components/knowledge/ai-assistant-widget"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AiAssistantWidget />
    </>
  )
}
