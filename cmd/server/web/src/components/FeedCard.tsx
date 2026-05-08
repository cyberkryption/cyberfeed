import {
  Box, Text, Badge, Group, Anchor, Stack,
  useComputedColorScheme
} from '@mantine/core'
import { IconExternalLink, IconCalendar, IconUser, IconTag } from '@tabler/icons-react'
import type { FeedItem } from '../types'

interface FeedCardProps {
  item: FeedItem
  searchQuery: string
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: 'rgba(0,212,124,0.3)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : part
  )
}

export function FeedCard({ item, searchQuery }: FeedCardProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'

  const fmtDate = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const isRecent = (iso: string) => {
    if (!iso) return false
    const d = new Date(iso)
    return Date.now() - d.getTime() < 86_400_000 // 24h
  }

  return (
    <Box
      p="md"
      style={{
        borderRadius: 6,
        border: isDark
          ? '1px solid rgba(0,212,124,0.1)'
          : '1px solid rgba(0,120,70,0.1)',
        background: isDark
          ? 'rgba(25, 27, 30, 0.8)'
          : 'rgba(255,255,255,0.9)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = isDark ? 'rgba(0,212,124,0.35)' : 'rgba(0,120,70,0.3)'
        el.style.boxShadow = isDark
          ? '0 0 20px rgba(0,212,124,0.06)'
          : '0 2px 16px rgba(0,120,70,0.08)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.1)'
        el.style.boxShadow = 'none'
      }}
    >
      {/* Left accent bar */}
      <Box
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: 3,
          background: isRecent(item.published)
            ? 'linear-gradient(180deg, #00d47c, #00a85f)'
            : isDark ? 'rgba(0,212,124,0.2)' : 'rgba(0,120,70,0.15)',
        }}
      />

      <Stack gap="xs" pl="xs">
        {/* Source + date row */}
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs" align="center">
            <Badge
              size="xs"
              variant="filled"
              color="brand"
              radius="sm"
              ff="monospace"
              style={{ letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 9 }}
            >
              {item.source}
            </Badge>
            {isRecent(item.published) && (
              <Badge size="xs" variant="light" color="green" radius="sm" ff="monospace"
                style={{ fontSize: 9, letterSpacing: '0.06em' }}>
                NEW
              </Badge>
            )}
          </Group>
          {item.published && (
            <Group gap={4} align="center" style={{ flexShrink: 0 }}>
              <IconCalendar size={11} style={{ opacity: 0.5 }} />
              <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: 11 }}>
                {fmtDate(item.published)}
              </Text>
            </Group>
          )}
        </Group>

        {/* Title */}
        <Anchor
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          underline="never"
          style={{
            color: isDark ? '#e8e8e8' : '#1a1b1e',
            fontWeight: 600,
            lineHeight: 1.35,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
          }}
        >
          <span style={{ flex: 1 }}>{highlight(item.title, searchQuery)}</span>
          <IconExternalLink size={14} style={{ opacity: 0.4, marginTop: 2, flexShrink: 0 }} />
        </Anchor>

        {/* Description */}
        {item.description && (
          <Text size="sm" c="dimmed" style={{ lineHeight: 1.55, fontSize: '0.82rem' }}>
            {highlight(item.description, searchQuery)}
          </Text>
        )}

        {/* Footer row */}
        <Group justify="space-between" align="center" mt={2}>
          <Group gap="xs">
            {item.author && (
              <Group gap={4} align="center">
                <IconUser size={11} style={{ opacity: 0.4 }} />
                <Text size="xs" c="dimmed" style={{ fontSize: 11 }}>{item.author}</Text>
              </Group>
            )}
          </Group>
          {item.categories?.length > 0 && (
            <Group gap={4} align="center">
              <IconTag size={11} style={{ opacity: 0.4 }} />
              {item.categories.slice(0, 3).map((cat) => (
                <Badge
                  key={cat}
                  size="xs"
                  variant="outline"
                  color="gray"
                  radius="sm"
                  style={{ fontSize: 10 }}
                >
                  {cat}
                </Badge>
              ))}
            </Group>
          )}
        </Group>
      </Stack>
    </Box>
  )
}
