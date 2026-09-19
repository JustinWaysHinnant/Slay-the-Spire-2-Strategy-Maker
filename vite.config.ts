import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.VITE_BASE ?? '/Slay-the-Spire-2-Strategy-Maker/'

export default defineConfig({ plugins: [react()], base })
