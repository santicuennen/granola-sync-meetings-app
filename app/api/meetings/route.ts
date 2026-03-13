import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { mockMeetings } from './route.mock'

export async function GET() {
  // En desarrollo, usar mock data si no hay POSTGRES_URL
  if (process.env.NODE_ENV === 'development' && !process.env.POSTGRES_URL) {
    console.log('🔧 Using mock data (no database configured)')
    return NextResponse.json(mockMeetings)
  }

  try {
    const { rows } = await sql`
      SELECT id, title, date, attendees, summary, tags
      FROM meetings
      ORDER BY date DESC
    `
    
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error fetching meetings:', error)
    
    // Fallback a mock data si falla la DB
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️  Database error, falling back to mock data')
      return NextResponse.json(mockMeetings)
    }
    
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 })
  }
}
