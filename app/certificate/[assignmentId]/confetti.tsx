"use client"

import { useMemo } from "react"

// CSS-only конфетти: 35 частиц, разные цвета/задержки, длительность 3 секунды.
// Рендерится один раз при монтировании страницы сертификата.

const COLORS = [
  "#7F77DD", // violet
  "#FC3F1D", // red
  "#0F9D58", // green
  "#FBBF24", // amber
  "#0077FF", // blue
  "#EC4899", // pink
  "#8B5CF6", // purple
]

interface Particle {
  left: number
  delay: number
  duration: number
  color: string
  rotation: number
  size: number
  shape: "square" | "circle"
}

function generateParticles(count: number): Particle[] {
  const list: Particle[] = []
  for (let i = 0; i < count; i++) {
    list.push({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.5 + Math.random() * 1.2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * 360,
      size: 6 + Math.floor(Math.random() * 6),
      shape: Math.random() > 0.5 ? "square" : "circle",
    })
  }
  return list
}

export function Confetti({ count = 40 }: { count?: number }) {
  const particles = useMemo(() => generateParticles(count), [count])

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden z-50 print:hidden"
      aria-hidden
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes confetti-fall {
              0% {
                transform: translateY(-20px) rotate(0deg);
                opacity: 1;
              }
              100% {
                transform: translateY(110vh) rotate(720deg);
                opacity: 0;
              }
            }
            .confetti-particle {
              position: absolute;
              top: -20px;
              animation-name: confetti-fall;
              animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
              animation-fill-mode: forwards;
              will-change: transform, opacity;
            }
          `,
        }}
      />
      {particles.map((p, i) => (
        <div
          key={i}
          className="confetti-particle"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            borderRadius: p.shape === "circle" ? "50%" : "2px",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  )
}
