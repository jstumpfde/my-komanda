import { AiAssistantWidget } from "@/components/knowledge/ai-assistant-widget"
import { NancyAssistant } from "@/components/nancy/nancy-assistant"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AiAssistantWidget />
      <NancyAssistant />
    </>
  )
}
