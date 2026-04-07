"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Rocket, Radio, Mic, Sparkles, FileSearch } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

const SETUP_STEPS = [
  {
    href: "/hr/onboarding/channel",
    icon: Radio,
    title: "Канал сбора данных",
    description: "Выберите способ добавления сотрудников в программу адаптации",
  },
  {
    href: "/hr/onboarding/voice",
    icon: Mic,
    title: "Голосовой ввод",
    description: "Добавьте данные о сотруднике голосом или диктовкой",
  },
  {
    href: "/hr/onboarding/smart-input",
    icon: Sparkles,
    title: "Умный ввод",
    description: "Автозаполнение профиля сотрудника из текста или резюме",
  },
  {
    href: "/hr/onboarding/enrichment-preview",
    icon: FileSearch,
    title: "Обогащение профиля",
    description: "Просмотр и редактирование обогащённых данных перед сохранением",
  },
]

export default function OnboardingPage() {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Rocket className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Онбординг</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Настройте процесс добавления новых сотрудников в программу адаптации
      </p>

      <div className="grid gap-4">
        {SETUP_STEPS.map((step) => {
          const Icon = step.icon
          return (
            <Card key={step.href} className="">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={step.href}>Открыть</Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/hr/adaptation/plans">Перейти к планам адаптации</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/hr/adaptation/assignments">Назначения</Link>
        </Button>
      </div>
    </main>
    </SidebarInset>
    </SidebarProvider>
  )
}
