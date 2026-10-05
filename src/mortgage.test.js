import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LOAN_CONTEXT, projectLoan, simulatePrepayment, toCents } from './mortgage.js'
import { renderSimulationResult } from './simulation-view.js'
import { calculateExtraPrepayment } from './payment-plan.js'

describe('北京国管公积金自由还款规划核心', () => {
  it('保留已知合同事实和历史提前还款，但不反推当前余额', () => {
    assert.deepEqual(LOAN_CONTEXT, {
      originalPrincipal: 1_160_000,
      loanDate: '2024-10-17',
      annualRate: 2.60,
      originalTermMonths: 360,
      officialRemainingMonths: 337,
      repaymentMethod: '自由还款',
      rateHistory: [
        { from: '2024-10-17', to: '2025-12-31', annualRate: 2.85 },
        { from: '2026-01-01', to: null, annualRate: 2.60 },
      ],
      historicalPrepayments: [{ date: '2026（利率调整后）', amount: 100_000 }],
    })
  })

  it('基于手动输入的当前余额和最低还款额完成提前还款对比', () => {
    const result = simulatePrepayment({
      currentPrincipal: 1_060_000,
      prepaymentAmount: 30_000,
      annualRate: 2.85,
      currentMinimumPayment: 5_000,
      officialRemainingMonths: 296,
      startDate: '2026-10-04',
    })

    assert.equal(result.principalBeforePrepayment, 1_060_000)
    assert.equal(result.appliedPrepayment, 30_000)
    assert.equal(result.principalAfterPrepayment, 1_030_000)
    assert.equal(result.payable, true)
    assert.equal(result.estimatedInterestBefore, 415_796.48)
    assert.equal(result.estimatedInterestAfter, 386_153.90)
    assert.equal(result.estimatedInterestSaved, 29_642.58)
    assert.equal(result.estimatedMonthsBefore, 296)
    assert.equal(result.estimatedMonthsAfter, 284)
    assert.equal(result.estimatedMonthsSaved, 12)
    assert.equal(result.estimatedPayoffDateBefore, '2051-06-04')
    assert.equal(result.estimatedPayoffDateAfter, '2050-06-04')
  })

  it('逐月按分取整，不产生明显浮点误差', () => {
    assert.equal(toCents(50000.009), 5_000_001)
    const result = projectLoan({ principal: 10_000.01, annualRate: 2.85, monthlyPayment: 999.99 })
    const principalPaid = result.schedule.reduce((sum, row) => sum + toCents(row.principal), 0)
    assert.equal(principalPaid, toCents(10_000.01))
    assert.equal(result.schedule.at(-1).remaining, 0)
  })

  it('提前还款不能超过当前本金', () => {
    const result = simulatePrepayment({ currentPrincipal: 20_000, prepaymentAmount: 30_000, annualRate: 2.85, currentMinimumPayment: 1_000, officialRemainingMonths: 24 })
    assert.equal(result.appliedPrepayment, 20_000)
    assert.equal(result.principalAfterPrepayment, 0)
    assert.equal(result.estimatedMonthsAfter, 0)
  })

  it('未提前还款时严格使用官方 337 期，不以最低还款额反推基准期数', () => {
    const result = simulatePrepayment({
      currentPrincipal: 1_012_206.88,
      prepaymentAmount: 0,
      annualRate: 2.60,
      currentMinimumPayment: 4_256.67,
      officialRemainingMonths: 337,
    })
    assert.equal(result.officialRemainingMonths, 337)
    assert.equal(result.estimatedMonthsBefore, 337)
    assert.equal(result.estimatedMonthsAfter, 337)
    assert.equal(result.estimatedMonthsSaved, 0)
  })

  it('3 万元提前还款的缩短月份相对于官方 337 期计算', () => {
    const result = simulatePrepayment({
      currentPrincipal: 1_012_206.88,
      prepaymentAmount: 30_000,
      annualRate: 2.60,
      currentMinimumPayment: 4_256.67,
      officialRemainingMonths: 337,
    })
    assert.equal(result.principalAfterPrepayment, 982_206.88)
    assert.equal(result.estimatedMonthsBefore, 337)
    assert.equal(result.estimatedMonthsAfter, 321)
    assert.equal(result.estimatedMonthsSaved, 16)
    assert.equal(result.estimatedInterestSaved, 30_995.22)
  })

  it('本月计划总还款额按分拆出额外提前还款', () => {
    assert.equal(calculateExtraPrepayment(30_000, 4_256.67), 25_743.33)
    assert.equal(calculateExtraPrepayment(4_256.67, 4_256.67), 0)
    assert.equal(calculateExtraPrepayment(3_000, 4_256.67), 0)
  })

  it('3 万元本月总还款按 25,743.33 元额外还本进行规划', () => {
    const extraPrepayment = calculateExtraPrepayment(30_000, 4_256.67)
    const result = simulatePrepayment({
      currentPrincipal: 1_012_206.88,
      prepaymentAmount: extraPrepayment,
      annualRate: 2.60,
      currentMinimumPayment: 4_256.67,
      officialRemainingMonths: 337,
    })
    assert.equal(result.appliedPrepayment, 25_743.33)
    assert.equal(result.principalAfterPrepayment, 986_463.55)
    assert.equal(result.estimatedMonthsAfter, 323)
    assert.equal(result.estimatedMonthsSaved, 14)
    assert.equal(result.estimatedInterestSaved, 26_711.82)
  })

  it('页面保留官方当前数据并明确传入官方期数', () => {
    const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8')
    assert.match(source, /currentBalance: 1_012_206\.88/)
    assert.match(source, /minimumPayment: 4_256\.67/)
    assert.match(source, /annualRate: LOAN_CONTEXT\.annualRate/)
    assert.match(source, /officialRemainingMonths: LOAN_CONTEXT\.officialRemainingMonths/)
  })

  it('把 3 万元提前还款结果实际写入 plannedMonths DOM 元素', () => {
    const result = simulatePrepayment({
      currentPrincipal: 1_012_206.88,
      prepaymentAmount: 30_000,
      annualRate: 2.60,
      currentMinimumPayment: 4_256.67,
      officialRemainingMonths: 337,
    })
    const element = () => ({ textContent: '—' })
    const elements = {
      principalBefore: element(), appliedAmount: element(), principalAfter: element(),
      plannedMonths: element(), interestSaved: element(), monthsSaved: element(), monthsSavedText: element(),
    }

    renderSimulationResult(elements, result, (value) => `${value.toLocaleString('zh-CN')} 元`)

    assert.equal(elements.plannedMonths.textContent, '321 期（规划测算）')
    assert.equal(elements.monthsSaved.textContent, '16 个月')
    assert.notEqual(elements.plannedMonths.textContent, '—')
  })

  it('最低还款不足以覆盖利息时给出不可还清状态', () => {
    const result = projectLoan({ principal: 1_000_000, annualRate: 12, monthlyPayment: 5_000, startDate: '2026-01-01' })
    assert.equal(result.payable, false)
    assert.equal(result.payoffDate, null)
  })

  it('拒绝负数、空值和非数字输入，而不是静默当作 0', () => {
    assert.throws(() => projectLoan({ principal: -1, annualRate: 2.85, monthlyPayment: 5_000 }), /当前剩余本金/)
    assert.throws(() => projectLoan({ principal: 1_000_000, annualRate: NaN, monthlyPayment: 5_000 }), /年利率/)
    assert.throws(() => projectLoan({ principal: 1_000_000, annualRate: 2.85, monthlyPayment: '' }), /当前最低还款额/)
  })
})
