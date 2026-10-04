export const MY_LOAN_STORAGE_KEY = 'china-mortgage-calculator:my-loan:v2.1'

export const DEFAULT_MY_LOAN_PROFILE = Object.freeze({
  homeName: '潮白水悦共有产权房',
  housePrice: 1_550_465,
  originalPrincipal: 1_160_000,
  loanType: '中央国家机关住房公积金个人住房贷款（国管公积金）',
  repaymentMethod: '自由还款',
  disbursementDate: '2024-10-17',
  firstPaymentDate: '2024-11-17',
  originalPeriods: 360,
  originalTermTier: 'over5Years',
  remainingPrincipal: 1_012_206.88,
  remainingPeriods: 337,
  officialMinimumPayment: 4_256.67,
  paymentDay: 17,
  cashSafetyLine: 50_000,
  availableSavings: 58_000,
  reservedExpenses: 0,
  simulationExtraPayment: 8_000,
  repaymentHistory: [
    {
      effectiveMonth: '2025-01',
      extraPrincipal: 100_000,
      minimumPaymentReassessed: true,
      note: '提前偿还10万元，之后最低还款额由国管公积金系统按剩余本金重新调整',
    },
  ],
  rateHistory: [
    { effectiveDate: '2024-10-17', annualRate: 2.85 },
    { effectiveDate: '2026-01-01', annualRate: 2.6 },
  ],
  minimumPaymentPolicy: {
    january2026MinimumPayment: 4_256.67,
    reassessmentFrom: '2026-02-01',
    source: '用户提供的国管公积金系统实际数据',
  },
  taxDeduction: {
    eligible: true,
    firstEligibleDate: '',
    monthlyStandard: 1_000,
    usedMonths: 0,
    maximumMonths: 240,
  },
  settings: {
    repaymentAdjustment: 'currentMonthOnly',
  },
})

export function createDefaultMyLoanProfile() {
  return structuredClone(DEFAULT_MY_LOAN_PROFILE)
}

export function calculateSafeExtraPayment({ availableSavings, cashSafetyLine, reservedExpenses }) {
  const savings = toNonNegativeMoney(availableSavings, '当前可用存款')
  const safetyLine = toNonNegativeMoney(cashSafetyLine, '现金安全线')
  const expenses = toNonNegativeMoney(reservedExpenses, '近期预留支出')
  return roundMoney(Math.max(0, savings - safetyLine - expenses))
}

export function getRateForDate(rateHistory, date) {
  const target = parseDate(date, '计息日期')
  const history = [...rateHistory]
    .map((item) => ({ ...item, parsedDate: parseDate(item.effectiveDate, '利率执行日期') }))
    .sort((a, b) => a.parsedDate - b.parsedDate)
  const matched = history.filter((item) => item.parsedDate <= target).at(-1)
  if (!matched || !Number.isFinite(Number(matched.annualRate)) || Number(matched.annualRate) < 0) {
    throw new Error('计息日期没有可用的政策利率配置')
  }
  return Number(matched.annualRate)
}

export function calculateSegmentedPeriodInterest(balance, startDate, endDate, rateHistory) {
  const principal = toNonNegativeMoney(balance, '计息本金')
  const start = parseDate(startDate, '计息开始日期')
  const end = parseDate(endDate, '计息结束日期')
  if (end <= start) throw new Error('计息结束日期必须晚于开始日期')
  const changes = rateHistory
    .map((item) => ({ ...item, date: parseDate(item.effectiveDate, '利率执行日期') }))
    .filter((item) => item.date > start && item.date < end)
    .sort((a, b) => a.date - b.date)
  const boundaries = [start, ...changes.map((item) => item.date), end]
  let interest = 0
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const from = boundaries[index]
    const to = boundaries[index + 1]
    const days = Math.round((to - from) / 86_400_000)
    const rate = getRateForDate(rateHistory, formatDate(from))
    interest += principal * (rate / 100) * days / 365
  }
  return roundMoney(interest)
}

/**
 * 自由还款估算：使用用户提供的官方最低还款额作为每月基准，绝不反推或冒充官方最低还款算法。
 * 额外还款只加入首期，后续恢复用户提供的最低还款额；最后一期偿清全部余额。
 */
