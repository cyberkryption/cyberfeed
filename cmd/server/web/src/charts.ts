export interface ChartDef {
  id: string
  label: string
  section: 'Watchlist' | 'CVE' | 'General'
}

export const ALL_CHARTS: ChartDef[] = [
  { id: 'watchlist-hits',  label: 'Watchlist Hits',    section: 'Watchlist' },
  { id: 'cve-daily',       label: 'CVE Daily Volume',    section: 'CVE' },
  { id: 'cvss-dist',       label: 'CVSS Distribution',   section: 'CVE' },
  { id: 'articles-source', label: 'Articles per Source', section: 'General' },
  { id: 'cve-categories',  label: 'Tag Cloud',           section: 'General' },
  { id: 'articles-14d',    label: 'Articles (14 days)',  section: 'General' },
  { id: 'source-health',   label: 'Source Health',       section: 'General' },
]
