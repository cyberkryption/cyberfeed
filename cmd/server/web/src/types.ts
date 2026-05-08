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
}

export interface FeedsSnapshot {
  items: FeedItem[]
  sources: FeedStatus[]
  updatedAt: string
}
