import { after, test } from 'node:test'
import assert from 'node:assert/strict'

class FakeElement {
  constructor(id = '') { this.id=id; this.dataset={}; this.textContent=''; this.value=''; this.hidden=false; this.style={}; this.innerHTML='' }
}
const elements=new Map([['app',new FakeElement('app')]])
const listeners=new Map()
const fakeDocument={
  activeElement:null,
  querySelector(selector){return selector.startsWith('#')?elements.get(selector.slice(1))||null:null},
  querySelectorAll(selector){return selector==='[data-key]'?[...elements.values()].filter(e=>e.dataset.key):selector==='[data-profile-key]'?[...elements.values()].filter(e=>e.dataset.profileKey):[]},
  addEventListener(type,listener){listeners.set(type,listener)},
}
globalThis.document=fakeDocument
const stored=new Map()
stored.set('gjj-prepayment-planner-v3',JSON.stringify({currentBalance:800000,minimumPayment:3500,savings:80000,totalMonthlyPayment:20000}))
stored.set('gjj-loan-profile-v1',JSON.stringify({originalPrincipal:900000,annualRate:2.6,officialRemainingMonths:240,loanDate:'2024-01-01',repaymentMethod:'自由还款',originalTermMonths:360}))
globalThis.localStorage={getItem(k){return stored.get(k)??null},setItem(k,v){stored.set(k,v)}}
after(()=>{delete globalThis.document;delete globalThis.localStorage})
test('个人参数从本地存储读取而非源码常量',async()=>{
  await import('./main.js?privacy='+Date.now())
  assert.equal(elements.get('annualRateDisplay').textContent,'2.6%')
  assert.equal(elements.get('officialRemainingMonths').textContent,'240 期')
  assert.equal(elements.get('currentBalance').value,800000)
  assert.equal(elements.get('minimumPayment').value,3500)
  assert.ok(listeners.has('input'))
  assert.ok(elements.get('profileOriginalPrincipal'))
})
