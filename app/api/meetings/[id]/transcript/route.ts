import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { rows } = await sql`
      SELECT id, title, date, attendees, transcript
      FROM meetings
      WHERE id = ${params.id}
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    const meeting = rows[0]

    // Retornar HTML con el transcript formateado
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${meeting.title} - Transcript</title>
          <meta charset="utf-8">
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 2rem;
              line-height: 1.6;
            }
            h1 { color: #1f2937; }
            .meta { color: #6b7280; margin-bottom: 2rem; }
            .transcript { white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>${meeting.title}</h1>
          <div class="meta">
            <p><strong>Date:</strong> ${new Date(meeting.date).toLocaleString()}</p>
            <p><strong>Attendees:</strong> ${meeting.attendees.join(', ')}</p>
          </div>
          <div class="transcript">${meeting.transcript || 'No transcript available'}</div>
        </body>
      </html>
    `

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    })

  } catch (error) {
    console.error('Error fetching transcript:', error)
    return NextResponse.json({ error: 'Failed to fetch transcript' }, { status: 500 })
  }
}
