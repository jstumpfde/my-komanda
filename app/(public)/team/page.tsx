import type { Metadata } from "next"
import { Sparkles, User, type LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Команда | Company24",
}

type Teammate = {
  icon: LucideIcon
  iconColor: string
  name: string
  role: string
  description: string
}

const teammates: Teammate[] = [
  {
    icon: User,
    iconColor: "text-indigo-400",
    name: "Юрий",
    role: "Founder",
    description:
      "Строит Company24 как операционный хребет для команд, которым важна скорость.",
  },
  {
    icon: Sparkles,
    iconColor: "text-fuchsia-400",
    name: "Мария",
    role: "MarketRadar Lead",
    description:
      "Ведёт продукт MarketRadar и формирует стратегию роста на рынке.",
  },
]

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased px-6 py-16 md:py-24">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center mb-12">
          Команда
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {teammates.map((member) => {
            const Icon = member.icon
            return (
              <Card
                key={member.name}
                className="bg-gray-900 border-gray-800 text-white"
              >
                <CardHeader className="items-start gap-3">
                  <Icon className={`w-8 h-8 ${member.iconColor}`} />
                  <CardTitle className="text-xl font-semibold">
                    {member.name}
                  </CardTitle>
                  <p className="text-sm text-gray-400">{member.role}</p>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300 leading-relaxed">
                    {member.description}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
