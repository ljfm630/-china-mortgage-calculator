/** 将测算结果写入页面。独立函数便于验证真实 DOM 赋值，而不只检查静态文案。 */
export function renderSimulationResult(elements, result, formatMoney) {
  elements.principalBefore.textContent = formatMoney(result.principalBeforePrepayment)
  elements.appliedAmount.textContent = formatMoney(result.appliedPrepayment)
  elements.principalAfter.textContent = formatMoney(result.principalAfterPrepayment)
  elements.plannedMonths.textContent = Number.isFinite(result.estimatedMonthsAfter)
    ? `${result.estimatedMonthsAfter} 期（规划测算）`
    : '待完善'
  elements.interestSaved.textContent = result.estimatedInterestSaved === null
    ? '待完善'
    : formatMoney(result.estimatedInterestSaved)
  const monthsSaved = result.estimatedMonthsSaved === null
    ? '待完善'
    : `${result.estimatedMonthsSaved} 个月`
  elements.monthsSaved.textContent = monthsSaved
  elements.monthsSavedText.textContent = monthsSaved
}
