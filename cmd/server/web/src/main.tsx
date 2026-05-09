import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme, ColorSchemeScript } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import App from './App'
import './index.css'

const theme = createTheme({
  fontFamily: '"IBM Plex Sans", sans-serif',
  fontFamilyMonospace: '"Space Mono", monospace',
  headings: {
    fontFamily: '"Space Mono", monospace',
  },
  colors: {
    brand: [
      '#e8fff4', '#c6ffe4', '#88ffca', '#3dffac', '#00f090',
      '#00d47c', '#00a85f', '#008049', '#006038', '#00402a',
    ],
    dark: [
      '#C1C2C5', '#A6A7AB', '#909296', '#5C5F66',
      '#373A40', '#2C2E33', '#25262B', '#1A1B1E', '#141517', '#101113',
    ],
  },
  primaryColor: 'brand',
  defaultRadius: 'sm',
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="dark" />
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
)
