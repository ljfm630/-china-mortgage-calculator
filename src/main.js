import { LOAN_CONTEXT, simulatePrepayment, suggestedPrepayment } from './mortgage.js'
import { renderSimulationResult } from './simulation-view.js'
import { calculateExtraPrepayment } from './payment-plan.js'

const STORAGE_KEY = 'gjj-prepayment-planner-v3'
const HISTORY_STORAGE_KEY = 'gjj-repayment-history-v1'
const DEFAULTS = {
  currentBalance: 1_012_206.88,
  minimumPayment: 4_256.67,
  savings: 80_000,
  totalMonthlyPayment: 30_000,
}

const stored = loadStoredState()
const state = { ...DEFAULTS, ...stored }
// 新口径：用户输入“本月计划总还款额”，其中已经包含当月最低还款额。
if (stored.totalMonthlyPayment === undefined) {
  state.totalMonthlyPayment = suggestedPrepayment(state.savings, 50_000)
}
let totalPaymentWasEdited = stored.totalMonthlyPayment !== undefined
let repaymentHistory = loadRepaymentHistory()

const $ = (selector) => document.querySelector(selector)
const requiredElement = (selector) => {
  const element = $(selector)
  if (!element) throw new Error(`页面缺少必需元素：${selector}`)
  return element
}
const money = (value) => `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)} 元`
const initialSimulation = simulatePrepayment({
  currentPrincipal: state.currentBalance,
  prepaymentAmount: calculateExtraPrepayment(state.totalMonthlyPayment, state.minimumPayment),
  annualRate: LOAN_CONTEXT.annualRate,
  currentMinimumPayment: state.minimumPayment,
  officialRemainingMonths: LOAN_CONTEXT.officialRemainingMonths,
})

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
        <div><dt>官方剩余期数</dt><dd id="officialRemainingMonths">${LOAN_CONTEXT.officialRemainingMonths} 期</dd></div>
      </dl>

      <div class="repayment-progress" aria-label="本金偿还进度">
        <div class="progress-head">
          <span>本金偿还进度</span>
          <strong id="principalProgressPercent">—</strong>
        </div>
        <div class="progress-track" aria-hidden="true"><div id="principalProgressFill" class="progress-fill"></div></div>
        <div class="progress-stats">
          <div><span>已偿还本金</span><strong id="principalRepaid">—</strong></div>
          <div><span>当前剩余本金</span><strong id="principalRemaining">—</strong></div>
        </div>
        <small>按原贷款本金与当前贷款余额计算，不代表累计已支付金额。</small>
      </div>

      <div class="loan-records" aria-label="利率记录">
        <h3>利率记录</h3>
        <div class="record-row"><span>2024-10-17—2025-12-31</span><strong>2.85%</strong></div>
        <div class="record-row"><span>2026-01-01 起</span><strong>2.60%</strong></div>
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

      ${moneyInput('totalMonthlyPayment', '本月计划总还款额')}
      <p id="amountWarning" class="field-note" hidden></p>

      <div class="applied-row"><span>本月计划总还款额</span><strong id="totalMonthlyPaymentDisplay">—</strong></div>
      <div class="applied-row"><span>当月最低还款额</span><strong id="minimumPaymentDisplay">—</strong></div>
      <div class="applied-row"><span>额外提前还款</span><strong id="extraPrepaymentDisplay">—</strong></div>

      <div class="principal-flow" aria-label="提前还款前后本金">
        <div><span>提前还款前本金</span><strong id="principalBefore">—</strong></div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div><span>提前还款后本金</span><strong id="principalAfter">—</strong></div>
      </div>
      <div class="applied-row"><span>实际额外提前还款</span><strong id="appliedAmount">—</strong></div>
      <div class="applied-row"><span>规划测算剩余期数</span><strong id="plannedMonths">${initialSimulation.estimatedMonthsAfter} 期（规划测算）</strong></div>

      <div class="estimate-grid">
        <div><span>预计节省利息</span><strong id="interestSaved">—</strong></div>
        <div><span>预计可缩短</span><strong id="monthsSaved">—</strong></div>
      </div>
      <p class="assumption">按当前条件规划测算，预计可缩短约 <b id="monthsSavedText">—</b>。测算结果仅用于个人还款规划，实际最低还款额、剩余期限及利息以国管公积金中心后续核定为准。</p>
    </section>

    <section class="card" aria-labelledby="history-title">
      <div class="section-heading">
        <span class="section-icon" aria-hidden="true">记</span>
        <div><span class="eyebrow">长期还贷档案</span><h2 id="history-title">历史还款记录</h2></div>
      </div>

      <div class="history-form">
        <label class="money-field">
          <span>还款日期</span>
          <div class="money-input"><input id="repaymentRecordDate" type="date" aria-label="还款日期"></div>
        </label>
        ${plainMoneyInput('repaymentRecordTotal', '本月实际总还款额')}
        ${plainMoneyInput('repaymentRecordBalance', '还款后贷款余额')}
      </div>

      <div class="history-preview">
        <span>按当前最低还款额计算，额外提前还款</span>
        <strong id="repaymentRecordExtra">—</strong>
      </div>

      <button id="saveRepaymentRecord" class="primary-button" type="button">保存这笔还款</button>
      <p id="repaymentRecordHint" class="field-note" hidden></p>
      <div id="repaymentHistoryList" class="history-list"></div>
      <p class="history-local-note">记录仅保存在当前浏览器中。以后可再增加导出与备份功能。</p>
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

