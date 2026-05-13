export interface ChartDef {
  id: string
  label: string
  section: 'CVE' | 'General'
}

export const ALL_CHARTS: ChartDef[] = [
  { id: 'cve-daily',       label: 'CVE Daily Volume',    section: 'CVE' },
  { id: 'cvss-dist',       label: 'CVSS Distribution',   section: 'CVE' },
  { id: 'cve-categories',  label: 'Top Affected Products', section: 'CVE' },
  { id: 'articles-source', label: 'Articles per Source', section: 'General' },
  { id: 'articles-14d',    label: 'Articles (14 days)',  section: 'General' },
  { id: 'source-health',   label: 'Source Health',       section: 'General' },
]
