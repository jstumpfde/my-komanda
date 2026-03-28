import { redirect } from "next/navigation"

export default function SourcesRedirect() {
  redirect("/hr/analytics?tab=sources")
}
