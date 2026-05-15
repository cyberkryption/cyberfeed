import { useState } from 'react'
import {
  Modal, Stack, Text, Group, TextInput, Button, ActionIcon,
  Box, Badge, Divider, useComputedColorScheme,
} from '@mantine/core'
import { IconTrash, IconPlus } from '@tabler/icons-react'
import { MAX_KEYWORDS } from '../hooks/useWatchlist'

interface WatchlistModalProps {
  opened: boolean
  onClose: () => void
  keywords: string[]
  onAdd: (kw: string) => string | null   // returns error string or null
  onRemove: (kw: string) => void
}

export function WatchlistModal({ opened, onClose, keywords, onAdd, onRemove }: WatchlistModalProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const labelColor = isDark ? 'rgba(0,212,124,0.55)' : 'rgba(0,120,70,0.6)'

  const handleAdd = () => {
    const err = onAdd(input)
    if (err) {
      setError(err)
    } else {
      setInput('')
      setError(null)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text ff="monospace" fw={700} size="sm" style={{ letterSpacing: '0.1em', color: isDark ? '#00d47c' : '#007840' }}>
          WATCHLIST
        </Text>
      }
      size="sm"
      styles={{
        content: {
          background: isDark ? '#13181b' : '#f5faf7',
          border: isDark ? '1px solid rgba(0,212,124,0.15)' : '1px solid rgba(0,120,70,0.12)',
        },
        header: {
          background: isDark ? '#13181b' : '#f5faf7',
          borderBottom: isDark ? '1px solid rgba(0,212,124,0.1)' : '1px solid rgba(0,120,70,0.08)',
        },
      }}
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
          Add up to {MAX_KEYWORDS} keywords. After each feed refresh, any new articles matching a
          keyword will trigger an alert banner.
        </Text>

        <Divider color={isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.1)'} />

        {/* Keyword list */}
        <Box>
          <Group justify="space-between" mb={6}>
            <Text size="xs" fw={700} ff="monospace" style={{ letterSpacing: '0.1em', color: labelColor }}>
              KEYWORDS
            </Text>
            <Text size="xs" ff="monospace" c="dimmed">
              {keywords.length} / {MAX_KEYWORDS}
            </Text>
          </Group>
          <Stack gap={4}>
            {keywords.length === 0 && (
              <Text size="xs" c="dimmed" ff="monospace" ta="center" py="sm" style={{ letterSpacing: '0.06em' }}>
                NO KEYWORDS CONFIGURED
              </Text>
            )}
            {keywords.map((kw) => (
              <Group key={kw} justify="space-between" align="center" px="xs" py={4}
                style={{
                  borderRadius: 4,
                  background: isDark ? 'rgba(0,212,124,0.05)' : 'rgba(0,120,70,0.04)',
                  border: isDark ? '1px solid rgba(0,212,124,0.1)' : '1px solid rgba(0,120,70,0.08)',
                }}
              >
                <Text size="sm" ff="monospace">{kw}</Text>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => onRemove(kw)}
                  aria-label={`Remove ${kw}`}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        </Box>

        <Divider color={isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.1)'} />

        {/* Add keyword */}
        <Box>
          <Text size="xs" fw={700} ff="monospace" mb="xs" style={{ letterSpacing: '0.1em', color: labelColor }}>
            ADD KEYWORD
          </Text>
          <Group gap="xs" align="flex-start">
            <TextInput
              placeholder="e.g. Cisco, Palo Alto, CVE-2025…"
              value={input}
              onChange={(e) => { setInput(e.currentTarget.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              size="xs"
              style={{ flex: 1 }}
              ff="monospace"
              disabled={keywords.length >= MAX_KEYWORDS}
              error={error}
            />
            <Button
              size="xs"
              color="brand"
              variant="filled"
              leftSection={<IconPlus size={13} />}
              onClick={handleAdd}
              disabled={keywords.length >= MAX_KEYWORDS}
            >
              Add
            </Button>
          </Group>
          {keywords.length >= MAX_KEYWORDS && (
            <Text size="xs" c="dimmed" mt={4} style={{ fontSize: 11 }}>
              Remove a keyword to add another.
            </Text>
          )}
        </Box>

        {/* Footer note */}
        <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: 10, letterSpacing: '0.04em' }}>
          MATCHING IS CASE-INSENSITIVE · CHECKS TITLE, DESCRIPTION &amp; SOURCE
        </Text>
      </Stack>
    </Modal>
  )
}
