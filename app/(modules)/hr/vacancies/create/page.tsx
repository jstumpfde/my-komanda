"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { createVacancyApi } from "@/lib/vacancy-storage"

export default function CreateVacancyPage() {
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = title.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)

    try {
      const result = await createVacancyApi({
        title: title.trim(),
      }) as { data?: { id: string }; id?: string }

      const id = result.data?.id ?? result.id
      toast.success("Вакансия создана — заполните анкету")
      router.push(id ? `/hr/vacancies/${id}?tab=anketa` : "/hr/vacancies")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка"
      toast.error(`Не удалось создать вакансию: ${msg}`)
      setSubmitting(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="max-w-md mx-auto p-4 sm:p-6 mt-12">

            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <Plus className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Новая вакансия</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Укажите должность — остальное заполните в анкете
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Название должности <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="Менеджер по продажам"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
                  autoFocus
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Создаём...
                  </>
                ) : (
                  "Создать вакансию"
                )}
              </Button>
            </div>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
