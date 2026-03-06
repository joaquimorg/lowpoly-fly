import { defineConfig } from 'vite'

export default defineConfig({
    base: './', // Use paths relative to the index.html for maximum compatibility
    build: {
        outDir: 'dist',
    }
})
