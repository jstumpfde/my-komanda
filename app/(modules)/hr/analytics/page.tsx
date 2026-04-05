import { redirect } from "next/navigation"

export default function HrAnalyticsPage() {
  redirect("/hr/dashboard?tab=analytics")
}
