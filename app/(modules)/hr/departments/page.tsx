import { redirect } from "next/navigation"

export default function DepartmentsRedirect() {
  redirect("/hr/company-structure?tab=departments")
}
