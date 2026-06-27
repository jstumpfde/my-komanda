// /admin/platform/chatbot-defaults — платформенные дефолтные тексты AI чат-бота.
// Эталон для всех компаний. Доступ — платформ-админ.

import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { actionGetChatbotDefaults } from "../actions"
import { ChatbotDefaultsClient } from "./chatbot-defaults-client"

export const dynamic = "force-dynamic"

export default async function ChatbotDefaultsPage() {
  const { current, seed } = await actionGetChatbotDefaults()
  return (
    <AdminPageLayout>
      <ChatbotDefaultsClient initial={current} seed={seed} />
    </AdminPageLayout>
  )
}
