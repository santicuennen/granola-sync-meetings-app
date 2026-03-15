import { NextResponse } from 'next/server'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const BUCKET = process.env.GRANOLA_S3_BUCKET || 'grnl-meetings'

interface TranscriptSegment {
  document_id: string
  start_timestamp: number
  end_timestamp: number
  source: 'microphone' | 'system'
  text: string
}

interface RawMeeting {
  id: string
  title: string
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  was_trashed?: boolean
  status?: string
  workspace_id?: string
  chapters?: unknown[]
  notes_markdown?: string
  notes_plain?: string
  people?: {
    creator?: { name: string; email: string }
    attendees?: Array<{ name: string; email: string }>
  }
  google_calendar_event?: {
    start?: { dateTime?: string }
  }
}

interface FormattedMeeting {
  id: string
  title: string
  date: string
  updated_at?: string
  status?: string
  attendees: Array<{ name: string; email: string }>
  notes_markdown: string
  notes_plain: string
  summary: { html: string | null; text: string; bullets: string[] } | null
  transcript: Array<{ start: number; end: number; speaker: 'me' | 'them'; text: string }>
  chapters: unknown[]
  workspace_id?: string
}

type SummaryIndex = Record<string, { html: string | null; text: string; bullets: string[] }>

type TranscriptIndex = Record<
  string,
  Array<{ start: number; end: number; speaker: 'me' | 'them'; text: string }>
>

interface GranolaTokenFile {
  access_token: string
  refresh_token?: string
  client_id?: string
  uploaded_at: string
  // legacy: algunos archivos viejos tienen solo "token"
  token?: string
}

interface S3File {
  key: string
  body: string
}

