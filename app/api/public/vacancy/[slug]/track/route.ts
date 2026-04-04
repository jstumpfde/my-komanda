import { NextRequest } from "next/server"
import { eq, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancyUtmLinks } from "@/lib/db/schema"
import { apiSuccess } from "@/lib/api-helpers"

// POST — increment clicks for a UTM link
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const body = await req.json() as { utmSource?: string; utmMedium?: string }

    if (!body.utmSource) {
      return apiSuccess({ tracked: false })
    }

    // Find matching UTM link by source + slug pattern
    // The utm link slug contains the source prefix
    const utmSlugPattern = `${body.utmSource}-${body.utmMedium || ""}`

    // Try to find an exact link or match by source
    const links = await db
      .select()
      .from(vacancyUtmLinks)
      .where(eq(vacancyUtmLinks.source, body.utmSource))

    if (links.length > 0) {
      // If utmMedium is provided, try to find exact match by slug
      let matchedLink = links[0]
      if (body.utmMedium) {
        const exactMatch = links.find((l) => l.slug.includes(body.utmMedium!))
        if (exactMatch) matchedLink = exactMatch
      }

      await db
        .update(vacancyUtmLinks)
        .set({ clicks: sql`${vacancyUtmLinks.clicks} + 1` })
        .where(eq(vacancyUtmLinks.id, matchedLink.id))
    }

    return apiSuccess({ tracked: true })
  } catch {
    return apiSuccess({ tracked: false })
  }
}
