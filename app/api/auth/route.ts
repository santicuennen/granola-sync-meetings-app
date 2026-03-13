import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { password } = await request.json()
    
    // Check password against environment variable
    const correctPassword = process.env.AUTH_PASSWORD
    const authSecret = process.env.AUTH_SECRET || 'authenticated'
    
    if (!correctPassword) {
      return NextResponse.json(
        { error: 'Authentication not configured' },
        { status: 500 }
      )
    }
    
    if (password === correctPassword) {
      // Create response with cookie
      const response = NextResponse.json({ success: true })
      
      // Set auth cookie
      response.cookies.set('meetings-auth', authSecret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      })
      
      return response
    }
    
    return NextResponse.json(
      { error: 'Invalid password' },
      { status: 401 }
    )
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}
