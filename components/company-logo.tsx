import { cn } from "@/lib/utils"
import Image from "next/image"

interface CompanyLogoProps {
  logoUrl?: string | null
  companyName?: string | null
  size?: "xs" | "sm" | "md" | "lg"
  rounded?: "none" | "sm" | "md" | "full"
  className?: string
}

const SIZE_MAP = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-16 h-16 text-lg",
}

const ROUNDED_MAP = {
  none: "rounded-none",
  sm:   "rounded-md",
  md:   "rounded-xl",
  full: "rounded-full",
}

export function CompanyLogo({
  logoUrl, companyName, size = "sm", rounded = "md", className
}: CompanyLogoProps) {
  const sizeClass    = SIZE_MAP[size]
  const roundedClass = ROUNDED_MAP[rounded]

  if (logoUrl) {
    return (
      <div className={cn("relative shrink-0 overflow-hidden bg-muted", sizeClass, roundedClass, className)}>
        <Image
          src={logoUrl}
          alt={companyName ?? "Логотип"}
          fill
          className="object-contain p-0.5"
          unoptimized
        />
      </div>
    )
  }

  const initial = companyName ? companyName.charAt(0).toUpperCase() : "К"
  return (
    <div className={cn(
      "shrink-0 flex items-center justify-center font-semibold bg-primary/10 text-primary",
      sizeClass, roundedClass, className
    )}>
      {initial}
    </div>
  )
}
