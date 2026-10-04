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

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
