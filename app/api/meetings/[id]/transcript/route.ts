import { NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

async function fetchMeetingFromS3(meetingId: string) {
  const bucketName = process.env.GRANOLA_S3_BUCKET || 'grnl-meetings'

  // Leer el índice para saber en qué período está el meeting
  const indexRes = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: 'index.json' }))
  const indexStr = await indexRes.Body?.transformToString()
  if (!indexStr) throw new Error('Empty index')
  const index = JSON.parse(indexStr)

  // Buscar en cada período hasta encontrar el meeting
  for (const period of index.periods) {
    const periodRes = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: period.s3_key }))
    const periodStr = await periodRes.Body?.transformToString()
    if (!periodStr) continue
    const data = JSON.parse(periodStr)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = (data.meetings || []).find((m: any) => m.id === meetingId)
    if (found) return found
  }

  return null
}

function formatTranscript(transcript: any[]): string {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return '<p>No transcript available</p>'
  }
  
  return transcript.map(segment => {
    const speaker = segment.speaker === 'me' ? 'You' : 'Them'
    const time = new Date(segment.start).toLocaleTimeString()
    return `<div class="segment">
      <span class="speaker ${segment.speaker}">${speaker}</span>
      <span class="time">${time}</span>
      <p class="text">${segment.text}</p>
    </div>`
  }).join('\n')
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const meeting = await fetchMeetingFromS3(params.id)

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    const attendeeNames = meeting.attendees?.map((a: any) => a.name || a.email).join(', ') || 'N/A'

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
              max-width: 900px;
              margin: 0 auto;
              padding: 2rem;
              line-height: 1.6;
              background: #f9fafb;
            }
            h1 { color: #1f2937; margin-bottom: 0.5rem; }
            .meta { 
              color: #6b7280; 
              margin-bottom: 2rem; 
              padding-bottom: 1rem;
              border-bottom: 2px solid #e5e7eb;
            }
            .transcript { 
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .segment {
              margin-bottom: 1.5rem;
              padding-bottom: 1rem;
              border-bottom: 1px solid #f3f4f6;
            }
            .segment:last-child {
              border-bottom: none;
            }
            .speaker {
              font-weight: 600;
              font-size: 0.875rem;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .speaker.me { color: #2563eb; }
            .speaker.them { color: #7c3aed; }
            .time {
              color: #9ca3af;
              font-size: 0.75rem;
              margin-left: 0.5rem;
            }
            .text {
              margin: 0.5rem 0 0 0;
              color: #374151;
            }
          </style>
        </head>
        <body>
          <h1>${meeting.title}</h1>
          <div class="meta">
            <p><strong>Date:</strong> ${new Date(meeting.date).toLocaleString()}</p>
            <p><strong>Attendees:</strong> ${attendeeNames}</p>
          </div>
          <div class="transcript">
            ${formatTranscript(meeting.transcript)}
          </div>
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
