import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Confirm the email via code exchange, then sign out so the user
      // lands on the login page and signs in manually with their password.
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?verified=1`)
    }
  }

  return NextResponse.redirect(`${origin}/login?verified=0`)
}
