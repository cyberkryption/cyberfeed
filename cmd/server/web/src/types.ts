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
}

export interface FeedsSnapshot {
  items: FeedItem[]
  sources: FeedStatus[]
  updatedAt: string
}
