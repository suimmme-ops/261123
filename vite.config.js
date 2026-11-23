import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        student: resolve(import.meta.dirname, 'student.html'),
        teacherMonitor: resolve(import.meta.dirname, 'teacherMonitor.html'),
      },
    },
  },
})
