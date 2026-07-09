import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Production is deployed under /iml/, but the dev server serves at the root so
// tooling (and plain http://localhost:5173/) loads the app without the prefix.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === 'build' ? '/iml/' : '/',
}))
