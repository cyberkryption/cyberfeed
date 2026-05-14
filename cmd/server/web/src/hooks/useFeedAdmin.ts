import { useState, useCallback } from 'react'
import type { FeedConfig } from '../types'

export function useFeedAdmin() {
  const [feeds, setFeeds] = useState<FeedConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/feeds')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setFeeds(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const addFeed = useCallback(async (name: string, url: string, parser: string, category: string) => {
    const res = await fetch('/api/admin/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, parser, category }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }
    await load()
  }, [load])

  const deleteFeed = useCallback(async (name: string) => {
    const res = await fetch(`/api/admin/feeds/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await load()
  }, [load])

  const toggleFeed = useCallback(async (name: string, enabled: boolean) => {
    const res = await fetch(`/api/admin/feeds/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await load()
  }, [load])

  return { feeds, loading, error, load, addFeed, deleteFeed, toggleFeed }
}
