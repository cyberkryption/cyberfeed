import { useState } from 'react'
import {
  Box, Text, TextInput, PasswordInput, Button,
  Alert, Stack, useComputedColorScheme,
} from '@mantine/core'
import { IconRadar, IconAlertTriangle, IconUser, IconLock } from '@tabler/icons-react'

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onLogin(username.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark
          ? 'linear-gradient(160deg, #101113 0%, #14171a 50%, #0d1210 100%)'
          : 'linear-gradient(160deg, #f5faf7 0%, #eef7f2 100%)',
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        style={{
          width: 360,
          padding: '2rem',
          borderRadius: 8,
          border: isDark
            ? '1px solid rgba(0,212,124,0.2)'
            : '1px solid rgba(0,120,70,0.15)',
          background: isDark
            ? 'rgba(16,17,19,0.95)'
            : 'rgba(248,252,250,0.95)',
          backdropFilter: 'blur(12px)',
          boxShadow: isDark
            ? '0 8px 40px rgba(0,0,0,0.6)'
            : '0 8px 40px rgba(0,0,0,0.08)',
        }}
      >
        <Stack gap="lg">
          {/* Logo */}
          <Stack gap={6} align="center" mb="xs">
            <Box
              style={{
                background: 'linear-gradient(135deg, #00d47c, #00a85f)',
                borderRadius: 8,
                padding: '10px 12px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <IconRadar size={28} color="white" stroke={2} />
            </Box>
            <Text
              ff="monospace"
              fw={700}
              size="xl"
              style={{ color: isDark ? '#00d47c' : '#007840', letterSpacing: '-0.02em' }}
            >
              CYBERFEED
            </Text>
            <Text size="xs" c="dimmed" ff="monospace" style={{ letterSpacing: '0.1em' }}>
              SIGN IN TO CONTINUE
            </Text>
          </Stack>

          {error && (
            <Alert icon={<IconAlertTriangle size={14} />} color="red" p="xs" radius="sm">
              <Text size="xs" ff="monospace">{error}</Text>
            </Alert>
          )}

          <TextInput
            label="USERNAME"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            leftSection={<IconUser size={14} />}
            required
            autoFocus
            autoComplete="username"
            styles={{
              label: {
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: '0.1em',
                marginBottom: 4,
              },
              input: {
                fontFamily: 'monospace',
                background: isDark ? 'rgba(30,32,36,0.8)' : undefined,
                border: isDark ? '1px solid rgba(0,212,124,0.2)' : undefined,
              },
            }}
          />

          <PasswordInput
            label="PASSWORD"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            leftSection={<IconLock size={14} />}
            required
            autoComplete="current-password"
            styles={{
              label: {
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: '0.1em',
                marginBottom: 4,
              },
              input: {
                fontFamily: 'monospace',
                background: isDark ? 'rgba(30,32,36,0.8)' : undefined,
                border: isDark ? '1px solid rgba(0,212,124,0.2)' : undefined,
              },
            }}
          />

          <Button
            type="submit"
            fullWidth
            loading={loading}
            color="brand"
            ff="monospace"
            style={{ letterSpacing: '0.1em' }}
          >
            SIGN IN
          </Button>
        </Stack>
      </Box>
    </Box>
  )
}
