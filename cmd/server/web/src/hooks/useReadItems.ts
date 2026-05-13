import { useState, useCallback } from 'react'

const STORAGE_KEY = 'cyberfeed:read-items'

function loadFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // ignore malformed storage
  }
  return new Set()
}

function saveToStorage(items: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...items]))
  } catch {
    // ignore quota errors
  }
}

export function useReadItems() {
  const [readItems, setReadItems] = useState<Set<string>>(loadFromStorage)

  const markRead = useCallback((link: string) => {
    if (!link) return
    setReadItems((prev) => {
      if (prev.has(link)) return prev
      const next = new Set(prev)
      next.add(link)
      saveToStorage(next)
      return next
    })
  }, [])

  const markUnread = useCallback((link: string) => {
    setReadItems((prev) => {
      if (!prev.has(link)) return prev
      const next = new Set(prev)
      next.delete(link)
      saveToStorage(next)
      return next
    })
  }, [])

  const toggleRead = useCallback((link: string) => {
    setReadItems((prev) => {
      const next = new Set(prev)
      if (next.has(link)) next.delete(link)
      else next.add(link)
      saveToStorage(next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setReadItems(new Set())
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  return { readItems, markRead, markUnread, toggleRead, clearAll }
}
