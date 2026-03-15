'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AddToCalendarButton } from '@/components/AddToCalendarButton'

interface Campaign {
  id: string
  title: string
  description: string | null
  address: string
  location: string
  date: string
  start_time: string
  end_time: string
}

interface InviteData {
  invitation: { id: string; status: string; email: string }
  campaign: Campaign
  google_calendar_url: string
}

type RsvpState = 'idle' | 'accepted' | 'declined' | 'loading' | 'error' | 'expired'

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function apiFetch(path: string, token: string, method = 'GET') {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rsvpState, setRsvpState] = useState<RsvpState>('idle')
  const [rsvpError, setRsvpError] = useState<string | null>(null)
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const authToken = await getAuthToken()
      if (!authToken) {
        router.replace(`/auth/signin?redirect=/invite/${token}`)
        return
      }

      try {
        const data = await apiFetch(`/invitations/${token}`, authToken)
        setInviteData(data.data)

        if (data.data.invitation.status === 'accepted') {
          setRsvpState('accepted')
          setCalendarUrl(data.data.google_calendar_url)
        } else if (data.data.invitation.status === 'expired') {
          setRsvpState('expired')
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load invitation')
      }
    }

    if (token) load()
  }, [token, router])

  async function handleRsvp(action: 'accept' | 'decline') {
    setRsvpState('loading')
    setRsvpError(null)

    const authToken = await getAuthToken()
    if (!authToken) {
      router.replace(`/auth/signin?redirect=/invite/${token}`)
      return
    }

    try {
      const data = await apiFetch(`/invitations/${token}/${action}`, authToken, 'POST')
      if (action === 'accept') {
        setRsvpState('accepted')
        setCalendarUrl(data.data?.google_calendar_url ?? inviteData?.google_calendar_url ?? null)
      } else {
        setRsvpState('declined')
      }
    } catch (err) {
      setRsvpState('error')
      setRsvpError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (loadError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow p-8 text-center">
          <p className="text-red-600 font-medium">{loadError}</p>
        </div>
      </main>
    )
  }

  if (!inviteData) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading invitation…</p>
      </main>
    )
  }

  const { campaign, google_calendar_url } = inviteData

  if (rsvpState === 'expired') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow p-8 text-center">
          <p className="text-gray-600">This invitation has expired.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-green-500 px-8 py-6">
          <p className="text-green-100 text-sm font-medium uppercase tracking-wide">
            Volunteer Invitation
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">{campaign.title}</h1>
        </div>

        <div className="px-8 py-6 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-gray-400 mt-0.5">📅</span>
            <div>
              <p className="font-medium text-gray-800">{formatDate(campaign.date)}</p>
              <p className="text-sm text-gray-500">
                {formatTime(campaign.start_time)} – {formatTime(campaign.end_time)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-gray-400 mt-0.5">📍</span>
            <div>
              <p className="font-medium text-gray-800">{campaign.location}</p>
              <p className="text-sm text-gray-500">{campaign.address}</p>
            </div>
          </div>

          {campaign.description && (
            <p className="text-gray-600 text-sm leading-relaxed pt-2">{campaign.description}</p>
          )}
        </div>

        <div className="px-8 pb-8">
          {rsvpState === 'accepted' && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-5 space-y-3">
              <p className="font-semibold text-green-700">You're going! A confirmation email has been sent.</p>
              {calendarUrl && <AddToCalendarButton url={calendarUrl} />}
            </div>
          )}

          {rsvpState === 'declined' && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
              <p className="text-gray-600">You've declined this invitation.</p>
            </div>
          )}

          {(rsvpState === 'idle' || rsvpState === 'loading' || rsvpState === 'error') && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Will you attend?</p>

              <div className="flex gap-3">
                <button
                  onClick={() => handleRsvp('accept')}
                  disabled={rsvpState === 'loading'}
                  className="flex-1 rounded-lg bg-green-500 px-4 py-3 text-white font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  {rsvpState === 'loading' ? 'Saving…' : "Yes, I'm going"}
                </button>
                <button
                  onClick={() => handleRsvp('decline')}
                  disabled={rsvpState === 'loading'}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  No, can't make it
                </button>
              </div>

              {rsvpState === 'error' && rsvpError && (
                <p className="text-sm text-red-600">{rsvpError}</p>
              )}

              <div className="pt-2">
                <AddToCalendarButton url={google_calendar_url} className="w-full justify-center" />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
