import { useEffect, useRef, useState } from 'react'
import type { FeedsSnapshot, FeedItem } from '../types'

export interface WatchlistAlert {
  id: string        // unique per alert instance
  keyword: string
  item: FeedItem
}

function matchesKeyword(item: FeedItem, keyword: string): boolean {
  const kw = keyword.toLowerCase()
  return (
    (item.title       ?? '').toLowerCase().includes(kw) ||
    (item.description ?? '').toLowerCase().includes(kw) ||
    (item.source      ?? '').toLowerCase().includes(kw) ||
    (item.author      ?? '').toLowerCase().includes(kw) ||
    (item.categories  ?? []).some((c) => c.toLowerCase().includes(kw))
  )
}

export function useWatchlistAlerts(data: FeedsSnapshot | null, keywords: string[]) {
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([])

  // Track item links seen in previous snapshots so we only alert on genuinely new items.
  const seenLinks = useRef<Set<string>>(new Set())
  // Skip alerting on the very first data load — seed seenLinks silently.
  const isFirstLoad = useRef(true)
  const prevUpdatedAt = useRef<string | null>(null)

  useEffect(() => {
    if (!data || keywords.length === 0) return
    // No new refresh yet
    if (data.updatedAt === prevUpdatedAt.current) return
    prevUpdatedAt.current = data.updatedAt

    const newItems = data.items.filter((item) => {
      const key = item.link || item.title
      return key && !seenLinks.current.has(key)
    })

    // Always bring seenLinks up to date
    for (const item of data.items) {
      const key = item.link || item.title
      if (key) seenLinks.current.add(key)
    }

    if (isFirstLoad.current) {
      isFirstLoad.current = false
      return
    }

    if (newItems.length === 0) return

    const fresh: WatchlistAlert[] = []
    for (const item of newItems) {
      for (const keyword of keywords) {
        if (matchesKeyword(item, keyword)) {
          fresh.push({
            id: `${keyword}|${item.link || item.title}|${Date.now()}`,
            keyword,
            item,
          })
          break // one alert per item, first matching keyword wins
        }
      }
    }

    if (fresh.length > 0) {
      setAlerts((prev) => [...fresh, ...prev])
    }
  }, [data, keywords])

  const dismissAlert = (id: string) =>
    setAlerts((prev) => prev.filter((a) => a.id !== id))

  const dismissAll = () => setAlerts([])

  return { alerts, dismissAlert, dismissAll }
}
