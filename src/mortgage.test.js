import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateMortgage, calculateVariableRateMortgage } from './mortgage.js'

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

describe('分段利率计算', () => {
  const variableDefaults = {
    principal: 1_150_000,
    originalAnnualRate: 2.85,
    newAnnualRate: 2.6,
    years: 30,
    startDate: '2025-01-01',
    effectiveDate: '2026-01-01',
  }

  for (const method of ['annuity', 'equalPrincipal']) {
    it(`${method} 在第 13 期按剩余本金切换至 2.60%`, () => {
      const result = calculateVariableRateMortgage({ ...variableDefaults, method })
      assert.equal(result.periods, 360)
      assert.equal(result.adjustmentPeriod, 13)
      assert.equal(result.schedule[11].annualRate, 2.85)
      assert.equal(result.schedule[12].annualRate, 2.6)
      assert.equal(result.schedule[12].rateChanged, true)
      assert.equal(result.schedule[11].remaining, roundMoney(result.schedule[12].remaining + result.schedule[12].principal))
      assert.equal(result.schedule.at(-1).remaining, 0)
      assert.equal(result.schedule.every((row, index) => row.period === index + 1), true)
      closeTo(result.schedule.reduce((sum, row) => sum + row.principal, 0), variableDefaults.principal)
    })
  }

  it('按剩余本金重新计算调整前后月供', () => {
    const annuity = calculateVariableRateMortgage({ ...variableDefaults, method: 'annuity' })
    closeTo(annuity.paymentBefore, 4755.91)
    closeTo(annuity.paymentAfter, 4608.15)

    const equalPrincipal = calculateVariableRateMortgage({ ...variableDefaults, method: 'equalPrincipal' })
    closeTo(equalPrincipal.paymentBefore, 5925.69)
    closeTo(equalPrincipal.paymentAfter, 5603.05)
  })

  it('新旧利率相同时与固定利率结果基本一致', () => {
    for (const method of ['annuity', 'equalPrincipal']) {
      const fixed = calculateMortgage({ ...defaults, method })
      const variable = calculateVariableRateMortgage({ ...variableDefaults, newAnnualRate: 2.85, method })
      closeTo(variable.totalInterest, fixed.totalInterest, 1)
      closeTo(variable.totalPayment, fixed.totalPayment, 1)
    }
  })

  it('支持新旧利率均为 0%', () => {
    const result = calculateVariableRateMortgage({
      ...variableDefaults,
      originalAnnualRate: 0,
      newAnnualRate: 0,
      method: 'annuity',
    })
    assert.equal(result.totalInterest, 0)
    assert.equal(result.schedule.every((row) => Object.values(row).every((value) => typeof value !== 'number' || Number.isFinite(value))), true)
    assert.equal(result.schedule.at(-1).remaining, 0)
  })

  it('要求有效的贷款开始日期和期限内的调整日期', () => {
    assert.throws(() => calculateVariableRateMortgage({ ...variableDefaults, startDate: '', method: 'annuity' }), /贷款开始日期/)
    assert.throws(() => calculateVariableRateMortgage({ ...variableDefaults, effectiveDate: '2056-01-01', method: 'annuity' }), /贷款期限内/)
  })
})

function closeTo(actual, expected, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} 应接近 ${expected}`)
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