function parseCache(cacheData: unknown): { meetings: RawMeeting[]; transcriptIndex: TranscriptIndex } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = cacheData as any

  // DEV LOGS: estructura del cache recibido
  if (process.env.NODE_ENV !== 'production') {
    console.log('[parseCache] top-level keys:', data ? Object.keys(data) : 'null/undefined')
    if (data?.cache) {
      console.log('[parseCache] cache keys:', Object.keys(data.cache))
      if (data.cache?.state) {
        console.log('[parseCache] cache.state keys (first 10):', Object.keys(data.cache.state).slice(0, 10))
        console.log('[parseCache] documents exists at cache.state.documents:', !!data.cache.state.documents)
      }
      if (data.cache?.cache?.state) {
        console.log('[parseCache] ALSO found cache.cache.state (double-nested)')
        console.log('[parseCache] documents exists at cache.cache.state.documents:', !!data.cache.cache.state.documents)
      }
    }
  }

  // Intentar ambos paths para compatibilidad
  const docs = data?.cache?.state?.documents ?? data?.cache?.cache?.state?.documents
  if (!docs) {
    const msg = `Invalid cache format: documents not found. Top-level keys: ${data ? Object.keys(data).join(', ') : 'none'}`
    console.error('[parseCache]', msg)
    throw new Error(msg)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meetings: RawMeeting[] = (Object.values(docs as Record<string, unknown>) as any[]).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) => {
      if (!m?.id || !m?.title) return false
      if (m.deleted_at) return false
      if (m.was_trashed === true) return false
      return true
    }
  )

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[parseCache] total docs: ${Object.keys(docs).length}, valid meetings: ${meetings.length}`)
  }

  const transcriptIndex: TranscriptIndex = {}
  const rawTranscripts = data?.cache?.state?.transcripts ?? data?.cache?.cache?.state?.transcripts
  if (rawTranscripts) {
    for (const segments of Object.values(rawTranscripts as Record<string, unknown>)) {
      if (!Array.isArray(segments)) continue
      for (const seg of segments as TranscriptSegment[]) {
        const docId = seg.document_id
        if (!docId) continue
        if (!transcriptIndex[docId]) transcriptIndex[docId] = []
        transcriptIndex[docId].push({
          start: seg.start_timestamp,
          end: seg.end_timestamp,
          speaker: seg.source === 'microphone' ? 'me' : 'them',
          text: seg.text,
        })
      }
    }
    for (const docId of Object.keys(transcriptIndex)) {
      transcriptIndex[docId].sort((a, b) => a.start - b.start)
    }
  }

  return { meetings, transcriptIndex }
}

function fixEncoding(str: string): string {
  if (!str) return str
  return Buffer.from(str, 'latin1').toString('utf8')
}

function formatMeeting(
  raw: RawMeeting,
  transcriptIndex: TranscriptIndex,
  summaryIndex: SummaryIndex
): FormattedMeeting {
  const attendees: Array<{ name: string; email: string }> = []
  if (raw.people?.creator) attendees.push(raw.people.creator)
  if (raw.people?.attendees) attendees.push(...raw.people.attendees)

  const date =
    raw.created_at ||
    raw.google_calendar_event?.start?.dateTime ||
    new Date().toISOString()

  return {
    id: raw.id,
    title: raw.title,
    date,
    updated_at: raw.updated_at,
    status: raw.status,
    attendees,
    notes_markdown: raw.notes_markdown || '',
    notes_plain: raw.notes_plain || '',
    summary: summaryIndex[raw.id] ?? null,
    transcript: transcriptIndex[raw.id] ?? [],
    chapters: raw.chapters || [],
    workspace_id: raw.workspace_id,
  }
}

function partitionByPeriod(meetings: FormattedMeeting[]): Record<string, FormattedMeeting[]> {
  const result: Record<string, FormattedMeeting[]> = {}
  for (const meeting of meetings) {
    const period = new Date(meeting.date).toISOString().slice(0, 7)
    if (!result[period]) result[period] = []
    result[period].push(meeting)
  }
  return result
}

async function refreshGranolaToken(
  refreshToken: string,
  clientId: string
): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch('https://auth.granola.ai/user_management/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Token refresh failed ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new Error('Refresh response missing access_token')
  return { access_token: data.access_token, refresh_token: data.refresh_token }
}

async function callGranolaAPI(token: string): Promise<Response> {
  return fetch('https://api.granola.ai/v2/get-documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Granola/5.354.0',
      'X-Client-Version': '5.354.0',
    },
    body: JSON.stringify({ limit: 100, offset: 0, include_last_viewed_panel: true }),
  })
}

async function fetchGranolaSummaries(
  tokenFile: GranolaTokenFile,
  s3: S3Client,
  bucket: string
): Promise<SummaryIndex> {
  // Soporte legacy: archivos viejos tienen solo "token"
  let accessToken = tokenFile.access_token ?? tokenFile.token ?? ''

  let response = await callGranolaAPI(accessToken)

  // Si el token expiró y tenemos refresh_token, renovar automáticamente
  if (response.status === 401 && tokenFile.refresh_token && tokenFile.client_id) {
    console.log('[fetchGranolaSummaries] access_token expirado, renovando con refresh_token...')
    const newTokens = await refreshGranolaToken(tokenFile.refresh_token, tokenFile.client_id)

    // Persistir access_token Y refresh_token nuevos en S3 (rotation de un solo uso)
    const updatedTokenFile: GranolaTokenFile = {
      ...tokenFile,
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      uploaded_at: new Date().toISOString(),
    }
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: 'cache-backups/granola-token.json',
      Body: JSON.stringify(updatedTokenFile),
      ContentType: 'application/json',
    }))
    console.log('[fetchGranolaSummaries] tokens renovados y guardados en S3')

    response = await callGranolaAPI(newTokens.access_token)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error(`[fetchGranolaSummaries] API error ${response.status}: ${body.slice(0, 300)}`)
    throw new Error(`Granola API responded with ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()
  const summaryIndex: SummaryIndex = {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const doc of data?.docs ?? []) {
    const panel = doc?.last_viewed_panel
    if (panel?.title !== 'Summary') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bullets: string[] = (panel.generated_lines || []).map((l: any) =>
      fixEncoding(l.text || '')
    )
    summaryIndex[doc.id] = {
      html: panel.original_content ? fixEncoding(panel.original_content) : null,
      bullets,
      text: bullets.join('\n'),
    }
  }

  return summaryIndex
}

