export function generateCandidateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let token = ""
  for (let i = 0; i < 12; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

export interface PublicCandidate {
  token: string
  name: string
  firstName: string
  position: string
  company: string
  companyLogo?: string
  brandPlan: "trial" | "business" | "pro"
  brandColor: string
  salary: string
}

// Тестовый кандидат
export const TEST_CANDIDATE: PublicCandidate = {
  token: "abc123xyz789",
  name: "Иван Петров",
  firstName: "Иван",
  position: "Менеджер по продажам",
  company: "ООО Ромашка",
  brandPlan: "trial",
  brandColor: "#3b82f6",
  salary: "80 000 – 150 000 ₽",
}

const candidatesByToken: Record<string, PublicCandidate> = {
  [TEST_CANDIDATE.token]: TEST_CANDIDATE,
}

export function getCandidateByToken(token: string): PublicCandidate | null {
  return candidatesByToken[token] || null
}

export function registerCandidate(candidate: PublicCandidate) {
  candidatesByToken[candidate.token] = candidate
}
