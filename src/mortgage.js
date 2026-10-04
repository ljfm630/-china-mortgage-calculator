/**
 * 生成完整还款计划。所有输入和内部金额均为元，展示时再格式化。
 * @param {{ principal: number, annualRate: number, years: number, method: 'annuity'|'equalPrincipal' }} input
 */
export function calculateMortgage(input) {
  const principal = roundMoney(Number(input.principal))
  const annualRate = Number(input.annualRate)
  const years = Number(input.years)
  const method = input.method

  if (!Number.isFinite(principal) || principal < 0) throw new Error('贷款本金必须是非负数')
  if (!Number.isFinite(annualRate) || annualRate < 0) throw new Error('年利率必须是非负数')
  if (!Number.isFinite(years) || years <= 0) throw new Error('贷款期限必须大于 0')
  if (!['annuity', 'equalPrincipal'].includes(method)) throw new Error('不支持的还款方式')

  const periods = Math.round(years * 12)
  const monthlyRate = annualRate / 100 / 12
  const schedule = method === 'annuity'
    ? annuitySchedule(principal, monthlyRate, periods)
    : equalPrincipalSchedule(principal, monthlyRate, periods)
  const totalPayment = roundMoney(schedule.reduce((sum, row) => sum + row.payment, 0))
  const totalInterest = roundMoney(schedule.reduce((sum, row) => sum + row.interest, 0))

  return {
    principal,
    annualRate,
    monthlyRate,
    periods,
    method,
    monthlyPayment: method === 'annuity' ? schedule[0].payment : undefined,
    firstPayment: schedule[0].payment,
    lastPayment: schedule.at(-1).payment,
    monthlyDecrease: method === 'equalPrincipal' ? roundMoney(principal * monthlyRate / periods) : 0,
    totalInterest,
    totalPayment,
    schedule,
  }
}

/**
 * 按实际还款进度生成一次利率调整后的完整计划。
 * 执行日期所在月份的当期还款开始使用新利率。
 * @param {{ principal: number, originalAnnualRate: number, newAnnualRate: number, years: number, method: 'annuity'|'equalPrincipal', startDate: string, effectiveDate: string }} input
 */
export function calculateVariableRateMortgage(input) {
  const principal = roundMoney(Number(input.principal))
  const originalAnnualRate = Number(input.originalAnnualRate)
  const newAnnualRate = Number(input.newAnnualRate)
  const years = Number(input.years)
  const method = input.method
  validateCommon({ principal, annualRate: originalAnnualRate, years, method })
  if (!Number.isFinite(newAnnualRate) || newAnnualRate < 0) throw new Error('新年利率必须是非负数')

  const start = parseMonth(input.startDate, '贷款开始日期')
  const effective = parseMonth(input.effectiveDate, '新利率执行日期')
  const periods = Math.round(years * 12)
  const switchIndex = monthDifference(start, effective)
  if (switchIndex < 0 || switchIndex >= periods) throw new Error('新利率执行日期必须在贷款期限内且不早于贷款开始日期')

  const originalRate = originalAnnualRate / 100 / 12
  const newRate = newAnnualRate / 100 / 12
  const originalFullSchedule = method === 'annuity'
    ? annuitySchedule(principal, originalRate, periods)
    : equalPrincipalSchedule(principal, originalRate, periods)
  const before = originalFullSchedule.slice(0, switchIndex)
  const remaining = before.length ? before.at(-1).remaining : principal
  const remainingPeriods = periods - switchIndex
  const after = method === 'annuity'
    ? annuitySchedule(remaining, newRate, remainingPeriods)
    : equalPrincipalSchedule(remaining, newRate, remainingPeriods)
  const schedule = [...before, ...after].map((row, index) => ({
    ...row,
    period: index + 1,
    annualRate: index < switchIndex ? originalAnnualRate : newAnnualRate,
    paymentDate: addMonths(start, index),
    rateChanged: index === switchIndex,
  }))
  const totalInterest = roundMoney(schedule.reduce((sum, row) => sum + row.interest, 0))
  const totalPayment = roundMoney(schedule.reduce((sum, row) => sum + row.payment, 0))

  return {
    principal,
    periods,
    method,
    originalAnnualRate,
    newAnnualRate,
    effectiveDate: input.effectiveDate,
    adjustmentPeriod: switchIndex + 1,
    paymentBefore: before[0]?.payment,
    paymentAfter: after[0].payment,
    firstPayment: schedule[0].payment,
    lastPayment: schedule.at(-1).payment,
    totalInterest,
    totalPayment,
    schedule,
  }
}

function annuitySchedule(principal, rate, periods) {
  const payment = roundMoney(rate === 0
    ? principal / periods
    : principal * rate * (1 + rate) ** periods / ((1 + rate) ** periods - 1))
  let remaining = principal
  return Array.from({ length: periods }, (_, index) => {
    const interest = rate === 0 ? 0 : roundMoney(remaining * rate)
    const principalPaid = index === periods - 1 ? remaining : roundMoney(payment - interest)
    remaining = index === periods - 1 ? 0 : roundMoney(Math.max(0, remaining - principalPaid))
    return makeRow(index + 1, roundMoney(principalPaid + interest), principalPaid, interest, remaining)
  })
}

function equalPrincipalSchedule(principal, rate, periods) {
  const regularPrincipal = principal / periods
  let remaining = principal
  return Array.from({ length: periods }, (_, index) => {
    const nextRemaining = index === periods - 1 ? 0 : roundMoney(principal - regularPrincipal * (index + 1))
    const principalPaid = roundMoney(remaining - nextRemaining)
    const interest = roundMoney(remaining * rate)
    remaining = nextRemaining
    return makeRow(index + 1, roundMoney(principalPaid + interest), principalPaid, interest, remaining)
  })
}

function makeRow(period, payment, principal, interest, remaining) {
  return { period, payment, principal, interest, remaining }
}

function validateCommon({ principal, annualRate, years, method }) {
  if (!Number.isFinite(principal) || principal < 0) throw new Error('贷款本金必须是非负数')
  if (!Number.isFinite(annualRate) || annualRate < 0) throw new Error('年利率必须是非负数')
  if (!Number.isFinite(years) || years <= 0) throw new Error('贷款期限必须大于 0')
  if (!['annuity', 'equalPrincipal'].includes(method)) throw new Error('不支持的还款方式')
}

function parseMonth(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error(`请填写${label}`)
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label}无效`)
  }
  return { year, month }
}

function monthDifference(start, end) {
  return (end.year - start.year) * 12 + end.month - start.month
}

function addMonths(start, offset) {
  const date = new Date(Date.UTC(start.year, start.month - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
