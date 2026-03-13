import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Simple password protection
export function middleware(request: NextRequest) {
  // Check if user is authenticated
  const authCookie = request.cookies.get('meetings-auth')
  
  // Allow auth endpoint
  if (request.nextUrl.pathname === '/api/auth') {
    return NextResponse.next()
  }
  
  // Redirect to login if not authenticated
  if (!authCookie || authCookie.value !== process.env.AUTH_SECRET) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
}
