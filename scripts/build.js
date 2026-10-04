import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'

await rm('dist', { recursive: true, force: true })
await mkdir('dist/src', { recursive: true })
await cp('src', 'dist/src', { recursive: true, filter: (source) => !source.endsWith('.test.js') })
const html = (await readFile('index.html', 'utf8')).replace('./src/', './src/')
await writeFile('dist/index.html', html)
console.log('构建完成：dist/')
