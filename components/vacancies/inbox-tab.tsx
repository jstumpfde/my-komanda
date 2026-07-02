"use client"

// Таб «Инбокс» страницы вакансии — единый чат-инбокс (#62).
// Тонкая обёртка: рендерит ОБЩИЙ двухпанельный ChatInboxPanel (тот же
// компонент, что глобальный плавающий виджет «Чаты»), зафиксированный на
// этой вакансии (fixedVacancyId → фильтр по вакансиям скрыт, в списке
// показывается стадия кандидата).
//
// Данные — агрегирующая ручка GET /api/modules/hr/inbox?vacancyId=…
// (превью из hh_responses.messagesCache, hh API не дёргает). Нить справа —
// существующий HhChatThread через /api/integrations/hh/messages/[hhResponseId].

import { ChatInboxPanel } from "@/components/chats/chat-inbox-panel"

interface InboxTabProps {
  vacancyId: string
}

export function InboxTab({ vacancyId }: InboxTabProps) {
  return (
    <div className="h-[70vh] min-h-[520px] rounded-lg border border-border/60 overflow-hidden">
      <ChatInboxPanel fixedVacancyId={vacancyId} className="h-full" />
    </div>
  )
}
