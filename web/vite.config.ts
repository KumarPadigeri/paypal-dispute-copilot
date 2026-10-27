import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, /api calls go to the FastAPI server (uvicorn on port 8000).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
