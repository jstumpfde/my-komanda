"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function OnboardingRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/register")
  }, [router])
  return null
}
