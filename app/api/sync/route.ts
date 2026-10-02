import { NextResponse } from 'next/server'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  // Si hay keys explicitas (p.ej. en Vercel) usarlas; si no, caer al
  // default credential provider chain (perfil AWS local via AWS_PROFILE).
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
})

const BUCKET = process.env.GRANOLA_S3_BUCKET || 'grnl-meetings'
const PAGE = 100

// --------------------------------------------------------------------------
// Tipos
// --------------------------------------------------------------------------
interface RawDoc {
  id: string
  title?: string
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
  google_calendar_event?: { start?: { dateTime?: string } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  last_viewed_panel?: any
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

interface GranolaTokenFile {
  access_token: string
  refresh_token?: string
  client_id?: string
  uploaded_at?: string
  token?: string // legacy
}

interface S3File {
  key: string
  body: string
}

// --------------------------------------------------------------------------
// Token: refresh server-side (WorkOS)
// --------------------------------------------------------------------------
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
  return { access_token: data.access_token, refresh_token: data.refresh_token ?? refreshToken }
}

// Deriva client_id del JWT si no vino en el token file (claim "client_id").
function clientIdFromJwt(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))
    return json.client_id || null
  } catch {
    return null
  }
}

async function callGetDocuments(token: string, offset: number): Promise<Response> {
  return fetch('https://api.granola.ai/v2/get-documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Granola/5.354.0',
      'X-Client-Version': '5.354.0',
    },
    body: JSON.stringify({ limit: PAGE, offset, include_last_viewed_panel: true }),
  })
}

// Trae TODOS los documentos (paginado). Si el access_token expiro (401),
// refresca con refresh_token + client_id, persiste el nuevo token en S3 y
// reintenta. Devuelve los docs crudos.
async function fetchAllDocuments(tokenFile: GranolaTokenFile): Promise<RawDoc[]> {
  let accessToken = tokenFile.access_token ?? tokenFile.token ?? ''
  let refreshed = false

  const ensureFresh = async (resp: Response): Promise<Response> => {
    if (resp.status !== 401 || refreshed) return resp
    const clientId = tokenFile.client_id || clientIdFromJwt(accessToken)
    if (!tokenFile.refresh_token || !clientId) return resp
    console.log('[sync] access_token 401 -> refrescando (WorkOS)...')
    const nt = await refreshGranolaToken(tokenFile.refresh_token, clientId)
    accessToken = nt.access_token
    refreshed = true
    // Persistir token rotado en S3 (rotation de un solo uso)
    const updated: GranolaTokenFile = {
      access_token: nt.access_token,
      refresh_token: nt.refresh_token,
      client_id: clientId,
      uploaded_at: new Date().toISOString(),
    }
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: 'cache-backups/granola-token.json',
        Body: JSON.stringify(updated),
        ContentType: 'application/json',
      })
    )
    console.log('[sync] token refrescado y guardado en S3')
    return callGetDocuments(accessToken, 0)
  }

  const docs: RawDoc[] = []
  let offset = 0
  // primera pagina (con posible refresh)
  let resp = await ensureFresh(await callGetDocuments(accessToken, 0))
  while (true) {
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      throw new Error(`get-documents ${resp.status}: ${body.slice(0, 200)}`)
    }
    const data = await resp.json()
    const page: RawDoc[] = data?.docs ?? data?.documents ?? []
    if (page.length === 0) break
    docs.push(...page)
    if (page.length < PAGE) break
    offset += PAGE
    resp = await callGetDocuments(accessToken, offset)
  }
  return docs
}

// --------------------------------------------------------------------------
// Formateo
// --------------------------------------------------------------------------
// Granola usa varios nombres de template para el panel de resumen
// ("Summary", "Summary Rewrite", "Enhanced", custom...). No se filtra por
// titulo: se acepta cualquier panel con contenido AI.
function summaryFromPanel(doc: RawDoc) {
  const panel = doc.last_viewed_panel
  if (!panel) return null
  const html: string | null = panel.original_content || panel.content || null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bullets: string[] = (panel.generated_lines || []).map((l: any) => l.text || '')
  if (!html && bullets.length === 0) return null
  return { html, bullets, text: bullets.join('\n') }
}

function formatMeeting(doc: RawDoc): FormattedMeeting {
  const attendees: Array<{ name: string; email: string }> = []
  if (doc.people?.creator) attendees.push(doc.people.creator)
  if (doc.people?.attendees) attendees.push(...doc.people.attendees)
  const date =
    doc.created_at ||
    doc.google_calendar_event?.start?.dateTime ||
    new Date().toISOString()
  return {
    id: doc.id,
    title: doc.title || '(sin titulo)',
    date,
    updated_at: doc.updated_at,
    status: doc.status,
    attendees,
    notes_markdown: doc.notes_markdown || '',
    notes_plain: doc.notes_plain || '',
    summary: summaryFromPanel(doc),
    transcript: [], // la API no trae transcript; se preserva el de S3 via merge
    chapters: doc.chapters || [],
    workspace_id: doc.workspace_id,
  }
}

function validDoc(doc: RawDoc): boolean {
  if (!doc?.id || !doc?.title) return false
  if (doc.deleted_at) return false
  if (doc.was_trashed === true) return false
  return true
}

function partitionByPeriod(meetings: FormattedMeeting[]): Record<string, FormattedMeeting[]> {
  const result: Record<string, FormattedMeeting[]> = {}
  for (const m of meetings) {
    const period = new Date(m.date).toISOString().slice(0, 7)
    ;(result[period] ||= []).push(m)
  }
  return result
}

