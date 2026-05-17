"use client"

import { useRef, useState } from "react"

interface CandidateAvatarProps {
  candidateId: string
  name: string
  photoUrl?: string | null
  colorFrom: string
  colorTo: string
}

export function CandidateAvatar({ candidateId, name, photoUrl, colorFrom, colorTo }: CandidateAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  // Если onLoad успел подменить URL на локальный — используем его.
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  // Защита от повторного POST'а на ту же hh-ссылку при ре-рендере / повторном onLoad.
  const savedRef = useRef<string | null>(null)

  const effective = localUrl ?? photoUrl
  const showPhoto = effective && !imgFailed

  const handleLoad = async () => {
    if (!photoUrl) return
    if (!photoUrl.startsWith("https://img.hhcdn.ru/")) return
    if (savedRef.current === photoUrl) return
    savedRef.current = photoUrl
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/save-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl }),
      })
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { localUrl?: string } | null
        if (data?.localUrl) setLocalUrl(data.localUrl)
      }
    } catch {
      // молча — это opportunistic backfill, основная функциональность не страдает
    }
  }

  if (showPhoto) {
    return (
      <img
        src={effective}
        alt={name}
        className="w-7 h-7 rounded-full flex-shrink-0 object-cover"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <div
      className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
      style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}
    >
      {name.charAt(0)}
    </div>
  )
}
