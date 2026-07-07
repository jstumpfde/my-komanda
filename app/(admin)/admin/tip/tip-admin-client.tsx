"use client"

// Клиент раздела «Типология» (/admin/tip) — три таба:
// Промокоды / Промпты / Прогоны. Внутренний инструмент владельца платформы.

import { useEffect, useState, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sparkles } from "lucide-react"
import { PromoCodesTab } from "./promo-codes-tab"
import { PromptLayersTab } from "./prompt-layers-tab"
import { RunsTab } from "./runs-tab"

export function TipAdminClient() {
  const [tab, setTab] = useState("promo-codes")

  return (
    <div className="py-6 px-4 sm:px-8 space-y-5 max-w-6xl">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Типология</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        Внутренний инструмент: промокоды, редактируемые слои промптов методики, прогоны разбора.
      </p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="promo-codes">Промокоды</TabsTrigger>
          <TabsTrigger value="prompts">Промпты</TabsTrigger>
          <TabsTrigger value="runs">Прогоны</TabsTrigger>
        </TabsList>
        <TabsContent value="promo-codes">
          <PromoCodesTab />
        </TabsContent>
        <TabsContent value="prompts">
          <PromptLayersTab />
        </TabsContent>
        <TabsContent value="runs">
          <RunsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
