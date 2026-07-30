"use client"

// Platform Admin → AI-РОП — админка биллинга/эксплуатации модуля AI-РОП.
// Самостоятельная подстраница (не часть большого PlatformAdminClient) —
// см. docs/architecture/AI-ROP-MODULE-PLAN-2026-07.md, решение 11.
// Гейт уже стоит в app/(admin)/admin/platform/layout.tsx (isPlatformAdminEmail);
// каждый /api/platform/ai-rop/* роут дублирует проверку сессии (deadlines-паттерн).

import { CreditCard } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TokensTab } from "./tokens-tab"
import { PlansTab } from "./plans-tab"
import { PromosTab } from "./promos-tab"
import { PaymentsTab } from "./payments-tab"
import { StatsTab } from "./stats-tab"
import { PartnersTab } from "./partners-tab"

export function AiRopAdminClient() {
  return (
    <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
      <div className="flex items-center gap-2 pb-4">
        <CreditCard className="h-5 w-5 text-violet-600" />
        <h1 className="text-lg font-semibold">AI-РОП — биллинг и эксплуатация</h1>
      </div>

      <Tabs defaultValue="tokens">
        <TabsList>
          <TabsTrigger value="tokens">Токены</TabsTrigger>
          <TabsTrigger value="plans">Тарифы</TabsTrigger>
          <TabsTrigger value="promos">Промокоды</TabsTrigger>
          <TabsTrigger value="payments">Платежи</TabsTrigger>
          <TabsTrigger value="stats">Статистика</TabsTrigger>
          <TabsTrigger value="partners">Партнёры и рефералы</TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="mt-4">
          <TokensTab />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <PlansTab />
        </TabsContent>
        <TabsContent value="promos" className="mt-4">
          <PromosTab />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsTab />
        </TabsContent>
        <TabsContent value="partners" className="mt-4">
          <PartnersTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
