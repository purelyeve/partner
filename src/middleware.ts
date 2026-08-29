import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/agreement/pdf',
  '/pay',
]

function isPublicPath(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

/** Redirects must carry Supabase auth cookies or sessions get dropped → login loops. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie.name, cookie.value)
  })
  return redirect
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const path = request.nextUrl.pathname
  if (path.startsWith('/api/webhooks')) return response

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            )
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && !isPublicPath(path) && path !== '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', path)
      return redirectWithCookies(url, response)
    }

    if (user && path === '/login') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const url = request.nextUrl.clone()
      url.pathname = profile?.role === 'admin' ? '/admin' : '/partner'
      return redirectWithCookies(url, response)
    }

    // Only bounce away from /register if they already have a distributor (or are admin).
    // Otherwise requireDistributor() → /register and middleware → /partner loops forever.
    if (user && path === '/register') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'admin') {
        const url = request.nextUrl.clone()
        url.pathname = '/admin'
        return redirectWithCookies(url, response)
      }

      const { data: distributor } = await supabase
        .from('distributors')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle()

      if (distributor) {
        const url = request.nextUrl.clone()
        url.pathname = '/partner'
        return redirectWithCookies(url, response)
      }
    }

    if (user && path.startsWith('/admin')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        const url = request.nextUrl.clone()
        url.pathname = '/partner'
        return redirectWithCookies(url, response)
      }
    }
  } catch (err) {
    console.error('[middleware]', err)
    if (isPublicPath(path) || path === '/') return response
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return redirectWithCookies(url, response)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
}
