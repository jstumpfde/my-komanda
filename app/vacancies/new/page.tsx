"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Check } from "lucide-react"
import { emptyDraft, type VacancyDraft } from "@/lib/vacancy-types"
import { StepBasic } from "@/components/vacancies/step-basic"
import { StepMarket } from "@/components/vacancies/step-market"
import { StepQuestionnaire } from "@/components/vacancies/step-questionnaire"
import { StepEditor } from "@/components/vacancies/step-editor"
import { StepPublish } from "@/components/vacancies/step-publish"

const STEPS = [
  { id: 1, title: "Базовая информация" },
  { id: 2, title: "Анализ рынка" },
  { id: 3, title: "Анкета компании" },
  { id: 4, title: "Редактор вакансии" },
  { id: 5, title: "Публикация" },
]

export default function NewVacancyPage() {
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<VacancyDraft>(emptyDraft)

  const canGoNext = () => {
    if (step === 1) return !!draft.title.trim() && !!draft.city && !!draft.category && !!draft.sidebarSection
    if (step === 2) return draft.salaryMin > 0 && draft.salaryMax > draft.salaryMin
    if (step === 3) return !!draft.generatedText.trim()
    if (step === 4) return !!draft.generatedText.trim()
    return true
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="max-w-3xl mx-auto p-4 sm:p-6">
            {/* Progress stepper */}
            <div className="flex items-center gap-1 mb-8">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center flex-1">
                  <button
                    onClick={() => s.id < step && setStep(s.id)}
                    className={cn(
                      "flex items-center gap-2 flex-shrink-0",
                      s.id < step && "cursor-pointer",
                      s.id > step && "cursor-default"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                        s.id < step && "bg-success text-success-foreground",
                        s.id === step && "bg-primary text-primary-foreground",
                        s.id > step && "bg-muted text-muted-foreground"
                      )}
                    >
                      {s.id < step ? <Check className="w-4 h-4" /> : s.id}
                    </div>
                    <span className={cn(
                      "text-xs font-medium hidden lg:block",
                      s.id === step ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {s.title}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 mx-2 rounded-full",
                      s.id < step ? "bg-success" : "bg-muted"
                    )} />
                  )}
                </div>
              ))}
            </div>

            {/* Step content */}
            <div className="mb-8">
              {step === 1 && <StepBasic draft={draft} onChange={setDraft} />}
              {step === 2 && <StepMarket draft={draft} onChange={setDraft} />}
              {step === 3 && <StepQuestionnaire draft={draft} onChange={setDraft} />}
              {step === 4 && <StepEditor draft={draft} onChange={setDraft} />}
              {step === 5 && <StepPublish draft={draft} />}
            </div>

            {/* Navigation */}
            {step < 5 && (
              <div className="flex items-center justify-between border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                  disabled={step === 1}
                  className="gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Назад
                </Button>

                <span className="text-xs text-muted-foreground">
                  Шаг {step} из {STEPS.length}
                </span>

                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={!canGoNext()}
                  className="gap-1.5"
                >
                  Далее
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
