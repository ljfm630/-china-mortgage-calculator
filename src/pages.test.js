import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('GitHub Pages 子路径部署', () => {
  it('使用相对路径加载 JavaScript 和 CSS', async () => {
    const html = await readFile('index.html', 'utf8')
    assert.match(html, /src="\.\/src\/main\.js"/)
    assert.match(html, /href="\.\/src\/style\.css"/)
    assert.doesNotMatch(html, /(?:src|href)="\//)
  })

  it('不使用浏览器无法直接执行的 CSS 模块导入', async () => {
    const main = await readFile('src/main.js', 'utf8')
    assert.doesNotMatch(main, /import\s+['"].*\.css['"]/)
  })
})
