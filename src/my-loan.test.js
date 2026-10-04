import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSafeExtraPayment,
  calculateSegmentedPeriodInterest,
  compareFreedomRepayment,
  createDefaultMyLoanProfile,
  getRateForDate,
  loadMyLoanProfile,
  resetMyLoanProfile,
  saveMyLoanProfile,
} from './my-loan.js'

describe('我的还贷档案和现金安全线', () => {
  it('正确读取真实贷款默认数据', () => {
    const profile = createDefaultMyLoanProfile()
    assert.equal(profile.remainingPrincipal, 1_012_206.88)
    assert.equal(getRateForDate(profile.rateHistory, '2026-01-01'), 2.6)
    assert.equal(profile.officialMinimumPayment, 4_256.67)
    assert.equal(profile.originalTermTier, 'over5Years')
    assert.equal(profile.originalPrincipal, 1_160_000)
    assert.deepEqual(profile.repaymentHistory[0], {
      effectiveMonth: '2025-01',
      extraPrincipal: 100_000,
      minimumPaymentReassessed: true,
      note: '提前偿还10万元，之后最低还款额由国管公积金系统按剩余本金重新调整',
    })
  })

  it('按现金安全线计算可安全额外还款', () => {
    assert.equal(calculateSafeExtraPayment({ availableSavings: 50_000, cashSafetyLine: 50_000, reservedExpenses: 0 }), 0)
    assert.equal(calculateSafeExtraPayment({ availableSavings: 58_000, cashSafetyLine: 50_000, reservedExpenses: 0 }), 8_000)
    assert.equal(calculateSafeExtraPayment({ availableSavings: 60_000, cashSafetyLine: 50_000, reservedExpenses: 3_000 }), 7_000)
    assert.equal(calculateSafeExtraPayment({ availableSavings: 45_000, cashSafetyLine: 50_000, reservedExpenses: 0 }), 0)
    assert.equal(calculateSafeExtraPayment({ availableSavings: 50_001, cashSafetyLine: 50_000, reservedExpenses: 0 }), 1)
  })

  it('在浏览器本地保存并恢复档案', () => {
    const data = new Map()
    const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }
    const profile = createDefaultMyLoanProfile()
    profile.availableSavings = 66_000
    saveMyLoanProfile(profile, storage)
    assert.equal(loadMyLoanProfile(storage).availableSavings, 66_000)
    assert.equal(resetMyLoanProfile(storage).availableSavings, 58_000)
    assert.equal(data.size, 0)
  })
})

describe('国管公积金自由还款估算', () => {
  it('2026年1月跨利率切换日分段计息', () => {
    const profile = createDefaultMyLoanProfile()
    const interest = calculateSegmentedPeriodInterest(1_000_000, '2025-12-17', '2026-01-17', profile.rateHistory)
    const expected = Math.round((1_000_000 * (2.85 / 100) * 15 / 365 + 1_000_000 * (2.6 / 100) * 16 / 365) * 100) / 100
    assert.equal(interest, expected)
  })

  it('额外还款缩短期限且不会使本金为负', () => {
    const profile = createDefaultMyLoanProfile()
    const comparison = compareFreedomRepayment(profile, 100_000)
    assert.equal(comparison.accelerated.extraPayment, 100_000)
    assert.ok(comparison.accelerated.remainingAfterExtra >= 0)
    assert.ok(comparison.accelerated.months <= comparison.baseline.months)
    assert.ok(comparison.interestSaved >= 0)
    assert.equal(comparison.accelerated.schedule.at(-1).remaining, 0)
  })

  it('当前余额已包含2025年历史提前还款，不会在未来模拟中重复扣除', () => {
    const profile = createDefaultMyLoanProfile()
    const comparison = compareFreedomRepayment(profile, 0)
    const first = comparison.baseline.schedule[0]
    assert.equal(first.remaining, Math.round((profile.remainingPrincipal - first.principal) * 100) / 100)
    assert.ok(first.remaining > profile.remainingPrincipal - profile.repaymentHistory[0].extraPrincipal)
  })

  it('超额输入最多结清当前本金', () => {
    const profile = createDefaultMyLoanProfile()
    const result = compareFreedomRepayment(profile, 2_000_000).accelerated
    assert.equal(result.extraPayment, profile.remainingPrincipal)
    assert.equal(result.schedule.at(-1).remaining, 0)
  })

  it('预计五年内还清也保持原始5年以上利率档，不切换2.10%', () => {
    const profile = createDefaultMyLoanProfile()
    const result = compareFreedomRepayment(profile, 900_000).accelerated
    assert.ok(result.months <= 60)
    assert.equal(result.originalTermTier, 'over5Years')
    assert.equal(result.appliedAnnualRate, 2.6)
    assert.equal(result.schedule.some((row) => row.annualRate === 2.1), false)
  })
})
