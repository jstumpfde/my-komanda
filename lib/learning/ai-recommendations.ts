// Pure logic — no DB imports, safe for client/server both

export interface SkillGap {
  skillId: string
  skillName: string
  skillCategory: string // sales/product/soft_skills/compliance/custom / hard/soft/tool/domain
  gap: number // required - current (positive = need improvement)
}

export interface CourseOption {
  id: string
  title: string
  category: string // product/sales/soft_skills/compliance/custom
  difficulty: string // beginner/intermediate/advanced
}

export interface Recommendation {
  courseId: string
  courseTitle: string
  priority: "high" | "medium" | "low"
  reason: string
  matchedSkills: string[]
}

// Maps skill categories to course categories
const SKILL_TO_COURSE: Record<string, string[]> = {
  // DB skill categories
  hard:   ["product", "compliance", "custom"],
  soft:   ["soft_skills", "custom"],
  tool:   ["product", "sales", "custom"],
  domain: ["sales", "compliance", "product"],
  // Extended: skill names → course categories (keyword matching)
}

// Keyword rules: if skill name contains key → course category match score
const KEYWORD_RULES: { keyword: string; category: string; boost: number }[] = [
  { keyword: "crm",          category: "sales",       boost: 3 },
  { keyword: "продаж",       category: "sales",       boost: 3 },
  { keyword: "холодн",       category: "sales",       boost: 2 },
  { keyword: "переговор",    category: "sales",       boost: 2 },
  { keyword: "презентац",    category: "soft_skills", boost: 2 },
  { keyword: "аналитик",     category: "product",     boost: 2 },
  { keyword: "excel",        category: "product",     boost: 1 },
  { keyword: "управлени",    category: "compliance",  boost: 1 },
  { keyword: "коммуникац",   category: "soft_skills", boost: 3 },
  { keyword: "тайм",         category: "soft_skills", boost: 2 },
  { keyword: "команд",       category: "soft_skills", boost: 2 },
  { keyword: "продукт",      category: "product",     boost: 3 },
]

function scoreCoursForGap(course: CourseOption, gap: SkillGap): number {
  let score = 0

  // Category match via skill category → course category mapping
  const matchedCategories = SKILL_TO_COURSE[gap.skillCategory] || []
  if (matchedCategories.includes(course.category)) score += 2

  // Keyword match from skill name
  const nameLower = gap.skillName.toLowerCase()
  for (const rule of KEYWORD_RULES) {
    if (nameLower.includes(rule.keyword) && rule.category === course.category) {
      score += rule.boost
    }
  }

  // Weight by gap size
  score *= gap.gap

  return score
}

export function getRecommendations(
  gaps: SkillGap[],
  courses: CourseOption[],
): Recommendation[] {
  if (!gaps.length || !courses.length) return []

  // Score each course against all gaps
  const courseScores: Map<string, { course: CourseOption; score: number; skills: string[] }> = new Map()

  for (const course of courses) {
    let total = 0
    const matchedSkills: string[] = []

    for (const gap of gaps) {
      const s = scoreCoursForGap(course, gap)
      if (s > 0) {
        total += s
        if (gap.skillName) matchedSkills.push(gap.skillName)
      }
    }

    if (total > 0) {
      courseScores.set(course.id, { course, score: total, skills: matchedSkills })
    }
  }

  // Sort by score
  const sorted = Array.from(courseScores.values()).sort((a, b) => b.score - a.score)

  // Build recommendations
  return sorted.slice(0, 5).map(({ course, score, skills }) => {
    const priority: "high" | "medium" | "low" =
      score >= 10 ? "high" : score >= 5 ? "medium" : "low"

    let reason = ""
    if (skills.length > 0) {
      reason = `Поможет развить: ${skills.slice(0, 3).join(", ")}`
    } else {
      reason = "Соответствует вашему профилю развития"
    }

    return {
      courseId: course.id,
      courseTitle: course.title,
      priority,
      reason,
      matchedSkills: skills,
    }
  })
}
