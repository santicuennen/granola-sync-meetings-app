'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Calendar, User, Clock, Plus, FolderOpen, Check, X, Pencil, Trash2, Tag } from 'lucide-react'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'

interface Meeting {
  id: string
  title: string
  date: string
  attendees: string[]
  summary: string
  summaryHtml?: string | null
  tags: string[]
}

interface Workspace {
  name: string
  color: string
}

interface WorkspacesData {
  workspaces: Record<string, Workspace>
  assignments: Record<string, string>
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

export default function MeetingsVault() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [search, setSearch] = useState('')
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')

  // Workspaces state
  const [wsData, setWsData] = useState<WorkspacesData>({ workspaces: {}, assignments: {} })
  const [activeFilter, setActiveFilter] = useState<string | null>(null) // null = all, 'unassigned', or workspace id
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showNewWs, setShowNewWs] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [newWsColor, setNewWsColor] = useState(COLORS[0])
  const [editingWs, setEditingWs] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings')
      const data = await res.json()
      setMeetings(data)
    } catch (error) {
      console.error('Error fetching meetings:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces')
      if (res.ok) {
        const data = await res.json()
        setWsData(data)
      }
    } catch (error) {
      console.error('Error fetching workspaces:', error)
    }
  }, [])

  useEffect(() => {
    fetchMeetings()
    fetchWorkspaces()
  }, [fetchMeetings, fetchWorkspaces])

  const handleSync = async () => {
    setSyncState('loading')
    setSyncMessage('')
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncState('error')
        setSyncMessage(data.error || 'Error al sincronizar')
      } else {
        setSyncState('success')
        setSyncMessage(`✓ ${data.meetingsCount} meetings`)
        fetchMeetings()
        setTimeout(() => setSyncState('idle'), 3000)
      }
    } catch {
      setSyncState('error')
      setSyncMessage('Error de conexión')
    }
  }

  const wsAction = async (action: string, params: Record<string, unknown>) => {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
    })
    if (res.ok) {
      const data = await res.json()
      setWsData(data)
    }
    return res.ok
  }

  const createWorkspace = async () => {
    if (!newWsName.trim()) return
    const id = `ws-${Date.now()}`
    await wsAction('create_workspace', { id, name: newWsName.trim(), color: newWsColor })
    setNewWsName('')
    setNewWsColor(COLORS[0])
    setShowNewWs(false)
  }

  const renameWorkspace = async (id: string) => {
    if (!editName.trim()) return
    await wsAction('rename_workspace', { id, name: editName.trim() })
    setEditingWs(null)
  }

  const deleteWorkspace = async (id: string) => {
    if (!confirm('¿Eliminar este workspace?')) return
    await wsAction('delete_workspace', { id })
    if (activeFilter === id) setActiveFilter(null)
  }

  const assignSelected = async (workspaceId: string) => {
    await wsAction('assign', { meetingIds: Array.from(selectedIds), workspaceId })
    setSelectedIds(new Set())
    setShowAssignMenu(false)
  }

  const unassignSelected = async () => {
    await wsAction('unassign', { meetingIds: Array.from(selectedIds) })
    setSelectedIds(new Set())
    setShowAssignMenu(false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filteredMeetings.map((m) => m.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const toggleEditMode = () => {
    if (editMode) {
      setSelectedIds(new Set())
    }
    setEditMode(!editMode)
  }

  // Filtered meetings
  const filteredMeetings = meetings
    .filter((m) => {
      const matchesSearch =
        m.title.toLowerCase().includes(search.toLowerCase()) ||
        m.summary.toLowerCase().includes(search.toLowerCase()) ||
        m.attendees.some((a) => a.toLowerCase().includes(search.toLowerCase()))
      if (!matchesSearch) return false
      if (activeFilter === null) return true
      if (activeFilter === 'unassigned') return !wsData.assignments[m.id]
      return wsData.assignments[m.id] === activeFilter
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const wsCount = (wsId: string) =>
    Object.values(wsData.assignments).filter((v) => v === wsId).length

  const unassignedCount = meetings.filter((m) => !wsData.assignments[m.id]).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meetings Vault</h1>
            <p className="text-sm text-gray-600">Your Granola meetings, organized</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Edit mode toggle */}
            <button
              onClick={toggleEditMode}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                editMode ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Pencil className="w-4 h-4" />
              {editMode ? 'Listo' : 'Editar'}
            </button>
            {editMode && selectedIds.size > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowAssignMenu(!showAssignMenu)}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                >
                  <Tag className="w-4 h-4" />
                  Asignar {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
                </button>
                {showAssignMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] py-1">
                    {Object.entries(wsData.workspaces).map(([id, ws]) => (
                      <button
                        key={id}
                        onClick={() => assignSelected(id)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ws.color }} />
                        {ws.name}
                      </button>
                    ))}
                    {Object.keys(wsData.workspaces).length > 0 && <hr className="my-1" />}
                    <button
                      onClick={unassignSelected}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm text-gray-500"
                    >
                      Sin workspace
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={syncState === 'error' ? () => setSyncState('idle') : handleSync}
              disabled={syncState === 'loading'}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                syncState === 'loading' ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : syncState === 'success' ? 'bg-green-100 text-green-700'
                : syncState === 'error' ? 'bg-red-100 text-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {syncState === 'loading' && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {syncState === 'loading' ? 'Sincronizando...' : syncState === 'success' ? syncMessage : syncState === 'error' ? syncMessage : 'Sync'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar: Workspaces */}
        <div className="w-56 flex-shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">Workspaces</span>
              <button onClick={() => setShowNewWs(true)} className="text-gray-400 hover:text-blue-600">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* All */}
            <button
              onClick={() => setActiveFilter(null)}
              className={`w-full text-left px-2 py-1.5 rounded text-sm mb-1 ${activeFilter === null ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Todos ({meetings.length})
            </button>

            {/* Unassigned */}
            <button
              onClick={() => setActiveFilter('unassigned')}
              className={`w-full text-left px-2 py-1.5 rounded text-sm mb-2 ${activeFilter === 'unassigned' ? 'bg-gray-200 text-gray-800 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Sin clasificar ({unassignedCount})
            </button>

            <hr className="mb-2" />

            {/* Workspace list */}
            {Object.entries(wsData.workspaces).map(([id, ws]) => (
              <div key={id} className="group flex items-center gap-1 mb-1">
                {editingWs === id ? (
                  <div className="flex-1 flex items-center gap-1">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && renameWorkspace(id)}
                      className="flex-1 text-sm border rounded px-1 py-0.5"
                      autoFocus
                    />
                    <button onClick={() => renameWorkspace(id)} className="text-green-600"><Check className="w-3 h-3" /></button>
                    <button onClick={() => setEditingWs(null)} className="text-gray-400"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveFilter(id)}
                      className={`flex-1 text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 ${activeFilter === id ? 'font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                      style={activeFilter === id ? { backgroundColor: ws.color + '20', color: ws.color } : {}}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ws.color }} />
                      <span className="truncate">{ws.name}</span>
                      <span className="ml-auto text-xs opacity-60">{wsCount(id)}</span>
                    </button>
                    <button onClick={() => { setEditingWs(id); setEditName(ws.name) }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteWorkspace(id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            ))}

            {/* New workspace form */}
            {showNewWs && (
              <div className="mt-2 p-2 border border-blue-200 rounded-lg bg-blue-50">
                <input
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
                  placeholder="Nombre..."
                  className="w-full text-sm border rounded px-2 py-1 mb-2"
                  autoFocus
                />
                <div className="flex gap-1 mb-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewWsColor(c)}
                      className={`w-5 h-5 rounded-full border-2 ${newWsColor === c ? 'border-gray-800' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  <button onClick={createWorkspace} className="flex-1 text-xs bg-blue-600 text-white rounded py-1 hover:bg-blue-700">Crear</button>
                  <button onClick={() => setShowNewWs(false)} className="flex-1 text-xs bg-gray-200 text-gray-600 rounded py-1 hover:bg-gray-300">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Search + selection controls */}
          <div className="mb-4 flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar meetings, participantes, temas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {editMode && (
              selectedIds.size > 0 ? (
                <button onClick={clearSelection} className="text-sm text-gray-500 hover:text-gray-700">
                  Deseleccionar ({selectedIds.size})
                </button>
              ) : (
                <button onClick={selectAll} className="text-sm text-gray-500 hover:text-gray-700">
                  Seleccionar todos
                </button>
              )
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Meetings List */}
            <div className="lg:col-span-2 space-y-2 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto pr-1">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Cargando meetings...</div>
              ) : filteredMeetings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No se encontraron meetings</div>
              ) : (
                filteredMeetings.map((meeting) => {
                  const wsId = wsData.assignments[meeting.id]
                  const ws = wsId ? wsData.workspaces[wsId] : null
                  const isSelected = selectedIds.has(meeting.id)
                  return (
                    <div
                      key={meeting.id}
                      className={`relative p-3 rounded-lg border transition-all cursor-pointer ${
                        selectedMeeting?.id === meeting.id
                          ? 'bg-blue-50 border-blue-500'
                          : isSelected
                          ? 'bg-purple-50 border-purple-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {editMode && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(meeting.id)}
                            className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                        )}
                        <div className="flex-1 min-w-0" onClick={() => setSelectedMeeting(meeting)}>
                          <div className="flex items-center gap-2 mb-1">
                            {ws && (
                              <span
                                className="px-1.5 py-0.5 text-xs rounded font-medium"
                                style={{ backgroundColor: ws.color + '20', color: ws.color }}
                              >
                                {ws.name}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-gray-900 text-sm mb-1 truncate">{meeting.title}</h3>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            <span>{format(new Date(meeting.date), 'MMM d, yyyy')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Meeting Detail */}
            <div className="lg:col-span-3 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
              {selectedMeeting ? (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  {/* Workspace badge */}
                  {wsData.assignments[selectedMeeting.id] && wsData.workspaces[wsData.assignments[selectedMeeting.id]] && (
                    <div className="mb-3">
                      <span
                        className="px-2 py-1 text-xs rounded-full font-medium"
                        style={{
                          backgroundColor: wsData.workspaces[wsData.assignments[selectedMeeting.id]].color + '20',
                          color: wsData.workspaces[wsData.assignments[selectedMeeting.id]].color,
                        }}
                      >
                        {wsData.workspaces[wsData.assignments[selectedMeeting.id]].name}
                      </span>
                    </div>
                  )}

                  <h2 className="text-xl font-bold text-gray-900 mb-4">{selectedMeeting.title}</h2>

                  <div className="flex flex-wrap gap-4 mb-6 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{format(new Date(selectedMeeting.date), 'MMMM d, yyyy h:mm a')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>{selectedMeeting.attendees.join(', ')}</span>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Summary</h3>
                    <div className="prose prose-sm max-w-none text-gray-700">
                      {selectedMeeting.summaryHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: selectedMeeting.summaryHtml }} />
                      ) : (
                        <ReactMarkdown>{selectedMeeting.summary}</ReactMarkdown>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedMeeting.tags.map((tag) => (
                      <span key={tag} className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">{tag}</span>
                    ))}
                  </div>

                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <button
                      onClick={() => window.open(`/api/meetings/${selectedMeeting.id}/transcript`, '_blank')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Ver Transcripción
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                  <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Seleccioná un meeting para ver detalles</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close assign menu */}
      {showAssignMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowAssignMenu(false)} />
      )}
    </div>
  )
}
