"use client"

import { useState } from "react"

interface CandidateAvatarProps {
  name: string
  photoUrl?: string | null
  colorFrom: string
  colorTo: string
}

export function CandidateAvatar({ name, photoUrl, colorFrom, colorTo }: CandidateAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const showPhoto = photoUrl && !imgFailed

  if (showPhoto) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="w-7 h-7 rounded-full flex-shrink-0 object-cover"
        referrerPolicy="no-referrer"
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
