// Ссылочные переменные для рендера дожим-касаний стадии (Воронка 3, fix
// «{{test_link}} литералом»: дефолтные шаблоны дожима test/task-стадий
// используют {{test_link}} — рантайм обязан его подставлять).
//
// Чистая функция (без IO) — юнит-тестируется вместе с dozhim-templates.

import type { StageActionType } from "@/lib/funnel-v2/types"

export interface DozhimLinkVars {
  demo_link: string
  test_link: string
}

/**
 * Ссылки этапа для текстов дожима.
 *
 * - test_link всегда указывает на /test/<token>.
 * - Для test/task-стадий {{demo_link}} ТОЖЕ ведёт на /test-URL: дожим стадии
 *   зовёт кандидата к её артефакту, а не к демо (пользовательский текст мог
 *   вставить «не тот» плейсхолдер — кандидат всё равно попадёт куда нужно).
 */
export function dozhimLinkVars(action: StageActionType | undefined, token: string, baseUrl: string): DozhimLinkVars {
  const demoUrl = `${baseUrl}/demo/${token}`
  const testUrl = `${baseUrl}/test/${token}`
  const isTestStage = action === "test" || action === "task"
  return {
    demo_link: isTestStage ? testUrl : demoUrl,
    test_link: testUrl,
  }
}
