// Физическое удаление кандидатов по списку id — общая логика для
// bulk hard_delete (HR, app/api/modules/hr/candidates/bulk/route.ts) и
// авто-очистки "призраков" (app/api/cron/ghost-candidate-cleanup/route.ts).
//
// Порядок важен из-за FK:
//   1) обнуляем hh_responses.local_candidate_id (без FK, но чтобы не
//      оставлять висячую ссылку и не путать дедуп);
//   2) удаляем hh_candidates (FK без каскада — иначе delete упрётся);
//   3) удаляем candidates (cascade добьёт test_submissions/
//      qualification_answers/follow_up_messages; outbound → set null).

import { inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, hhCandidates, hhResponses } from "@/lib/db/schema"

export async function hardDeleteCandidatesByIds(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0
  const idList = [...ids]
  return db.transaction(async (tx) => {
    await tx
      .update(hhResponses)
      .set({ localCandidateId: null })
      .where(inArray(hhResponses.localCandidateId, idList))
    await tx.delete(hhCandidates).where(inArray(hhCandidates.candidateId, idList))
    const del = await tx
      .delete(candidates)
      .where(inArray(candidates.id, idList))
      .returning({ id: candidates.id })
    return del.length
  })
}
