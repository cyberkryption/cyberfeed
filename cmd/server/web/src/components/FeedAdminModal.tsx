import { useEffect, useState } from 'react'
import {
  Modal, Stack, Group, Text, Box, TextInput, Button, Switch, Select,
  ActionIcon, Tooltip, Loader, Alert, Badge, ScrollArea,
  useComputedColorScheme, Divider, SegmentedControl,
} from '@mantine/core'
import { IconTrash, IconPlus, IconAlertTriangle, IconRefresh } from '@tabler/icons-react'
import { useFeedAdmin } from '../hooks/useFeedAdmin'

interface FeedAdminModalProps {
  opened: boolean
  onClose: () => void
  onRefresh: () => void
}

const INTERVAL_OPTIONS = [
  { value: '0',    label: 'Global' },
  { value: '5',    label: '5 min' },
  { value: '15',   label: '15 min' },
  { value: '30',   label: '30 min' },
  { value: '60',   label: '1 hour' },
  { value: '360',  label: '6 hours' },
  { value: '1440', label: '24 hours' },
]

export function FeedAdminModal({ opened, onClose, onRefresh }: FeedAdminModalProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'
  const { feeds, loading, error, load, addFeed, deleteFeed, toggleFeed, setFeedInterval } = useFeedAdmin()

  const [newName, setNewName] = useState('')
  const [newURL, setNewURL] = useState('')
  const [newParser, setNewParser] = useState('auto')
  const [newCategory, setNewCategory] = useState('auto')
  const [newInterval, setNewInterval] = useState('0')
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    if (opened) {
      load()
      setConfirmDelete(null)
      setAddError(null)
      setNewName('')
      setNewURL('')
      setNewParser('auto')
      setNewCategory('auto')
      setNewInterval('0')
    }
  }, [opened, load])

  const handleAdd = async () => {
    const name = newName.trim()
    const url = newURL.trim()
    if (!name || !url) {
      setAddError('Name and URL are required.')
      return
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setAddError('URL must start with http:// or https://')
      return
    }
    setAddError(null)
    setAddLoading(true)
    try {
      await addFeed(name, url, newParser, newCategory, parseInt(newInterval, 10))
      setNewName('')
      setNewURL('')
      setNewParser('auto')
      setNewCategory('auto')
      setNewInterval('0')
    } catch (e) {
      setAddError(String(e))
    } finally {
      setAddLoading(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (confirmDelete !== name) {
      setConfirmDelete(name)
      return
    }
    setConfirmDelete(null)
    try {
      await deleteFeed(name)
    } catch {
      // list re-loads on success; stays unchanged on failure
    }
  }

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await toggleFeed(name, enabled)
    } catch {
      // best-effort
    }
  }

  const handleInterval = async (name: string, value: string | null) => {
    if (value === null) return
    try {
      await setFeedInterval(name, parseInt(value, 10))
    } catch {
      // best-effort
    }
  }

  const handleSaveAndRefresh = () => {
    onClose()
    onRefresh()
  }

  const labelColor = isDark ? 'rgba(0,212,124,0.55)' : 'rgba(0,120,70,0.6)'

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text ff="monospace" fw={700} size="sm" style={{ letterSpacing: '0.1em', color: isDark ? '#00d47c' : '#007840' }}>
          MANAGE FEEDS
        </Text>
      }
      size="xl"
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
        {error && (
          <Alert icon={<IconAlertTriangle size={14} />} color="red" p="xs">
            <Text size="xs">{error}</Text>
          </Alert>
        )}

        {/* Feed list */}
        <Box>
          <Group justify="space-between" mb={6}>
            <Text size="xs" fw={700} ff="monospace" style={{ letterSpacing: '0.1em', color: labelColor }}>
              CONFIGURED FEEDS
            </Text>
            {loading && <Loader size="xs" color="brand" type="dots" />}
          </Group>

          <ScrollArea.Autosize mah={340} scrollbarSize={4}>
            <Stack gap={0}>
              {feeds.map((feed, i) => (
                <Box key={feed.name}>
                  {i > 0 && (
                    <Divider color={isDark ? 'rgba(0,212,124,0.06)' : 'rgba(0,120,70,0.06)'} />
                  )}
                  <Group
                    justify="space-between"
                    align="center"
                    py="xs"
                    px="xs"
                    style={{ opacity: feed.enabled ? 1 : 0.45, transition: 'opacity 0.15s' }}
                  >
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" align="center">
                        <Box
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: feed.enabled
                              ? (isDark ? '#00d47c' : '#007840')
                              : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'),
                          }}
                        />
                        <Text size="xs" fw={500} style={{ lineHeight: 1.3 }}>
                          {feed.name}
                        </Text>
                        <Badge size="xs" variant="outline" color="gray" radius="sm" style={{ fontSize: 9 }}>
                          {feed.parser === 'csv' || (feed.parser === 'auto' && feed.url.toLowerCase().endsWith('.csv'))
                            ? 'CSV'
                            : feed.parser === 'json' || (feed.parser === 'auto' && feed.url.toLowerCase().endsWith('.json'))
                              ? 'JSON'
                              : 'RSS'}
                        </Badge>
                        <Badge size="xs" variant="light" color={feed.category === 'threat_intel' ? 'orange' : 'blue'} radius="sm" style={{ fontSize: 9 }}>
                          {feed.category === 'threat_intel' ? 'INTEL' : 'NEWS'}
                        </Badge>
                      </Group>
                      <Text
                        size="xs"
                        c="dimmed"
                        component="a"
                        href={feed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          fontSize: 10,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 340,
                          marginLeft: 14,
                          opacity: 0.6,
                          textDecoration: 'none',
                        }}
                      >
                        {feed.url}
                      </Text>
                    </Box>

                    <Group gap="xs" align="center" style={{ flexShrink: 0 }}>
                      <Tooltip label="Refresh interval for this feed" position="left" withArrow>
                        <Select
                          size="xs"
                          w={90}
                          value={String(feed.refreshInterval ?? 0)}
                          onChange={(v) => handleInterval(feed.name, v)}
                          data={INTERVAL_OPTIONS}
                          allowDeselect={false}
                          styles={{
                            input: {
                              fontSize: 11,
                              fontFamily: 'monospace',
                              background: 'transparent',
                              border: isDark
                                ? '1px solid rgba(0,212,124,0.2)'
                                : '1px solid rgba(0,120,70,0.2)',
                              color: isDark ? 'rgba(0,212,124,0.7)' : 'rgba(0,120,70,0.8)',
                            },
                          }}
                        />
                      </Tooltip>

                      <Tooltip
                        label={feed.enabled ? 'Pause fetching' : 'Resume fetching'}
                        position="left"
                        withArrow
                      >
                        <Switch
                          size="xs"
                          checked={feed.enabled}
                          onChange={(e) => handleToggle(feed.name, e.currentTarget.checked)}
                          color="brand"
                          aria-label={feed.enabled ? `Disable ${feed.name}` : `Enable ${feed.name}`}
                        />
                      </Tooltip>

                      <Tooltip
                        label={confirmDelete === feed.name ? 'Click again to confirm delete' : 'Delete feed'}
                        position="left"
                        withArrow
                      >
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color={confirmDelete === feed.name ? 'red' : 'gray'}
                          onClick={() => handleDelete(feed.name)}
                          aria-label={`Delete ${feed.name}`}
                        >
                          <IconTrash size={13} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </Box>
              ))}
              {!loading && feeds.length === 0 && (
                <Text size="xs" c="dimmed" ff="monospace" ta="center" py="md">
                  NO FEEDS CONFIGURED
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Box>

        <Divider color={isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.1)'} />

        {/* Add feed form */}
        <Box>
          <Text size="xs" fw={700} ff="monospace" mb="xs" style={{ letterSpacing: '0.1em', color: labelColor }}>
            ADD FEED
          </Text>
          <Stack gap="xs">
            <Group gap="xs" align="flex-end">
              <TextInput
                placeholder="Display name"
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                size="xs"
                style={{ flex: '0 0 180px' }}
                ff="monospace"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
              <TextInput
                placeholder="https://example.com/feed.xml"
                value={newURL}
                onChange={(e) => setNewURL(e.currentTarget.value)}
                size="xs"
                style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
            </Group>
            <Group gap="xs" align="center">
              <Tooltip
                label="Auto: infer from URL (.csv → CSV, .json → JSON, otherwise RSS/Atom)"
                position="top"
                withArrow
                multiline
                w={240}
              >
                <SegmentedControl
                  value={newParser}
                  onChange={setNewParser}
                  size="xs"
                  data={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'xml', label: 'RSS' },
                    { value: 'csv', label: 'CSV' },
                    { value: 'json', label: 'JSON' },
                  ]}
                  color="brand"
                />
              </Tooltip>
              <Tooltip
                label="Auto: .csv/.json URLs go to THREAT INTEL, others to NEWS"
                position="top"
                withArrow
                multiline
                w={240}
              >
                <SegmentedControl
                  value={newCategory}
                  onChange={setNewCategory}
                  size="xs"
                  data={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'news', label: 'News' },
                    { value: 'threat_intel', label: 'Intel' },
                  ]}
                  color="brand"
                />
              </Tooltip>
              <Tooltip
                label="How often to fetch this feed (Global = server default of 20 min)"
                position="top"
                withArrow
                multiline
                w={220}
              >
                <Select
                  size="xs"
                  w={100}
                  value={newInterval}
                  onChange={(v) => setNewInterval(v ?? '0')}
                  data={INTERVAL_OPTIONS}
                  allowDeselect={false}
                />
              </Tooltip>
              <Button
                size="xs"
                color="brand"
                variant="filled"
                leftSection={<IconPlus size={13} />}
                onClick={handleAdd}
                loading={addLoading}
              >
                Add
              </Button>
            </Group>
            {addError && (
              <Text size="xs" c="red" style={{ fontSize: 11 }}>{addError}</Text>
            )}
          </Stack>
        </Box>

        <Divider color={isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.1)'} />

        {/* Footer */}
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: 10, letterSpacing: '0.04em' }}>
            INTERVAL = PER-FEED SCHEDULE · GLOBAL FOLLOWS SERVER DEFAULT (20 MIN)
          </Text>
          <Button
            size="xs"
            variant="light"
            color="brand"
            leftSection={<IconRefresh size={13} />}
            onClick={handleSaveAndRefresh}
          >
            Refresh now
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
