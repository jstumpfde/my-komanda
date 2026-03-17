export interface OnboardingState {
  completed: string[]
  skipped: string[]
}

export const ONBOARDING_STEPS = [
  { id: "company", label: "Профиль компании", description: "ИНН, логотип, город" },
  { id: "vacancy", label: "Первая вакансия", description: "Создайте вакансию" },
  { id: "hh", label: "Подключить hh.ru", description: "Импорт откликов" },
  { id: "demo", label: "Демонстрация", description: "Шаблон для кандидатов" },
  { id: "done", label: "Готово!", description: "Платформа настроена" },
] as const

export function getOnboarding(): OnboardingState {
  if (typeof window === "undefined") return { completed: [], skipped: [] }
  try {
    const raw = localStorage.getItem("hireflow-onboarding")
    if (raw) return JSON.parse(raw)
  } catch {}
  return { completed: [], skipped: [] }
}

export function saveOnboarding(state: OnboardingState) {
  if (typeof window === "undefined") return
  localStorage.setItem("hireflow-onboarding", JSON.stringify(state))
}

export function isOnboardingComplete(state: OnboardingState): boolean {
  return ONBOARDING_STEPS.every(s => s.id === "done" || state.completed.includes(s.id) || state.skipped.includes(s.id))
}

export function remainingSteps(state: OnboardingState): number {
  return ONBOARDING_STEPS.filter(s => s.id !== "done" && !state.completed.includes(s.id) && !state.skipped.includes(s.id)).length
}
