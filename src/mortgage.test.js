import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectLoan, simulatePrepayment, toCents } from './mortgage.js'
import { calculateExtraPrepayment } from './payment-plan.js'
import { simulateFuturePlan } from './future-plan.js'

describe('还款规划核心', () => {
  it('按分取整', () => assert.equal(toCents(50000.009), 5_000_001))
  it('可根据输入的贷款参数完成提前还款测算', () => {
    const result = simulatePrepayment({
      currentPrincipal: 800_000,
      prepaymentAmount: 16_500,
      annualRate: 2.6,
      currentMinimumPayment: 3_500,
      officialRemainingMonths: 240,
    })
    assert.equal(result.principalAfterPrepayment, 783_500)
    assert.equal(result.payable, true)
    assert.equal(result.estimatedMonthsBefore, 240)
    assert.ok(result.estimatedMonthsAfter < 240)
    assert.ok(result.estimatedInterestSaved > 0)
  })
  it('总还款额包含最低还款额', () => assert.equal(calculateExtraPrepayment(20_000, 3_500), 16_500))
  it('未来计划可连续叠加', () => {
    const result = simulateFuturePlan({
      currentPrincipal: 800_000,
      annualRate: 2.6,
      currentMinimumPayment: 3_500,
      officialRemainingMonths: 240,
      startMonth: '2026-10',
      entries: [
        { month: '2026-10', totalPayment: 20_000 },
        { month: '2026-11', totalPayment: 10_000 },
        { month: '2026-12', totalPayment: 8_000 },
      ],
    })
    assert.equal(result.steps.length, 3)
    assert.ok(result.steps[0].endingBalance > result.steps[1].endingBalance)
    assert.ok(result.steps[1].endingBalance > result.steps[2].endingBalance)
    assert.ok(result.estimatedMonthsSaved > 0)
  })
  it('最低还款不足以覆盖利息时不可还清', () => {
    const result = projectLoan({ principal: 1_000_000, annualRate: 12, monthlyPayment: 5_000 })
    assert.equal(result.payable, false)
  })
})