function plainMoneyInput(id, label) {
  return `<label class="money-field">
    <span>${label}</span>
    <div class="money-input"><input id="${id}" type="number" min="0" step="0.01" inputmode="decimal" aria-label="${label}"><b>元</b></div>
  </label>`
}

const simulationElements = {
  principalBefore: requiredElement('#principalBefore'),
  appliedAmount: requiredElement('#appliedAmount'),
  principalAfter: requiredElement('#principalAfter'),
  plannedMonths: requiredElement('#plannedMonths'),
  interestSaved: requiredElement('#interestSaved'),
  monthsSaved: requiredElement('#monthsSaved'),
  monthsSavedText: requiredElement('#monthsSavedText'),
}

requiredElement('#repaymentRecordDate').value = todayLocalDate()
requiredElement('#repaymentRecordTotal').value = state.totalMonthlyPayment
requiredElement('#repaymentRecordBalance').value = state.currentBalance
renderHistory()
renderRecordExtra()

function render() {
  document.querySelectorAll('[data-key]').forEach((input) => {
    if (document.activeElement !== input) input.value = state[input.dataset.key]
  })

  const originalPrincipal = LOAN_CONTEXT.originalPrincipal
  const repaidPrincipal = Math.max(0, originalPrincipal - state.currentBalance)
  const progressPercent = originalPrincipal > 0
    ? Math.min(100, Math.max(0, repaidPrincipal / originalPrincipal * 100))
    : 0
  $('#principalRepaid').textContent = money(repaidPrincipal)
  $('#principalRemaining').textContent = money(state.currentBalance)
  $('#principalProgressPercent').textContent = `${progressPercent.toFixed(1)}%`
  $('#principalProgressFill').style.width = `${progressPercent.toFixed(1)}%`

  const available = suggestedPrepayment(state.savings, 50_000)
  $('#availableAmount').textContent = money(available)

  const totalMonthlyPayment = Math.max(0, state.totalMonthlyPayment)
  const extraPrepayment = calculateExtraPrepayment(totalMonthlyPayment, state.minimumPayment)
  $('#totalMonthlyPaymentDisplay').textContent = money(totalMonthlyPayment)
  $('#minimumPaymentDisplay').textContent = money(state.minimumPayment)
  $('#extraPrepaymentDisplay').textContent = money(extraPrepayment)

  const result = simulatePrepayment({
    currentPrincipal: state.currentBalance,
    prepaymentAmount: extraPrepayment,
    annualRate: LOAN_CONTEXT.annualRate,
    currentMinimumPayment: state.minimumPayment,
    officialRemainingMonths: LOAN_CONTEXT.officialRemainingMonths,
  })

  renderSimulationResult(simulationElements, result, money)

  const warning = $('#amountWarning')
  const belowMinimum = totalMonthlyPayment < state.minimumPayment
  const aboveAvailable = extraPrepayment > available
  const abovePrincipal = extraPrepayment > state.currentBalance
  warning.hidden = !belowMinimum && !aboveAvailable && !abovePrincipal
  warning.textContent = belowMinimum
    ? '本月计划总还款额低于当前最低还款额，请至少按系统最低还款额还款。'
    : abovePrincipal
      ? `额外提前还款超过当前本金，测算按 ${money(state.currentBalance)} 计算。`
      : `额外提前还款超过当前可用资金 ${money(available)}，请确认不会动用安全储备。`

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function renderRecordExtra() {
  const total = Math.max(0, Number($('#repaymentRecordTotal').value) || 0)
  $('#repaymentRecordExtra').textContent = money(calculateExtraPrepayment(total, state.minimumPayment))
}

function renderHistory() {
  const list = $('#repaymentHistoryList')
  if (!repaymentHistory.length) {
    list.innerHTML = '<div class="history-empty">还没有记录。完成一次实际还款后，可以从这里开始积累你的还贷时间线。</div>'
    return
  }

  const rows = [...repaymentHistory]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .map((record) => `
      <article class="history-item">
        <div class="history-date">${record.date}</div>
        <div class="history-item-grid">
          <div><span>总还款</span><strong>${money(record.totalPayment)}</strong></div>
          <div><span>额外提前还款</span><strong>${money(record.extraPrepayment)}</strong></div>
          <div><span>还款后余额</span><strong>${money(record.endingBalance)}</strong></div>
        </div>
        <button type="button" class="history-delete" data-history-id="${record.id}">删除</button>
      </article>
    `)
    .join('')
  list.innerHTML = rows
}

function saveRepaymentHistory() {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(repaymentHistory))
}

function loadRepaymentHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY))
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function todayLocalDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
  if (event.target.id === 'repaymentRecordTotal') {
    renderRecordExtra()
    return
  }

  const key = event.target.dataset.key
  if (!key) return
  state[key] = Math.max(0, Number(event.target.value) || 0)
  if (key === 'totalMonthlyPayment') totalPaymentWasEdited = true
  if (key === 'savings' && !totalPaymentWasEdited) {
    state.totalMonthlyPayment = suggestedPrepayment(state.savings, 50_000)
  }
  render()
})

document.addEventListener('click', (event) => {
  if (event.target.id === 'saveRepaymentRecord') {
    const date = $('#repaymentRecordDate').value
    const totalPayment = Number($('#repaymentRecordTotal').value)
    const endingBalance = Number($('#repaymentRecordBalance').value)
    const hint = $('#repaymentRecordHint')

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(totalPayment) || totalPayment < 0 || !Number.isFinite(endingBalance) || endingBalance < 0) {
      hint.hidden = false
      hint.textContent = '请填写有效的还款日期、总还款额和还款后贷款余额。'
      return
    }

    const extraPrepayment = calculateExtraPrepayment(totalPayment, state.minimumPayment)
    repaymentHistory.push({
      id: `${Date.now()}-${repaymentHistory.length + 1}`,
      date,
      totalPayment,
      minimumPayment: state.minimumPayment,
      extraPrepayment,
      endingBalance,
      createdAt: Date.now(),
    })
    saveRepaymentHistory()
    renderHistory()
    hint.hidden = false
    hint.textContent = '已保存这笔还款记录。'
    return
  }

  const historyId = event.target.dataset?.historyId
  if (historyId) {
    repaymentHistory = repaymentHistory.filter((record) => record.id !== historyId)
    saveRepaymentHistory()
    renderHistory()
  }
})

render()
