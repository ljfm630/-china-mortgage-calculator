import { after, test } from 'node:test'
import assert from 'node:assert/strict'

class FakeElement {
  constructor(id = '') {
    this.id = id
    this.dataset = {}
    this.textContent = ''
    this.value = ''
    this.hidden = false
    this.style = {}
  }

  set innerHTML(html) {
    this._innerHTML = html
    fakeDocument.indexHtml(html)
  }

  get innerHTML() { return this._innerHTML || '' }
}

const elements = new Map([['app', new FakeElement('app')]])
const listeners = new Map()
const fakeDocument = {
  activeElement: null,
  querySelector(selector) {
    return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null
  },
  querySelectorAll(selector) {
    return selector === '[data-key]' ? [...elements.values()].filter((element) => element.dataset.key) : []
  },
  addEventListener(type, listener) { listeners.set(type, listener) },
  indexHtml(html) {
    for (const match of html.matchAll(/<([a-z]+)([^>]*\sid="([^"]+)"[^>]*)>([^<]*)/g)) {
      const [, , attributes, id, content] = match
      const element = new FakeElement(id)
      element.textContent = content
      const key = attributes.match(/data-key="([^"]+)"/)?.[1]
      if (key) element.dataset.key = key
      elements.set(id, element)
    }
    for (const match of html.matchAll(/<input([^>]*\sid="([^"]+)"[^>]*)>/g)) {
      const [, attributes, id] = match
      const element = elements.get(id) || new FakeElement(id)
      const key = attributes.match(/data-key="([^"]+)"/)?.[1]
      if (key) element.dataset.key = key
      elements.set(id, element)
    }
  },
}

const stored = new Map()
globalThis.document = fakeDocument
globalThis.localStorage = {
  getItem(key) { return stored.get(key) ?? null },
  setItem(key, value) { stored.set(key, value) },
}

after(() => {
  delete globalThis.document
  delete globalThis.localStorage
})

test('main.js 完整初始化后将官方期数和规划结果写入最终页面 DOM', async () => {
  await import(`./main.js?integration=${Date.now()}`)

  assert.equal(elements.get('officialRemainingMonths').textContent, '337 期')
  assert.equal(elements.get('plannedMonths').textContent, '323 期（规划测算）')
  assert.notEqual(elements.get('plannedMonths').textContent, '—')
  assert.equal(elements.get('monthsSaved').textContent, '14 个月')
  assert.equal(elements.get('currentBalance').value, 1_012_206.88)
  assert.equal(elements.get('minimumPayment').value, 4_256.67)
  assert.equal(elements.get('principalRepaid').textContent, '147,793.12 元')
  assert.equal(elements.get('principalRemaining').textContent, '1,012,206.88 元')
  assert.equal(elements.get('principalProgressPercent').textContent, '12.7%')
  assert.equal(elements.get('principalProgressFill').style.width, '12.7%')
  assert.equal(elements.get('totalMonthlyPayment').value, 30_000)
  assert.equal(elements.get('totalMonthlyPaymentDisplay').textContent, '30,000 元')
  assert.equal(elements.get('minimumPaymentDisplay').textContent, '4,256.67 元')
  assert.equal(elements.get('extraPrepaymentDisplay').textContent, '25,743.33 元')
  assert.equal(elements.get('appliedAmount').textContent, '25,743.33 元')
  assert.ok(listeners.has('input'), '应注册输入事件以便重新渲染')

  const totalMonthlyPayment = elements.get('totalMonthlyPayment')
  totalMonthlyPayment.value = 3_000
  listeners.get('input')({ target: totalMonthlyPayment })
  assert.equal(elements.get('extraPrepaymentDisplay').textContent, '0 元')
  assert.equal(elements.get('plannedMonths').textContent, '337 期（规划测算）')
  assert.equal(elements.get('monthsSaved').textContent, '0 个月')
  assert.equal(elements.get('amountWarning').hidden, false)
  assert.match(elements.get('amountWarning').textContent, /低于当前最低还款额/)

  assert.ok(listeners.has('click'), '应注册点击事件以维护未来计划')
  elements.get('futurePlanMonth').value = '2026-11'
  elements.get('futurePlanTotal').value = 20_000
  listeners.get('click')({ target: elements.get('addFuturePlan') })
  assert.match(elements.get('futurePlanList').innerHTML, /2026-11/)
  assert.match(elements.get('futurePlanList').innerHTML, /15,743\.33 元/)
  assert.match(stored.get('gjj-future-payment-plan-v1'), /2026-11/)
})
