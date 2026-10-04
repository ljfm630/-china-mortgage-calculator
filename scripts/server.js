import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = process.argv.includes('--dist') ? 'dist' : '.'
const port = Number(process.env.PORT || 4173)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }

createServer((request, response) => {
  const requested = decodeURIComponent(request.url.split('?')[0])
  const relative = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '')
  let file = join(root, relative || 'index.html')
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
  createReadStream(file).pipe(response)
}).listen(port, '0.0.0.0', () => console.log(`预览地址：http://localhost:${port}`))
