import { NextResponse } from 'next/server'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

export const dynamic = 'force-dynamic'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const BUCKET = process.env.GRANOLA_S3_BUCKET || 'grnl-meetings'
const KEY = 'workspaces.json'

interface Workspace {
  name: string
  color: string
}

interface WorkspacesData {
  workspaces: Record<string, Workspace>
  assignments: Record<string, string> // meetingId -> workspaceId
}

function emptyData(): WorkspacesData {
  return { workspaces: {}, assignments: {} }
}

async function readWorkspaces(): Promise<WorkspacesData> {
  try {
    const res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }))
    const str = await res.Body?.transformToString()
    if (!str) return emptyData()
    return JSON.parse(str) as WorkspacesData
  } catch {
    return emptyData()
  }
}

async function writeWorkspaces(data: WorkspacesData): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    })
  )
}

function checkAuth(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie') || ''
  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('meetings-auth='))
    ?.split('=')
    .slice(1)
    .join('=')
  const authSecret = process.env.AUTH_SECRET || 'authenticated'
  return !!authCookie && authCookie === authSecret
}

// GET: devuelve workspaces.json completo
export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const data = await readWorkspaces()
  return NextResponse.json(data)
}

// POST: acciones CRUD sobre workspaces
// body: { action, ...params }
export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action } = body
  const data = await readWorkspaces()

  switch (action) {
    case 'create_workspace': {
      const { id, name, color } = body
      if (!id || !name) return NextResponse.json({ error: 'id and name required' }, { status: 400 })
      data.workspaces[id] = { name, color: color || '#3B82F6' }
      break
    }
    case 'rename_workspace': {
      const { id, name } = body
      if (!id || !name || !data.workspaces[id]) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
      data.workspaces[id].name = name
      break
    }
    case 'update_color': {
      const { id, color } = body
      if (!id || !color || !data.workspaces[id]) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
      data.workspaces[id].color = color
      break
    }
    case 'delete_workspace': {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      delete data.workspaces[id]
      // Limpiar assignments que apuntan a este workspace
      for (const [meetingId, wsId] of Object.entries(data.assignments)) {
        if (wsId === id) delete data.assignments[meetingId]
      }
      break
    }
    case 'assign': {
      const { meetingIds, workspaceId } = body as { meetingIds: string[]; workspaceId: string }
      if (!meetingIds?.length || !workspaceId || !data.workspaces[workspaceId]) {
        return NextResponse.json({ error: 'meetingIds and valid workspaceId required' }, { status: 400 })
      }
      for (const mid of meetingIds) {
        data.assignments[mid] = workspaceId
      }
      break
    }
    case 'unassign': {
      const { meetingIds } = body as { meetingIds: string[] }
      if (!meetingIds?.length) return NextResponse.json({ error: 'meetingIds required' }, { status: 400 })
      for (const mid of meetingIds) {
        delete data.assignments[mid]
      }
      break
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  await writeWorkspaces(data)
  return NextResponse.json(data)
}
