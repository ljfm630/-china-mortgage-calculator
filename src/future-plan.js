import { fromCents, projectLoan, toCents } from './mortgage.js'
import { calculateExtraPrepayment } from './payment-plan.js'

function parseMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) throw new TypeError('计划月份格式应为 YYYY-MM')
  const [year, month] = value.split('-').map(Number)
  if (month < 1 || month > 12) throw new TypeError('计划月份无效')
  return year * 12 + month - 1
}

function monthlyStep(balanceCents, annualRate, minimumPaymentCents, extraPrepaymentCents = 0) {
  const appliedExtra = Math.min(balanceCents, Math.max(0, extraPrepaymentCents))
  let balance = balanceCents - appliedExtra
  if (balance === 0) {
    return { payable: true, balance: 0, interest: 0, appliedExtra }
  }

  const interest = Math.round(balance * (Number(annualRate) / 1200))
  if (minimumPaymentCents <= interest) {
    return { payable: false, balance, interest, appliedExtra }
  }
  const principalPaid = Math.min(balance, minimumPaymentCents - interest)
  balance -= principalPaid
  return { payable: true, balance, interest, appliedExtra }
}

export function simulateFuturePlan({
  currentPrincipal,
  annualRate,
  currentMinimumPayment,
  officialRemainingMonths,
  startMonth,
  entries,
}) {
  const startIndex = parseMonth(startMonth)
  const minimumPaymentCents = toCents(currentMinimumPayment)
  let balance = toCents(currentPrincipal)
  let elapsedMonths = 0
  let planInterestCents = 0
  let previousCumulativeSavedCents = 0
  const steps = []

  const baseline = projectLoan({
    principal: currentPrincipal,
    annualRate,
    monthlyPayment: currentMinimumPayment,
  })
  if (!baseline.payable) {
    return { payable: false, steps, estimatedMonthsAfter: null, estimatedMonthsSaved: null, estimatedInterestSaved: null }
  }
  const baselineInterestCents = toCents(baseline.totalInterest)

  const normalized = [...entries]
    .map((entry) => ({
      month: entry.month,
      monthIndex: parseMonth(entry.month),
      totalPayment: Number(entry.totalPayment),
    }))
    .sort((a, b) => a.monthIndex - b.monthIndex)

  for (const entry of normalized) {
    if (entry.monthIndex < startIndex) throw new RangeError('计划月份不能早于当前月份')
    if (!Number.isFinite(entry.totalPayment) || entry.totalPayment < Number(currentMinimumPayment)) {
      throw new RangeError('计划总还款额不能低于当前最低还款额')
    }

    while (startIndex + elapsedMonths < entry.monthIndex && balance > 0) {
      const normal = monthlyStep(balance, annualRate, minimumPaymentCents)
      if (!normal.payable) {
        return { payable: false, steps, estimatedMonthsAfter: null, estimatedMonthsSaved: null, estimatedInterestSaved: null }
      }
      balance = normal.balance
      planInterestCents += normal.interest
      elapsedMonths += 1
    }

    if (balance <= 0) break

    const extraPrepayment = calculateExtraPrepayment(entry.totalPayment, currentMinimumPayment)
    const planned = monthlyStep(balance, annualRate, minimumPaymentCents, toCents(extraPrepayment))
    if (!planned.payable) {
      return { payable: false, steps, estimatedMonthsAfter: null, estimatedMonthsSaved: null, estimatedInterestSaved: null }
    }
    balance = planned.balance
    planInterestCents += planned.interest
    elapsedMonths += 1

    const stepTail = projectLoan({
      principal: fromCents(balance),
      annualRate,
      monthlyPayment: currentMinimumPayment,
    })
    const cumulativeSavedCents = stepTail.payable
      ? Math.max(0, baselineInterestCents - (planInterestCents + toCents(stepTail.totalInterest)))
      : previousCumulativeSavedCents
    const marginalSavedCents = Math.max(0, cumulativeSavedCents - previousCumulativeSavedCents)
    previousCumulativeSavedCents = cumulativeSavedCents

    steps.push({
      month: entry.month,
      totalPayment: entry.totalPayment,
      extraPrepayment: fromCents(planned.appliedExtra),
      endingBalance: fromCents(balance),
      estimatedInterestSaved: fromCents(marginalSavedCents),
      cumulativeInterestSaved: fromCents(cumulativeSavedCents),
    })
  }

  const tail = projectLoan({
    principal: fromCents(balance),
    annualRate,
    monthlyPayment: currentMinimumPayment,
  })

  if (!tail.payable) {
    return { payable: false, steps, estimatedMonthsAfter: null, estimatedMonthsSaved: null, estimatedInterestSaved: null }
  }

  const plannedModelMonths = elapsedMonths + tail.months
  const modelMonthsSaved = Math.max(0, baseline.months - plannedModelMonths)
  const estimatedMonthsAfter = Math.max(0, Number(officialRemainingMonths) - modelMonthsSaved)
  const plannedInterestCents = planInterestCents + toCents(tail.totalInterest)
  const estimatedInterestSaved = fromCents(Math.max(0, baselineInterestCents - plannedInterestCents))

  return {
    payable: true,
    steps,
    estimatedMonthsAfter,
    estimatedMonthsSaved: modelMonthsSaved,
    estimatedInterestSaved,
  }
}
