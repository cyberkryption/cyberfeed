export interface FeedConfig {
  name: string
  url: string
  enabled: boolean
  parser: string   // "auto" | "xml" | "csv" | "json"
  category: string // "auto" | "news" | "threat_intel"
  refreshInterval: number // minutes; 0 = global default
}

export interface FeedItem {
  source: string
  sourceUrl: string
  title: string
  link: string
  description: string
  published: string
  author: string
  categories: string[]
}

export interface FeedStatus {
  name: string
  url: string
  itemCount: number
  lastFetch: string
  error?: string
  ok: boolean
  category?: string // "auto" | "news" | "threat_intel"
  parser?: string   // "auto" | "xml" | "csv" | "json"
  consecutiveFailures?: number
}

export interface FeedsSnapshot {
  items: FeedItem[]
  sources: FeedStatus[]
  updatedAt: string
}

/** Returns url only when its scheme is http or https; otherwise undefined.
 *  Prevents javascript: and data: URIs from being set as href attributes. */
export function safeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  const lower = url.toLowerCase()
  if (lower.startsWith('http://') || lower.startsWith('https://')) return url
  return undefined
}
