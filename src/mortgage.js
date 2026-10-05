const MAX_MONTHS = 1200

/** 金额统一先转成“分”，避免在逐月测算中累积二进制浮点误差。 */
export function toCents(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0
}

export function fromCents(value) {
  return value / 100
}

/**
 * 以用户从公积金系统抄录的余额和最低还款额为基准，做固定利率逐月规划。
 * 这不是对国管公积金自由还款最低还款额算法的复刻。
 */
export function projectLoan({ principal, annualRate, monthlyPayment, extraPrincipal = 0, monthlyExtra = 0, startDate }) {
  assertNonNegativeMoney(principal, '当前剩余本金')
  assertNonNegativeMoney(extraPrincipal, '提前还款金额')
  assertNonNegativeMoney(monthlyExtra, '每月额外还款金额')
  assertNonNegativeMoney(monthlyPayment, '当前最低还款额')
  assertNonNegativeNumber(annualRate, '年利率')

  const currentPrincipal = toCents(principal)
  const prepayment = Math.min(currentPrincipal, toCents(extraPrincipal))
  let balance = currentPrincipal - prepayment
  const payment = toCents(monthlyPayment)
  const extra = toCents(monthlyExtra)
  const monthlyRate = Number(annualRate) / 1200
  let totalInterest = 0
  let months = 0
  const schedule = []

  while (balance > 0 && months < MAX_MONTHS) {
    const interest = Math.round(balance * monthlyRate)
    const available = payment + extra
    if (available <= interest) return { payable: false, balance: fromCents(balance), totalInterest: fromCents(totalInterest), months: Infinity, payoffDate: null, schedule }
    const principalPaid = Math.min(balance, available - interest)
    const paid = principalPaid + interest
    balance -= principalPaid
    totalInterest += interest
    months += 1
    schedule.push({ month: months, payment: fromCents(paid), principal: fromCents(principalPaid), interest: fromCents(interest), remaining: fromCents(balance) })
  }

  const date = parseLocalDate(startDate)
  const payoffDate = date ? addMonthsClamped(date, months) : null
  return {
    payable: balance === 0,
    principalBeforePrepayment: fromCents(currentPrincipal),
    prepayment: fromCents(prepayment),
    principalAfterPrepayment: fromCents(currentPrincipal - prepayment),
    balance: fromCents(balance),
    totalInterest: fromCents(totalInterest),
    months: balance === 0 ? months : Infinity,
    payoffDate: balance === 0 && payoffDate ? formatDate(payoffDate) : null,
    schedule,
  }
}

/**
 * 比较“仅按当前最低还款额”与“现在提前还一笔后仍按该金额还款”两种规划。
 * 当前余额已经包含所有历史还款影响，因此不会再次扣除 2026 年的 10 万元。
 */
export function simulatePrepayment({ currentPrincipal, prepaymentAmount, annualRate, currentMinimumPayment, officialRemainingMonths, startDate }) {
  assertPositiveInteger(officialRemainingMonths, '官方剩余期数')
  const common = {
    principal: currentPrincipal,
    annualRate,
    monthlyPayment: currentMinimumPayment,
    startDate,
  }
  const baseline = projectLoan(common)
  const afterPrepayment = projectLoan({ ...common, extraPrincipal: prepaymentAmount })
  const comparable = baseline.payable && afterPrepayment.payable
  const plannedRemainingMonths = afterPrepayment.prepayment === 0
    ? officialRemainingMonths
    : afterPrepayment.months
  const estimatedMonthsSaved = afterPrepayment.payable
    ? Math.max(0, officialRemainingMonths - plannedRemainingMonths)
    : null
  const projectionStartDate = parseLocalDate(startDate)
  const officialPayoffDate = projectionStartDate ? addMonthsClamped(projectionStartDate, officialRemainingMonths) : null

  return {
    principalBeforePrepayment: afterPrepayment.principalBeforePrepayment,
    appliedPrepayment: afterPrepayment.prepayment,
    principalAfterPrepayment: afterPrepayment.principalAfterPrepayment,
    estimatedInterestBefore: baseline.totalInterest,
    estimatedInterestAfter: afterPrepayment.totalInterest,
    estimatedInterestSaved: comparable ? fromCents(Math.max(0, toCents(baseline.totalInterest) - toCents(afterPrepayment.totalInterest))) : null,
    officialRemainingMonths,
    estimatedMonthsBefore: officialRemainingMonths,
    estimatedMonthsAfter: plannedRemainingMonths,
    estimatedMonthsSaved,
    estimatedPayoffDateBefore: officialPayoffDate ? formatDate(officialPayoffDate) : null,
    estimatedPayoffDateAfter: afterPrepayment.payoffDate,
    payable: afterPrepayment.payable,
  }
}

export function suggestedPrepayment(savings, reserve) {
  return fromCents(Math.max(0, toCents(savings) - toCents(reserve)))
}

export function monthlyCashFlow({ salary, housingFund, otherIncome, livingExpenses, otherExpenses, minimumPayment }) {
  const income = toCents(salary) + toCents(housingFund) + toCents(otherIncome)
  const expenses = toCents(livingExpenses) + toCents(otherExpenses) + toCents(minimumPayment)
  return fromCents(income - expenses)
}

export function monthsUntilReserve(savings, reserve, monthlySurplus) {
  const gap = toCents(reserve) - toCents(savings)
  if (gap <= 0) return 0
  const surplus = Math.round(Number(monthlySurplus) * 100)
  return surplus > 0 ? Math.ceil(gap / surplus) : Infinity
}

function parseLocalDate(value) {
  if (value === undefined || value === null || value === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function addMonthsClamped(date, months) {
  const result = new Date(date)
  const desiredDay = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(desiredDay, lastDay))
  return result
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function assertNonNegativeMoney(value, label) {
  assertNonNegativeNumber(value, label)
}

function assertNonNegativeNumber(value, label) {
  if (typeof value === 'string' && value.trim() === '') throw new TypeError(`${label}必须是非负数`)
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label}必须是非负数`)
}

function assertPositiveInteger(value, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label}必须是正整数`)
}