// --------------------------------------------------------------------------
// Merge no destructivo (S3 nunca degrada lo guardado)
// --------------------------------------------------------------------------
function mergeMeetings(
  incoming: FormattedMeeting[],
  existing: FormattedMeeting[]
): FormattedMeeting[] {
  const byId = new Map(existing.map((m) => [m.id, m]))
  // union: arrancar con lo existente, luego aplicar lo entrante
  const out = new Map(existing.map((m) => [m.id, m]))
  for (const newM of incoming) {
    const oldM = byId.get(newM.id)
    if (!oldM) {
      out.set(newM.id, newM)
      continue
    }
    const transcript =
      (newM.transcript?.length ?? 0) >= (oldM.transcript?.length ?? 0)
        ? newM.transcript
        : oldM.transcript
    const newBullets = newM.summary?.bullets?.length ?? 0
    const oldBullets = oldM.summary?.bullets?.length ?? 0
    const summary = newBullets >= oldBullets ? (newM.summary ?? oldM.summary) : oldM.summary
    const notes_markdown =
      (newM.notes_markdown?.length ?? 0) >= (oldM.notes_markdown?.length ?? 0)
        ? newM.notes_markdown
        : oldM.notes_markdown
    const notes_plain =
      (newM.notes_plain?.length ?? 0) >= (oldM.notes_plain?.length ?? 0)
        ? newM.notes_plain
        : oldM.notes_plain
    out.set(newM.id, { ...newM, transcript, summary, notes_markdown, notes_plain })
  }
  return Array.from(out.values())
}

async function s3GetMeetings(key: string): Promise<FormattedMeeting[]> {
  try {
    const r = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    const str = await r.Body?.transformToString()
    if (!str) return []
    return JSON.parse(str).meetings ?? []
  } catch {
    return []
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

  for (const [period, pm] of Object.entries(partitioned)) {
    const sorted = [...pm].sort((a, b) => (a.date < b.date ? -1 : 1))
    files.push({
      key: `${period}/meetings.json`,
      body: JSON.stringify({ period, exported_at: now, count: pm.length, meetings: pm }),
    })
    periodMeta.push({
      period,
      count: pm.length,
      file: `meetings-${period}.json`,
      s3_key: `${period}/meetings.json`,
      first_meeting: sorted[0].date,
      last_meeting: sorted[sorted.length - 1].date,
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
    body: JSON.stringify({ exported_at: now, version: '1.0', count: meetings.length, meetings }),
  })
  return files
}

async function uploadToS3(files: S3File[]): Promise<void> {
  for (const file of files) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: file.key,
        Body: file.body,
        ContentType: 'application/json',
      })
    )
  }
}

// --------------------------------------------------------------------------
// Handler
// --------------------------------------------------------------------------
export async function POST(request: Request) {
  // Auth
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

  // 1. Token desde S3
  let tokenFile: GranolaTokenFile
  try {
    const r = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: 'cache-backups/granola-token.json' })
    )
    const str = await r.Body?.transformToString()
    if (!str) throw new Error('Empty token body')
    tokenFile = JSON.parse(str)
    if (!tokenFile.access_token && tokenFile.token) tokenFile.access_token = tokenFile.token
    if (!tokenFile.access_token) throw new Error('No access_token in token file')
  } catch {
    return NextResponse.json(
      { error: 'Granola token not found in S3. Corre el sync local al menos una vez.' },
      { status: 500 }
    )
  }

  // 2. Traer meetings de la API (con refresh server-side)
  let docs: RawDoc[]
  try {
    docs = await fetchAllDocuments(tokenFile)
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = (err as any)?.message
    console.error('[sync] Granola API failed:', details)
    return NextResponse.json({ error: 'Granola API request failed', details }, { status: 502 })
  }

  const incoming = docs.filter(validDoc).map(formatMeeting)

  // 3. Merge no destructivo contra lo que ya hay en S3, por periodo
  const incomingByPeriod = partitionByPeriod(incoming)
  const mergedAll: FormattedMeeting[] = []
  for (const [period, pm] of Object.entries(incomingByPeriod)) {
    const existing = await s3GetMeetings(`${period}/meetings.json`)
    mergedAll.push(...mergeMeetings(pm, existing))
  }
  // periodos que existen en S3 pero no vinieron en esta corrida: preservarlos
  // (no hace falta reescribirlos; quedan intactos. El index se regenera solo con
  //  los periodos que tenemos; para no perder periodos viejos del index, los
  //  reincorporamos leyendo el index previo.)
  try {
    const idxR = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'index.json' }))
    const idxStr = await idxR.Body?.transformToString()
    if (idxStr) {
      const prevIdx = JSON.parse(idxStr)
      const touched = new Set(Object.keys(incomingByPeriod))
      for (const p of prevIdx.periods ?? []) {
        if (!touched.has(p.period)) {
          const old = await s3GetMeetings(p.s3_key)
          mergedAll.push(...old)
        }
      }
    }
  } catch {
    // sin index previo: seguimos solo con lo entrante
  }

  // 4. Backup del index + subir todo
  try {
    const curIdx = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'index.json' }))
      .then((r) => r.Body?.transformToString())
      .catch(() => null)
    if (curIdx) {
      const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: `backups/index-${ts}.json`,
          Body: curIdx,
          ContentType: 'application/json',
        })
      )
    }
    await uploadToS3(buildS3Files(mergedAll))
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ error: 'S3 upload failed', details: (err as any)?.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    meetingsCount: mergedAll.length,
    fetched: incoming.length,
  })
}
