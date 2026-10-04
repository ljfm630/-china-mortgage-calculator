import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateMortgage } from './mortgage.js'

const defaults = { principal: 1_150_000, annualRate: 2.85, years: 30 }

describe('房贷核心计算', () => {
  it('正确计算 115 万元、2.85%、30 年等额本息', () => {
    const result = calculateMortgage({ ...defaults, method: 'annuity' })
    assert.equal(result.periods, 360)
    closeTo(result.monthlyPayment, 4755.91)
    closeTo(result.totalInterest, 562127.64)
    closeTo(result.totalPayment, 1712127.64)
    assert.equal(result.schedule.at(-1).remaining, 0)
  })

  it('正确计算 115 万元、2.85%、30 年等额本金', () => {
    const result = calculateMortgage({ ...defaults, method: 'equalPrincipal' })
    closeTo(result.firstPayment, 5925.69)
    closeTo(result.monthlyDecrease, 7.59)
    closeTo(result.lastPayment, 3202.03)
    closeTo(result.totalInterest, 492990.65)
    assert.equal(result.schedule.at(-1).remaining, 0)
    closeTo(result.schedule.reduce((sum, row) => sum + row.principal, 0), defaults.principal)
  })

  for (const method of ['annuity', 'equalPrincipal']) {
    it(`${method} 在 0% 利率下无除零或无穷值`, () => {
      const result = calculateMortgage({ ...defaults, annualRate: 0, method })
      assert.equal(result.totalInterest, 0)
      closeTo(result.totalPayment, defaults.principal, 0.000001)
      assert.equal(result.schedule.every((row) => Object.values(row).every(Number.isFinite)), true)
      assert.equal(result.schedule.at(-1).remaining, 0)
    })
  }

  it('拒绝非法输入，避免 NaN 传播', () => {
    assert.throws(() => calculateMortgage({ ...defaults, principal: NaN, method: 'annuity' }))
    assert.throws(() => calculateMortgage({ ...defaults, annualRate: -1, method: 'annuity' }))
  })
})

function closeTo(actual, expected, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} 应接近 ${expected}`)
}
