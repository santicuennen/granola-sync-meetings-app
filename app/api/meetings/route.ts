import { NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { mockMeetings } from './route.mock'

// Cliente S3 configurado con credenciales de Vercel
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

async function fetchMeetingsFromS3() {
  const bucketName = process.env.GRANOLA_S3_BUCKET || 'grnl-meetings'
  
  try {
    // Intentar primero el nuevo formato particionado (index.json)
    try {
      const indexCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: 'index.json',
      })
      
      const indexResponse = await s3Client.send(indexCommand)
      const indexString = await indexResponse.Body?.transformToString()
      
      if (indexString) {
        const index = JSON.parse(indexString)
        console.log(`📊 Found partitioned format: ${index.periods.length} periods, ${index.total_meetings} total meetings`)
        
        // Cargar todos los períodos (en producción podrías cargar solo los últimos N meses)
        const allMeetings = []
        
        for (const period of index.periods) {
          try {
            const periodCommand = new GetObjectCommand({
              Bucket: bucketName,
              Key: period.s3_key,
            })
            
            const periodResponse = await s3Client.send(periodCommand)
            const periodString = await periodResponse.Body?.transformToString()
            
            if (periodString) {
              const periodData = JSON.parse(periodString)
              allMeetings.push(...(periodData.meetings || []))
            }
          } catch (periodError) {
            console.warn(`⚠️  Failed to load period ${period.period}:`, periodError)
          }
        }
        
        console.log(`✅ Loaded ${allMeetings.length} meetings from partitioned format`)
        return allMeetings
      }
    } catch (indexError) {
      console.log('📄 Index.json not found, falling back to legacy format')
    }
    
    // Fallback al formato legacy (meetings.json completo)
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: 'meetings.json',
    })
    
    const response = await s3Client.send(command)
    const bodyString = await response.Body?.transformToString()
    
    if (!bodyString) {
      throw new Error('Empty response from S3')
    }
    
    const data = JSON.parse(bodyString)
    console.log(`✅ Loaded ${data.meetings?.length || 0} meetings from legacy format`)
    return data.meetings || []
  } catch (error) {
    console.error('Error fetching from S3:', error)
    throw error
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  // En desarrollo sin S3 configurado, usar mock data
  if (process.env.NODE_ENV === 'development' && !process.env.AWS_ACCESS_KEY_ID) {
    console.log('🔧 Using mock data (no S3 configured)')
    return NextResponse.json(mockMeetings)
  }

  try {
    const meetings = await fetchMeetingsFromS3()
    
    // Validar que meetings sea un array
    if (!Array.isArray(meetings)) {
      console.error('❌ fetchMeetingsFromS3 did not return an array:', typeof meetings)
      throw new Error('Invalid data format from S3')
    }
    
    // Transformar formato de S3 al formato esperado por el front
    const formattedMeetings = meetings.map((meeting: any) => {
      // Extract summary - prioritize AI-generated summary over manual notes
      let summary = 'No summary available'
      let summaryHtml = null
      
      if (meeting.summary) {
        // AI-generated summary from Granola API
        if (meeting.summary.text) {
          summary = meeting.summary.text
        } else if (meeting.summary.bullets && meeting.summary.bullets.length > 0) {
          summary = meeting.summary.bullets.join('\n')
        }
        summaryHtml = meeting.summary.html
      } else if (meeting.notes_markdown) {
        // Fallback to manual notes
        summary = meeting.notes_markdown
      } else if (meeting.notes_plain) {
        summary = meeting.notes_plain
      }
      
      // Extract attendee names
      const attendeeNames = (meeting.attendees || []).map((a: any) => 
        a.name || a.email || 'Unknown'
      )
      
      return {
        id: meeting.id,
        title: meeting.title,
        date: meeting.date,
        attendees: attendeeNames,
        summary: summary,
        summaryHtml: summaryHtml,
        tags: [],
        transcript: Array.isArray(meeting.transcript) ? meeting.transcript : [],
      }
    })
    
    return NextResponse.json(formattedMeetings, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Error fetching meetings:', error)
    
    // Fallback a mock data si falla S3
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️  S3 error, falling back to mock data')
      return NextResponse.json(mockMeetings)
    }
    
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 })
  }
}
