import {
  Box, Text, Badge, Group, Anchor, Stack,
  useComputedColorScheme, Tooltip, ActionIcon
} from '@mantine/core'
import { IconExternalLink, IconCalendar, IconUser, IconTag, IconEye, IconEyeOff } from '@tabler/icons-react'
import type { FeedItem } from '../types'

interface FeedCardProps {
  item: FeedItem
  searchQuery: string
  isRead: boolean
  onToggleRead: () => void
  onMarkRead: () => void
}

function highlight(text: string | null | undefined, query: string): React.ReactNode {
  if (!text) return ''
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: 'rgba(0,212,124,0.3)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : part
  )
}

export function FeedCard({ item, searchQuery, isRead, onToggleRead, onMarkRead }: FeedCardProps) {
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
        transition: 'border-color 0.2s, box-shadow 0.2s, opacity 0.2s',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
        opacity: isRead ? 0.45 : 1,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = isDark ? 'rgba(0,212,124,0.35)' : 'rgba(0,120,70,0.3)'
        el.style.boxShadow = isDark
          ? '0 0 20px rgba(0,212,124,0.06)'
          : '0 2px 16px rgba(0,120,70,0.08)'
        if (isRead) el.style.opacity = '0.7'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.1)'
        el.style.boxShadow = 'none'
        el.style.opacity = isRead ? '0.45' : '1'
      }}
    >
      {/* Left accent bar */}
      <Box
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: 3,
          background: isRead
            ? (isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.08)')
            : isRecent(item.published)
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
            {!isRead && isRecent(item.published) && (
              <Badge size="xs" variant="light" color="green" radius="sm" ff="monospace"
                style={{ fontSize: 9, letterSpacing: '0.06em' }}>
                NEW
              </Badge>
            )}
            {isRead && (
              <Badge size="xs" variant="outline" color="gray" radius="sm" ff="monospace"
                style={{ fontSize: 9, letterSpacing: '0.06em' }}>
                READ
              </Badge>
            )}
          </Group>
          <Group gap={6} align="center" style={{ flexShrink: 0 }}>
            {item.published && (
              <Group gap={4} align="center">
                <IconCalendar size={11} style={{ opacity: 0.5 }} />
                <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: 11 }}>
                  {fmtDate(item.published)}
                </Text>
              </Group>
            )}
            <Tooltip label={isRead ? 'Mark as unread' : 'Mark as read'} position="left" withArrow>
              <ActionIcon
                size="xs"
                variant="subtle"
                color={isRead ? 'gray' : 'brand'}
                onClick={(e) => { e.preventDefault(); onToggleRead() }}
                aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
              >
                {isRead ? <IconEyeOff size={12} /> : <IconEye size={12} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Title */}
        <Anchor
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          underline="never"
          onClick={onMarkRead}
          style={{
            color: isDark ? (isRead ? '#888' : '#e8e8e8') : (isRead ? '#999' : '#1a1b1e'),
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
          {(item.categories?.length ?? 0) > 0 && (
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
