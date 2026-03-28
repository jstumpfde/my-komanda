// D1: Adaptive track — filter adaptation steps based on employee context

export interface StepConditions {
  roles?:        string[]   // allowed roles (e.g. ["manager", "analyst"])
  departments?:  string[]   // allowed departments
  minScore?:     number     // minimum quiz score from previous steps
}

export interface EmployeeContext {
  role?:       string
  department?: string
  scores?:     Record<string, number>  // stepId → score
}

/**
 * Returns true if the step should be shown to this employee.
 * If conditions is null/empty, step is always shown.
 */
export function matchesConditions(
  conditions: StepConditions | null | undefined,
  ctx: EmployeeContext,
): boolean {
  if (!conditions) return true

  if (conditions.roles && conditions.roles.length > 0) {
    if (!ctx.role || !conditions.roles.includes(ctx.role)) return false
  }

  if (conditions.departments && conditions.departments.length > 0) {
    if (!ctx.department || !conditions.departments.includes(ctx.department)) return false
  }

  if (conditions.minScore != null && ctx.scores) {
    const scores = Object.values(ctx.scores)
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      if (avg < conditions.minScore) return false
    }
  }

  return true
}

/**
 * Filter a list of steps for a given employee context.
 */
export function filterSteps<T extends { conditions?: StepConditions | null }>(
  steps: T[],
  ctx: EmployeeContext,
): T[] {
  return steps.filter(s => matchesConditions(s.conditions, ctx))
}
