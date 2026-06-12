import { redirect } from "next/navigation"

export default function OrgStructureRedirect() {
  redirect("/hr/company-structure?tab=scheme")
}
