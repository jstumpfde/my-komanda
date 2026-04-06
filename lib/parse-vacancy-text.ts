/**
 * Parse raw vacancy text (from DOCX/PDF/TXT) into structured anketa fields.
 * Splits text by common Russian section headings and distributes content.
 */

interface ParsedVacancy {
  vacancyTitle?: string
  responsibilities: string
  requirements: string
  conditions: string[]
  bonus: string
  salaryFrom: string
  salaryTo: string
  companyDescription: string
}

// Heading patterns for each section
const SECTION_PATTERNS: { key: keyof Omit<ParsedVacancy, "vacancyTitle" | "salaryFrom" | "salaryTo" | "conditions">; patterns: RegExp[] }[] = [
  {
    key: "responsibilities",
    patterns: [
      /^(?:обязанности|задачи|что\s+(?:нужно\s+)?(?:делать|будет(?:е)?\s+делать)|функционал|чем\s+(?:предстоит|будете)\s+заниматься|что\s+будет\s+на\s+старте|ваши\s+задачи|основные\s+задачи)/i,
    ],
  },
  {
    key: "requirements",
    patterns: [
      /^(?:требования|(?:кого\s+)?(?:мы\s+)?ищем|(?:что|кто)\s+(?:нам\s+)?нуж(?:ен|но)|ожидания|навыки|опыт|(?:наш\s+)?идеальный\s+кандидат|(?:будет\s+)?(?:плюсом|преимуществом))/i,
    ],
  },
  {
    key: "conditions",
    patterns: [
      /^(?:условия|(?:мы\s+)?предлагаем|(?:мы\s+)?(?:предоставляем|гарантируем|обеспечиваем)|что\s+(?:мы\s+)?(?:предлагаем|даём|дадим)|бонусы\s+и\s+(?:плюшки|бенефиты)|компенсации|льготы|(?:наши\s+)?(?:преимущества|плюсы))/i,
    ],
  },
  {
    key: "bonus",
    patterns: [
      /^(?:доход|зарплата|оплата|мотивация|(?:финансовая|денежная)\s+мотивация|сколько\s+(?:платим|зарабатывают)|вознаграждение|компенсация)/i,
    ],
  },
  {
    key: "companyDescription",
    patterns: [
      /^(?:о\s+компании|(?:наша\s+)?компания|кто\s+мы|о\s+нас|(?:о\s+)?(?:ГК|группа\s+компаний|ООО|ИП|АО|ЗАО))/i,
    ],
  },
]

/** Try to extract salary from text like "200 000 – 300 000" */
function extractSalary(text: string): { from: string; to: string } | null {
  // Pattern: digits with spaces/dots — separator — digits with spaces/dots — optional ₽/руб
  const m = text.match(/(\d[\d\s.]{2,})\s*[–—\-−]\s*(\d[\d\s.]{2,})\s*(?:₽|руб|р\.)?/i)
  if (m) {
    const from = m[1].replace(/[\s.]/g, "")
    const to = m[2].replace(/[\s.]/g, "")
    return { from, to }
  }
  // "от X" pattern
  const mFrom = text.match(/от\s+(\d[\d\s.]{2,})\s*(?:₽|руб|р\.)?/i)
  if (mFrom) return { from: mFrom[1].replace(/[\s.]/g, ""), to: "" }
  // "до X" pattern
  const mTo = text.match(/до\s+(\d[\d\s.]{2,})\s*(?:₽|руб|р\.)?/i)
  if (mTo) return { from: "", to: mTo[1].replace(/[\s.]/g, "") }
  return null
}

/** Format a block of text: add bullet points to list items, clean up spacing */
function formatBlock(lines: string[]): string {
  return lines
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) return ""
      // If line starts with dash/bullet/dot, normalize to bullet
      if (/^[•\-–—·▪▸►✓✔☑⁃]\s*/.test(trimmed)) {
        return `• ${trimmed.replace(/^[•\-–—·▪▸►✓✔☑⁃]\s*/, "")}`
      }
      // If line looks like a list item (short, no period at end, lowercase start after heading)
      if (trimmed.length < 120 && !/[.!?]$/.test(trimmed) && /^[а-яa-z]/.test(trimmed)) {
        return `• ${trimmed}`
      }
      return trimmed
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Detect which section a heading line belongs to */
function detectSection(line: string): string | null {
  const clean = line.replace(/^[#\d.\-–—:)\]]+\s*/, "").trim()
  for (const s of SECTION_PATTERNS) {
    for (const p of s.patterns) {
      if (p.test(clean)) return s.key
    }
  }
  return null
}

/** Check if a line looks like a section heading */
function isHeading(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  // Short line (< 80 chars) that ends without period and is not a list item
  if (trimmed.length > 80) return false
  if (/^[•\-–—·]/.test(trimmed)) return false
  if (/[,;]$/.test(trimmed)) return false
  // Has a section match
  return detectSection(trimmed) !== null
}

export function parseVacancyText(rawText: string): ParsedVacancy {
  const lines = rawText.split("\n")

  const result: ParsedVacancy = {
    responsibilities: "",
    requirements: "",
    conditions: [],
    bonus: "",
    salaryFrom: "",
    salaryTo: "",
    companyDescription: "",
  }

  // Try to extract salary from entire text
  const salary = extractSalary(rawText)
  if (salary) {
    result.salaryFrom = salary.from
    result.salaryTo = salary.to
  }

  // Split into sections
  const sections: { key: string; lines: string[] }[] = []
  let currentKey = "companyDescription" // default — lines before first heading go to company description
  let currentLines: string[] = []

  for (const line of lines) {
    if (isHeading(line)) {
      // Save previous section
      if (currentLines.length > 0) {
        sections.push({ key: currentKey, lines: currentLines })
      }
      currentKey = detectSection(line) || currentKey
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  // Save last section
  if (currentLines.length > 0) {
    sections.push({ key: currentKey, lines: currentLines })
  }

  // If no sections detected, put everything into responsibilities
  if (sections.length <= 1 && !sections.some(s => s.key !== "companyDescription")) {
    result.responsibilities = formatBlock(lines)
    return result
  }

  // Distribute sections
  for (const section of sections) {
    const text = formatBlock(section.lines)
    if (!text) continue

    switch (section.key) {
      case "responsibilities":
        result.responsibilities = result.responsibilities
          ? `${result.responsibilities}\n\n${text}`
          : text
        break
      case "requirements":
        result.requirements = result.requirements
          ? `${result.requirements}\n\n${text}`
          : text
        break
      case "conditions": {
        // Split into individual items
        const items = text.split("\n")
          .map(l => l.replace(/^•\s*/, "").trim())
          .filter(Boolean)
        result.conditions = items
        break
      }
      case "bonus":
        result.bonus = text
        break
      case "companyDescription":
        result.companyDescription = result.companyDescription
          ? `${result.companyDescription}\n\n${text}`
          : text
        break
    }
  }

  return result
}
