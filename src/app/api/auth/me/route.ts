import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";

export async function GET() {
  const user = await getAuthenticatedProfile();
  return NextResponse.json({ user });
}
