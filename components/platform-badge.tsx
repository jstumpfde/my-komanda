"use client"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface PlatformBadgeProps {
  hidden?: boolean
  className?: string
}

export function PlatformBadge({ hidden, className }: PlatformBadgeProps) {
  if (hidden) return null
  return (
    <div className={cn("group-data-[collapsible=icon]:hidden px-2 pb-1", className)}>
      <Link
        href="https://company24.pro"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[10px] text-sidebar-foreground/30 hover:text-sidebar-foreground/50 transition-colors"
      >
        <span>Powered by</span>
        <span className="font-medium">Company24.pro</span>
      </Link>
    </div>
  )
}
