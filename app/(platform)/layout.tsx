import { NancyAssistant } from "@/components/nancy/nancy-assistant"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <NancyAssistant />
    </>
  )
}
