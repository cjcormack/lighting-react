import react from "@vitejs/plugin-react"

// https://vitejs.dev/config/
export default {
  plugins: [react()],
  server: {
    open: true,
    proxy: {
      '/api': 'http://localhost:8413/',
      '/kotlin-compiler-server': 'http://localhost:8413/',
    },
  },
}