async function uploadToS3(s3: S3Client, bucket: string, files: S3File[]): Promise<void> {
  for (const file of files) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: file.key,
        Body: file.body,
        ContentType: 'application/json',
      })
    )
  }
}

function buildS3Files(meetings: FormattedMeeting[]): S3File[] {
  const partitioned = partitionByPeriod(meetings)
  const now = new Date().toISOString()
  const files: S3File[] = []

  const periodMeta: Array<{
    period: string
    count: number
    file: string
    s3_key: string
    first_meeting: string
    last_meeting: string
  }> = []

  for (const [period, periodMeetings] of Object.entries(partitioned)) {
    const key = `${period}/meetings.json`
    files.push({
      key,
      body: JSON.stringify({
        period,
        exported_at: now,
        count: periodMeetings.length,
        meetings: periodMeetings,
      }),
    })
    periodMeta.push({
      period,
      count: periodMeetings.length,
      file: `meetings-${period}.json`,
      s3_key: key,
      first_meeting: periodMeetings[0].date,
      last_meeting: periodMeetings[periodMeetings.length - 1].date,
    })
  }

  files.push({
    key: 'index.json',
    body: JSON.stringify({
      generated_at: now,
      version: '2.0',
      total_meetings: meetings.length,
      periods: periodMeta,
    }),
  })

  files.push({
    key: 'meetings.json',
    body: JSON.stringify({
      exported_at: now,
      version: '1.0',
      count: meetings.length,
      meetings,
    }),
  })

  return files
}

export async function POST(request: Request) {
  const cookieHeader = request.headers.get('cookie') || ''
  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('meetings-auth='))
    ?.split('=')
    .slice(1)
    .join('=')

  const authSecret = process.env.AUTH_SECRET || 'authenticated'
  if (!authCookie || authCookie !== authSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let cacheData: unknown
  try {
    const cacheRes = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: 'cache-backups/latest.json' })
    )
    const cacheStr = await cacheRes.Body?.transformToString()
    if (!cacheStr) throw new Error('Empty cache body')
    cacheData = JSON.parse(cacheStr)
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: 'Cache backup not found in S3' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Cache backup not found in S3' }, { status: 404 })
  }

  let meetings: RawMeeting[]
  let transcriptIndex: TranscriptIndex
  try {
    ;({ meetings, transcriptIndex } = parseCache(cacheData))
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json(
      { error: 'Invalid cache format', details: (err as any)?.message },
      { status: 400 }
    )
  }

  let tokenFile: GranolaTokenFile
  try {
    const tokenRes = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: 'cache-backups/granola-token.json' })
    )
    const tokenStr = await tokenRes.Body?.transformToString()
    if (!tokenStr) throw new Error('Empty token body')
    tokenFile = JSON.parse(tokenStr)
    // Soporte legacy: normalizar campo "token" → "access_token"
    if (!tokenFile.access_token && tokenFile.token) {
      tokenFile.access_token = tokenFile.token
    }
    if (!tokenFile.access_token) throw new Error('No access_token in token file')
  } catch {
    return NextResponse.json({ error: 'Granola token not found in S3' }, { status: 500 })
  }

  let summaryIndex: SummaryIndex
  try {
    summaryIndex = await fetchGranolaSummaries(tokenFile, s3Client, BUCKET)
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = (err as any)?.message
    console.error('[sync] Granola API failed:', details)
    return NextResponse.json(
      { error: 'Granola API request failed', details },
      { status: 502 }
    )
  }

  const formattedMeetings = meetings.map((m) => formatMeeting(m, transcriptIndex, summaryIndex))
  const s3Files = buildS3Files(formattedMeetings)
  const periodsUpdated = s3Files.filter((f) => f.key.endsWith('/meetings.json')).length

  try {
    await uploadToS3(s3Client, BUCKET, s3Files)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'S3 upload failed', details: (err as any)?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    meetingsCount: formattedMeetings.length,
    periodsUpdated,
  })
}
