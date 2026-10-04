import { LOAN_CONTEXT, simulatePrepayment, suggestedPrepayment } from './mortgage.js'

const STORAGE_KEY = 'gjj-prepayment-planner-v2'
const DEFAULTS = {
  currentBalance: 1_012_206.88,
  minimumPayment: 4_256.67,
  savings: 80_000,
  prepaymentAmount: 30_000,
}

const stored = loadStoredState()
const state = { ...DEFAULTS, ...stored }
// 兼容上一版字段；没有保存过本阶段输入时，默认使用当前可提前还款金额。
if (stored.prepaymentAmount === undefined) {
  state.prepaymentAmount = suggestedPrepayment(state.savings, 50_000)
}
let prepaymentWasEdited = stored.prepaymentAmount !== undefined

const $ = (selector) => document.querySelector(selector)
const money = (value) => `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)} 元`

$('#app').innerHTML = `
  <header class="page-header">
    <span class="eyebrow">个人工具</span>
    <h1>我的公积金还款规划</h1>
    <p>以国管公积金系统显示的数据为准，做一份简单的个人测算。</p>
  </header>

  <main>
    <section class="card" aria-labelledby="loan-title">
      <div class="section-heading">
        <span class="section-icon" aria-hidden="true">贷</span>
        <div><span class="eyebrow">国管公积金系统实际数据</span><h2 id="loan-title">当前贷款</h2></div>
      </div>

      <div class="input-list">
        ${moneyInput('currentBalance', '当前贷款余额', '以公积金系统实际显示为准')}
        ${moneyInput('minimumPayment', '当前最低还款额', '以公积金系统实际显示为准')}
      </div>

      <dl class="facts">
        <div><dt>年利率</dt><dd>${LOAN_CONTEXT.annualRate}%</dd></div>
        <div><dt>放款日期</dt><dd>${LOAN_CONTEXT.loanDate}</dd></div>
        <div><dt>还款方式</dt><dd>国管公积金${LOAN_CONTEXT.repaymentMethod}</dd></div>
        <div><dt>原贷款金额</dt><dd>${money(LOAN_CONTEXT.originalPrincipal)}</dd></div>
        <div><dt>原贷款期限</dt><dd>${LOAN_CONTEXT.originalTermMonths} 期</dd></div>
        <div><dt>官方剩余期数</dt><dd>${LOAN_CONTEXT.officialRemainingMonths} 期</dd></div>
      </dl>

      <div class="loan-records" aria-label="贷款记录和利率记录">
        <h3>贷款记录 / 利率记录</h3>
        <div class="record-row"><span>2024-10-17—2025-12-31</span><strong>2.85%</strong></div>
        <div class="record-row"><span>2026-01-01 起</span><strong>2.60%</strong></div>
        <div class="record-row"><span>2026 年利率调整后</span><strong>提前还款 ${money(100_000)}</strong></div>
      </div>
    </section>

    <section class="card" aria-labelledby="fund-title">
      <div class="section-heading">
        <span class="section-icon green-icon" aria-hidden="true">¥</span>
        <div><span class="eyebrow">现金安排</span><h2 id="fund-title">我的资金</h2></div>
      </div>

      ${moneyInput('savings', '当前可支配存款')}
      <div class="reserve-row"><span>安全储备金</span><strong>${money(50_000)}</strong></div>
      <div class="available-result">
        <span>可用于提前还款金额</span>
        <strong id="availableAmount">—</strong>
        <small>仅使用超过 50,000 元安全储备的部分</small>
      </div>
    </section>

    <section class="card" aria-labelledby="simulation-title">
      <div class="section-heading">
        <span class="section-icon" aria-hidden="true">算</span>
        <div><span class="eyebrow">规划测算结果</span><h2 id="simulation-title">如果现在提前还款</h2></div>
      </div>

      ${moneyInput('prepaymentAmount', '本次提前还款金额')}
      <p id="amountWarning" class="field-note" hidden></p>

      <div class="principal-flow" aria-label="提前还款前后本金">
        <div><span>提前还款前本金</span><strong id="principalBefore">—</strong></div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div><span>提前还款后本金</span><strong id="principalAfter">—</strong></div>
      </div>
      <div class="applied-row"><span>本次提前还款</span><strong id="appliedAmount">—</strong></div>

      <div class="estimate-grid">
        <div><span>预计节省利息</span><strong id="interestSaved">—</strong></div>
        <div><span>预计提前还清</span><strong id="monthsSaved">—</strong></div>
      </div>
      <p class="assumption">按当前年利率和最低还款额保持不变进行逐月估算。</p>
    </section>
  </main>

  <footer>本页面为个人还款规划工具。实际贷款余额、最低还款额、利息及提前还款规则，以国管住房公积金管理中心系统为准。</footer>
`

function moneyInput(key, label, hint = '') {
  return `<label class="money-field">
    <span>${label}</span>
    <div class="money-input"><input id="${key}" data-key="${key}" type="number" min="0" step="0.01" inputmode="decimal" aria-label="${label}"><b>元</b></div>
    ${hint ? `<small>${hint}</small>` : ''}
  </label>`
}

function render() {
  document.querySelectorAll('[data-key]').forEach((input) => {
    if (document.activeElement !== input) input.value = state[input.dataset.key]
  })

  const available = suggestedPrepayment(state.savings, 50_000)
  $('#availableAmount').textContent = money(available)

  const requested = Math.max(0, state.prepaymentAmount)
  const result = simulatePrepayment({
    currentPrincipal: state.currentBalance,
    prepaymentAmount: requested,
    annualRate: LOAN_CONTEXT.annualRate,
    currentMinimumPayment: state.minimumPayment,
  })

  $('#principalBefore').textContent = money(result.principalBeforePrepayment)
  $('#appliedAmount').textContent = money(result.appliedPrepayment)
  $('#principalAfter').textContent = money(result.principalAfterPrepayment)
  $('#interestSaved').textContent = result.estimatedInterestSaved === null ? '待完善' : money(result.estimatedInterestSaved)
  $('#monthsSaved').textContent = result.estimatedMonthsSaved === null ? '待完善' : `${result.estimatedMonthsSaved} 个月`

  const warning = $('#amountWarning')
  const aboveAvailable = requested > available
  const abovePrincipal = requested > state.currentBalance
  warning.hidden = !aboveAvailable && !abovePrincipal
  warning.textContent = abovePrincipal
    ? `输入金额超过当前本金，测算按 ${money(state.currentBalance)} 计算。`
    : `该金额超过当前可用资金 ${money(available)}，请确认不会动用安全储备。`

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function loadStoredState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

document.addEventListener('input', (event) => {
  const key = event.target.dataset.key
  if (!key) return
  state[key] = Math.max(0, Number(event.target.value) || 0)
  if (key === 'prepaymentAmount') prepaymentWasEdited = true
  if (key === 'savings' && !prepaymentWasEdited) {
    state.prepaymentAmount = suggestedPrepayment(state.savings, 50_000)
  }
  render()
})

render()
