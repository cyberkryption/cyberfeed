import { useState } from 'react'

const STORAGE_KEY = 'cyberfeed.watchlist'
export const MAX_KEYWORDS = 10

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : []
  } catch {
    return []
  }
}

function save(keywords: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keywords))
}

export function useWatchlist() {
  const [keywords, setKeywords] = useState<string[]>(load)

  const addKeyword = (raw: string): string | null => {
    const kw = raw.trim()
    if (!kw) return 'Keyword cannot be empty.'
    if (keywords.length >= MAX_KEYWORDS) return `Maximum of ${MAX_KEYWORDS} keywords reached.`
    if (keywords.some((k) => k.toLowerCase() === kw.toLowerCase())) return 'Already in watchlist.'
    const next = [...keywords, kw]
    save(next)
    setKeywords(next)
    return null
  }

  const removeKeyword = (kw: string) => {
    const next = keywords.filter((k) => k !== kw)
    save(next)
    setKeywords(next)
  }

  return { keywords, addKeyword, removeKeyword }
}
