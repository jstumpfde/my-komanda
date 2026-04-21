import { NextResponse } from "next/server"
import { getValidToken } from "@/lib/hh-helpers"

export async function GET() {
  const token = await getValidToken("ae75117f-a3b7-49f5-abf3-8b3fbd9e3de9")
  if (!token) return NextResponse.json({ error: "no token" })
  const res = await fetch("https://api.hh.ru/negotiations/5241265749", {
    headers: { Authorization: `Bearer ${token.accessToken}`, "User-Agent": "company24.pro/1.0 jstumpf.de@gmail.com" }
  })
  const data = await res.json()
  return NextResponse.json({ status: res.status, actions: data.actions, messaging_status: data.messaging_status, state: data.state, fullKeys: Object.keys(data) })
}
