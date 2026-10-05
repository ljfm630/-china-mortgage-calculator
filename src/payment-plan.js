import { fromCents, toCents } from './mortgage.js'

export function calculateExtraPrepayment(totalMonthlyPayment, minimumPayment) {
  return fromCents(Math.max(0, toCents(totalMonthlyPayment) - toCents(minimumPayment)))
}
