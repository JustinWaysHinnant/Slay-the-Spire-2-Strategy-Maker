import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.VITE_BASE ?? '/spire2-run-tracker/'

export default defineConfig({ plugins: [react()], base })
