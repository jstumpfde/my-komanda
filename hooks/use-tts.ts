'use client'
import { useCallback, useRef } from 'react'

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async (text: string) => {
    audioRef.current?.pause()

    const resp = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!resp.ok) return

    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    audioRef.current = new Audio(url)
    audioRef.current.play()
  }, [])

  const stop = useCallback(() => audioRef.current?.pause(), [])

  return { speak, stop }
}
