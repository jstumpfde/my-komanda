import { redirect } from "next/navigation"

export default function PositionsRedirect() {
  redirect("/hr/company-structure?tab=positions")
}