export function simulateFreedomRepayment(profile, extraPayment = 0) {
  const principal = toNonNegativeMoney(profile.remainingPrincipal, '当前贷款余额')
  const minimumPayment = toNonNegativeMoney(profile.officialMinimumPayment, '当前最低还款额')
  const periods = Math.trunc(Number(profile.remainingPeriods))
  const extra = Math.min(toNonNegativeMoney(extraPayment, '额外还款金额'), principal)
  if (!Number.isInteger(periods) || periods <= 0) throw new Error('当前剩余期限必须是正整数')
  const nextPaymentDate = deriveNextPaymentDate(profile)
  const annualRate = getRateForDate(profile.rateHistory, nextPaymentDate)

  let remaining = principal
  let totalInterest = 0
  const schedule = []
  for (let index = 0; index < periods && remaining > 0; index += 1) {
    const paymentDate = addMonths(nextPaymentDate, index)
    const previousPaymentDate = addMonths(nextPaymentDate, index - 1)
    const interest = calculateSegmentedPeriodInterest(remaining, previousPaymentDate, paymentDate, profile.rateHistory)
    if (minimumPayment <= interest) throw new Error('最低还款额不足以覆盖当期利息，无法完成估算')
    const requestedPayment = index === periods - 1
      ? roundMoney(remaining + interest)
      : roundMoney(minimumPayment + (index === 0 ? extra : 0))
    const payment = Math.min(requestedPayment, roundMoney(remaining + interest))
    const principalPaid = roundMoney(Math.min(remaining, Math.max(0, payment - interest)))
    remaining = roundMoney(Math.max(0, remaining - principalPaid))
    totalInterest = roundMoney(totalInterest + interest)
    schedule.push({
      period: index + 1,
      payment,
      principal: principalPaid,
      interest,
      remaining,
      annualRate: getRateForDate(profile.rateHistory, paymentDate),
      paymentDate,
    })
  }

  if (remaining > 0) {
    const paymentDate = addMonths(nextPaymentDate, schedule.length)
    const interest = calculateSegmentedPeriodInterest(remaining, addMonths(nextPaymentDate, schedule.length - 1), paymentDate, profile.rateHistory)
    schedule.push({
      period: schedule.length + 1,
      payment: roundMoney(remaining + interest),
      principal: remaining,
      interest,
      remaining: 0,
      annualRate: getRateForDate(profile.rateHistory, paymentDate),
      paymentDate,
      contractualBalloon: true,
    })
    totalInterest = roundMoney(totalInterest + interest)
  }

  return {
    extraPayment: extra,
    remainingAfterExtra: schedule[0]?.remaining ?? 0,
    months: schedule.length,
    totalInterest,
    payoffDate: schedule.at(-1)?.paymentDate ?? nextPaymentDate,
    schedule,
    appliedAnnualRate: annualRate,
    originalTermTier: profile.originalTermTier,
    isEstimate: true,
  }
}

export function compareFreedomRepayment(profile, extraPayment) {
  const baseline = simulateFreedomRepayment(profile, 0)
  const accelerated = simulateFreedomRepayment(profile, extraPayment)
  return {
    baseline,
    accelerated,
    interestSaved: roundMoney(Math.max(0, baseline.totalInterest - accelerated.totalInterest)),
    monthsSaved: Math.max(0, baseline.months - accelerated.months),
  }
}

export function loadMyLoanProfile(storage = globalThis.localStorage) {
  const defaults = createDefaultMyLoanProfile()
  if (!storage) return defaults
  try {
    const saved = JSON.parse(storage.getItem(MY_LOAN_STORAGE_KEY))
    return saved ? mergeProfile(defaults, saved) : defaults
  } catch {
    return defaults
  }
}

export function saveMyLoanProfile(profile, storage = globalThis.localStorage) {
  storage?.setItem(MY_LOAN_STORAGE_KEY, JSON.stringify(profile))
}

export function resetMyLoanProfile(storage = globalThis.localStorage) {
  storage?.removeItem(MY_LOAN_STORAGE_KEY)
  return createDefaultMyLoanProfile()
}

function mergeProfile(defaults, saved) {
  return {
    ...defaults,
    ...saved,
    rateHistory: Array.isArray(saved.rateHistory) ? saved.rateHistory : defaults.rateHistory,
    repaymentHistory: Array.isArray(saved.repaymentHistory) ? saved.repaymentHistory : defaults.repaymentHistory,
    taxDeduction: { ...defaults.taxDeduction, ...saved.taxDeduction },
    minimumPaymentPolicy: { ...defaults.minimumPaymentPolicy, ...saved.minimumPaymentPolicy },
    settings: { ...defaults.settings, ...saved.settings },
  }
}

function toNonNegativeMoney(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}必须是非负数`)
  return roundMoney(number)
}

function parseDate(value, label) {
  const date = new Date(`${value}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(date.getTime())) throw new Error(`${label}无效`)
  return date
}

function addMonths(start, months) {
  const date = typeof start === 'string' ? parseDate(start, '日期') : start
  const day = date.getUTCDate()
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, day))
  return formatDate(result)
}

function deriveNextPaymentDate(profile) {
  const paidPeriods = Math.max(0, Number(profile.originalPeriods) - Number(profile.remainingPeriods))
  return addMonths(profile.firstPaymentDate, paidPeriods)
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
