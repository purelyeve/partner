import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/login'
  const isPasswordReset = next.startsWith('/reset-password')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (isPasswordReset) {
        // Keep the recovery session so updateUser({ password }) works.
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      // Email confirmation: sign out so the user signs in with their password.
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?verified=1`)
    }
  }

  if (isPasswordReset) {
    return NextResponse.redirect(`${origin}/reset-password?error=link`)
  }
  return NextResponse.redirect(`${origin}/login?verified=0`)
}
