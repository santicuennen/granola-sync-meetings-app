'use client'

import { useState, useEffect } from 'react'
import { Search, Calendar, User, Clock } from 'lucide-react'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'

interface Meeting {
  id: string
  title: string
  date: string
  attendees: string[]
  summary: string
  tags: string[]
}

export default function MeetingsVault() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [search, setSearch] = useState('')
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMeetings()
  }, [])

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings')
      const data = await res.json()
      setMeetings(data)
    } catch (error) {
      console.error('Error fetching meetings:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredMeetings = meetings.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.summary.toLowerCase().includes(search.toLowerCase()) ||
    m.attendees.some(a => a.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Meetings Vault</h1>
          <p className="text-sm text-gray-600">Your Granola meetings, organized</p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search meetings, attendees, topics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Meetings List */}
          <div className="lg:col-span-1 space-y-3">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading meetings...</div>
            ) : filteredMeetings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No meetings found</div>
            ) : (
              filteredMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => setSelectedMeeting(meeting)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedMeeting?.id === meeting.id
                      ? 'bg-blue-50 border-blue-500'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <h3 className="font-semibold text-gray-900 mb-2">{meeting.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <Calendar className="w-4 h-4" />
                    <span>{format(new Date(meeting.date), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {meeting.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Meeting Detail */}
          <div className="lg:col-span-2">
            {selectedMeeting ? (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  {selectedMeeting.title}
                </h2>

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
                    <ReactMarkdown>{selectedMeeting.summary}</ReactMarkdown>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedMeeting.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => window.open(`/api/meetings/${selectedMeeting.id}/transcript`, '_blank')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    View Full Transcript
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Select a meeting to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
