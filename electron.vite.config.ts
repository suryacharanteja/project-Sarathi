import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      // Two entries, not one: `stt-worker` is the Electron utilityProcess that
      // runs local Whisper off the main thread (see
      // src/main/services/stt/local-worker.ts). It has to be a separate
      // bundle because utilityProcess.fork() takes a file path, and it must
      // land beside index.js in out/main so `join(__dirname, 'stt-worker.js')`
      // resolves identically in dev and inside a packaged asar.
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'stt-worker': resolve(__dirname, 'src/main/services/stt/local-worker.ts')
        },
        output: {
          entryFileNames: '[name].js'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
