import { useState, useEffect, useCallback, useRef } from 'react'
import type { FeedsSnapshot } from '../types'

const POLL_INTERVAL_MS = 60_000 // re-fetch every 60s

interface UseFeedsResult {
  data: FeedsSnapshot | null
  loading: boolean
  error: string | null
  refresh: () => void
  lastRefreshed: Date | null
}

export function useFeeds(): UseFeedsResult {
  const [data, setData] = useState<FeedsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (triggerServerRefresh = false) => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      // POST /api/admin/refresh re-fetches all feeds server-side and returns the
      // updated snapshot. GET /api/feeds just reads the cached snapshot.
      const url = triggerServerRefresh ? '/api/admin/refresh' : '/api/feeds'
      const method = triggerServerRefresh ? 'POST' : 'GET'
      const resp = await fetch(url, { method, signal: controller.signal, credentials: 'same-origin' })
      if (resp.status === 401) throw new Error('HTTP 401')
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json: FeedsSnapshot = await resp.json()
      setData(json)
      setLastRefreshed(new Date())
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, POLL_INTERVAL_MS)
    return () => {
      clearInterval(id)
      abortRef.current?.abort()
    }
  }, [fetchData])

  // refresh() triggers a real server-side re-fetch of all feeds.
  // Background polls use the cached GET endpoint to avoid hammering sources.
  return { data, loading, error, refresh: () => fetchData(true), lastRefreshed }
}
