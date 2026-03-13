import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

const GRANOLA_API_URL = process.env.GRANOLA_API_URL || 'https://api.granola.ai/v1'
const GRANOLA_API_KEY = process.env.GRANOLA_API_KEY

export async function POST(request: Request) {
  // Verificar cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch meetings from Granola API
    const response = await fetch(`${GRANOLA_API_URL}/meetings`, {
      headers: {
        'Authorization': `Bearer ${GRANOLA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Granola API error: ${response.statusText}`)
    }

    const meetings = await response.json()

    // Crear tabla si no existe
    await sql`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TIMESTAMP NOT NULL,
        attendees TEXT[] NOT NULL,
        summary TEXT,
        transcript TEXT,
        tags TEXT[],
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Insertar o actualizar meetings
    let synced = 0
    for (const meeting of meetings) {
      await sql`
        INSERT INTO meetings (id, title, date, attendees, summary, transcript, tags, updated_at)
        VALUES (
          ${meeting.id},
          ${meeting.title},
          ${meeting.date},
          ${meeting.attendees},
          ${meeting.summary},
          ${meeting.transcript},
          ${meeting.tags || []},
          NOW()
        )
        ON CONFLICT (id) 
        DO UPDATE SET
          title = EXCLUDED.title,
          date = EXCLUDED.date,
          attendees = EXCLUDED.attendees,
          summary = EXCLUDED.summary,
          transcript = EXCLUDED.transcript,
          tags = EXCLUDED.tags,
          updated_at = NOW()
      `
      synced++
    }

    return NextResponse.json({ 
      success: true, 
      synced,
      message: `Synced ${synced} meetings from Granola`
    })

  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ 
      error: 'Sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
