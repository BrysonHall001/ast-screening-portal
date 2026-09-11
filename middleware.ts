import { NextRequest, NextResponse } from 'next/server'

// We can't safely verify the HMAC in edge middleware without the secret
// being available to the edge runtime, but we CAN check the cookie exists
// and bounce obvious unauthenticated traffic. Real verification happens
// in server components via getCurrentUser().
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!pathname.startsWith('/admin')) return NextResponse.next()

  const session = req.cookies.get('asp_session')?.value
  if (!session) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
