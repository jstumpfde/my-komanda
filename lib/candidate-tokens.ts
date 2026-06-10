import { randomBytes } from "crypto"

export function generateCandidateToken(): string {
  // 9 байт → 12 символов base64url (совместимо с прежней длиной 12)
  return randomBytes(9).toString("base64url")
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
