import { projectLoan, simulatePrepayment, suggestedPrepayment } from './mortgage.js'
import { renderSimulationResult } from './simulation-view.js'
import { calculateExtraPrepayment } from './payment-plan.js'
import { simulateFuturePlan } from './future-plan.js'

const STORAGE_KEY = 'gjj-prepayment-planner-v3'
const PROFILE_STORAGE_KEY = 'gjj-loan-profile-v1'
const FUTURE_PLAN_STORAGE_KEY = 'gjj-future-payment-plan-v1'
const DEFAULTS = {
  currentBalance: 0,
  minimumPayment: 0,
  savings: 0,
  totalMonthlyPayment: 0,
}
const PROFILE_DEFAULTS = {
  originalPrincipal: 0,
  annualRate: 0,
  officialRemainingMonths: 0,
  loanDate: '',
  repaymentMethod: '',
  originalTermMonths: 0,
  paidInterest: 0,
}
const loanProfile = { ...PROFILE_DEFAULTS, ...loadLoanProfile() }

const stored = loadStoredState()
const state = { ...DEFAULTS, ...stored }
// 新口径：用户输入“本月计划总还款额”，其中已经包含当月最低还款额。
if (stored.totalMonthlyPayment === undefined) {
  state.totalMonthlyPayment = suggestedPrepayment(state.savings, 50_000)
}
let totalPaymentWasEdited = stored.totalMonthlyPayment !== undefined
let futurePlanEntries = loadFuturePlan()

const $ = (selector) => document.querySelector(selector)
const requiredElement = (selector) => {
  const element = $(selector)
  if (!element) throw new Error(`页面缺少必需元素：${selector}`)
  return element
}
const money = (value) => `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)} 元`
const initialSimulation = profileReady() ? simulatePrepayment({
  currentPrincipal: state.currentBalance,
  prepaymentAmount: calculateExtraPrepayment(state.totalMonthlyPayment, state.minimumPayment),
  annualRate: loanProfile.annualRate,
  currentMinimumPayment: state.minimumPayment,
  officialRemainingMonths: loanProfile.officialRemainingMonths,
}) : null

$('#app').innerHTML = `
  <header class="page-header">
    <span class="eyebrow">个人还款规划</span>
    <h1>我的公积金还款规划</h1>
    <p>看清余额，安排本月，规划未来。</p>
  </header>

  <main>
    <section class="card profile-card" aria-labelledby="profile-title">
      <div class="section-heading"><span class="section-icon" aria-hidden="true">设</span><div><span class="eyebrow">仅保存在本设备</span><h2 id="profile-title">我的贷款参数</h2></div></div>
      <p class="utility-copy">这些参数不写入网页代码，只保存在你当前设备的浏览器中。第一次使用时填写一次即可。</p>
      <div class="profile-grid">
        ${profileInput('profileOriginalPrincipal', '原贷款金额', 'originalPrincipal', 'number')}
        ${profileInput('profileAnnualRate', '当前年利率', 'annualRate', 'number')}
        ${profileInput('profileOfficialRemainingMonths', '官方剩余期数', 'officialRemainingMonths', 'number')}
        ${profileInput('profileLoanDate', '放款日期', 'loanDate', 'date')}
        ${profileInput('profileRepaymentMethod', '还款方式', 'repaymentMethod', 'text')}
        ${profileInput('profileOriginalTermMonths', '原贷款期限（月）', 'originalTermMonths', 'number')}
        ${profileInput('profilePaidInterest', '累计已支付利息', 'paidInterest', 'number')}
      </div>
      <p id="profileHint" class="field-note" hidden></p>
    </section>

    <section class="card" aria-labelledby="loan-title">
      <div class="section-heading">
        <span class="section-icon" aria-hidden="true">贷</span>
        <div><span class="eyebrow">国管公积金系统实际数据</span><h2 id="loan-title">当前贷款</h2></div>
      </div>

      <div class="input-list">
        ${moneyInput('currentBalance', '当前贷款余额', '以公积金系统实际显示为准')}
        ${moneyInput('minimumPayment', '当前最低还款额', '以公积金系统实际显示为准')}
      </div>

      <dl class="facts facts-primary">
        <div><dt>当前年利率</dt><dd id="annualRateDisplay">—</dd></div>
        <div><dt>官方剩余期数</dt><dd id="officialRemainingMonths">—</dd></div>
      </dl>

      <div class="repayment-progress" aria-label="还贷进度">
        <div class="progress-block">
          <div class="progress-head">
            <span>本金偿还进度</span>
            <strong id="principalProgressPercent">—</strong>
          </div>
          <div class="progress-track" aria-hidden="true"><div id="principalProgressFill" class="progress-fill"></div></div>
          <div class="progress-stats">
            <div><span>已偿还本金</span><strong id="principalRepaid">—</strong></div>
            <div><span>当前剩余本金</span><strong id="principalRemaining">—</strong></div>
          </div>
        </div>

        <div class="interest-cost">
          <span>累计已支付利息</span>
          <strong id="paidInterestDisplay">—</strong>
          <small>按你录入的实际累计利息显示，用来提醒已经发生的融资成本。</small>
        </div>

        <div class="progress-block interest-progress-block">
          <div class="progress-head">
            <span>未来利息减负</span>
            <strong id="interestReductionPercent">—</strong>
          </div>
          <div class="progress-track" aria-hidden="true"><div id="interestReductionFill" class="progress-fill interest-progress-fill"></div></div>
          <div class="progress-stats">
            <div><span>预计少付利息</span><strong id="interestReducedAmount">—</strong></div>
            <div><span>基准剩余利息</span><strong id="baselineRemainingInterest">—</strong></div>
          </div>
        </div>

        <small>本金进度按原贷款本金与当前余额计算；利息减负按“仅按当前最低还款”与当前规划对比。</small>
      </div>

      <details class="loan-details">
        <summary>贷款详情</summary>
        <dl class="facts facts-secondary">
          <div><dt>放款日期</dt><dd id="loanDateDisplay">—</dd></div>
          <div><dt>还款方式</dt><dd id="repaymentMethodDisplay">—</dd></div>
          <div><dt>原贷款金额</dt><dd id="originalPrincipalDisplay">—</dd></div>
          <div><dt>原贷款期限</dt><dd id="originalTermDisplay">—</dd></div>
        </dl>

      </details>
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
        <div><span class="eyebrow">本月决策</span><h2 id="simulation-title">本月还款规划</h2></div>
      </div>

      ${moneyInput('totalMonthlyPayment', '本月计划总还款额')}
      <p id="amountWarning" class="field-note" hidden></p>

      <div class="payment-breakdown">
        <div><span>最低还款</span><strong id="minimumPaymentDisplay">—</strong></div>
        <div><span>额外提前还本</span><strong id="extraPrepaymentDisplay">—</strong></div>
      </div>
      <strong id="totalMonthlyPaymentDisplay" class="sr-only">—</strong>

      <div class="result-grid">
        <div><span>预计剩余</span><strong id="plannedMonths">${initialSimulation ? initialSimulation.estimatedMonthsAfter + ' 期（规划测算）' : '待设置'}</strong></div>
        <div><span>预计缩短</span><strong id="monthsSaved">—</strong></div>
        <div><span>预计节省利息</span><strong id="interestSaved">—</strong></div>
      </div>

      <details class="calculation-details">
        <summary>查看测算明细</summary>
        <div class="principal-flow" aria-label="提前还款前后本金">
          <div><span>还款前本金</span><strong id="principalBefore">—</strong></div>
          <span class="flow-arrow" aria-hidden="true">→</span>
          <div><span>还款后本金</span><strong id="principalAfter">—</strong></div>
        </div>
        <div class="applied-row"><span>实际额外提前还本</span><strong id="appliedAmount">—</strong></div>
      </details>
      <p class="assumption">测算用于个人规划，实际余额、最低还款额、期限和利息以国管公积金系统为准。<b id="monthsSavedText" class="sr-only">—</b></p>
    </section>

    <section class="card" aria-labelledby="future-plan-title">
      <div class="section-heading">
        <span class="section-icon" aria-hidden="true">策</span>
        <div><span class="eyebrow">多月叠加</span><h2 id="future-plan-title">未来还款计划</h2></div>
      </div>

      <div class="future-current">
        <span>本月计划（来自上方）</span>
        <strong id="futureCurrentPayment">—</strong>
      </div>

      <div class="future-form">
        <label class="money-field">
          <span>计划月份</span>
          <div class="money-input"><input id="futurePlanMonth" type="month" aria-label="计划月份"></div>
        </label>
        ${plainMoneyInput('futurePlanTotal', '该月计划总还款额')}
      </div>
      <button id="addFuturePlan" class="primary-button" type="button">加入未来计划</button>
      <p id="futurePlanHint" class="field-note" hidden></p>

      <div id="futurePlanList" class="future-list"></div>

      <div class="future-summary">
        <div><span>叠加计划后预计剩余</span><strong id="futurePlannedMonths">—</strong></div>
        <div><span>预计累计缩短</span><strong id="futureMonthsSaved">—</strong></div>
        <div><span>预计累计节省利息</span><strong id="futureInterestSaved">—</strong></div>
        <div><span>预计结清</span><strong id="futurePayoffDate">—</strong></div>
      </div>
      <div class="future-actions"><button id="clearFuturePlan" class="secondary-button" type="button">清空未来计划</button></div>
      <p class="history-local-note">本月金额自动接续上方规划；未来月份可逐笔添加、删除并即时重算。</p>
    </section>

    <section class="card utility-card" aria-labelledby="data-title">
      <div class="section-heading"><span class="section-icon" aria-hidden="true">存</span><div><span class="eyebrow">长期使用</span><h2 id="data-title">数据备份</h2></div></div>
      <p class="utility-copy">把当前贷款数据和未来计划保存下来，换手机或清理浏览器后也能恢复。</p>
      <div class="utility-actions"><button id="exportData" class="secondary-button" type="button">导出数据</button><button id="importData" class="secondary-button" type="button">导入数据</button><input id="importDataFile" type="file" accept="application/json,.json" hidden></div>
      <p id="dataHint" class="field-note" hidden></p>
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

function profileInput(id, label, key, type) {
  const suffix = key === 'annualRate' ? '%' : (key === 'originalPrincipal' ? '元' : (key === 'originalTermMonths' || key === 'officialRemainingMonths' ? '月' : ''))
  return '<label class="money-field profile-field"><span>'+label+'</span><div class="money-input"><input id="'+id+'" data-profile-key="'+key+'" type="'+type+'" min="0" step="0.01" inputmode="decimal" aria-label="'+label+'"><b>'+suffix+'</b></div></label>'
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

requiredElement('#futurePlanMonth').value = nextMonthValue()
requiredElement('#futurePlanTotal').value = state.totalMonthlyPayment
renderProfile()
renderFuturePlan()


function render() {
  document.querySelectorAll('[data-key]').forEach((input) => {
    if (document.activeElement !== input) input.value = state[input.dataset.key]
  })

  const originalPrincipal = loanProfile.originalPrincipal
  const repaidPrincipal = Math.max(0, originalPrincipal - state.currentBalance)
  const progressPercent = originalPrincipal > 0
    ? Math.min(100, Math.max(0, repaidPrincipal / originalPrincipal * 100))
    : 0
  $('#principalRepaid').textContent = money(repaidPrincipal)
  $('#principalRemaining').textContent = money(state.currentBalance)
  $('#principalProgressPercent').textContent = `${progressPercent.toFixed(1)}%`
  $('#principalProgressFill').style.width = `${progressPercent.toFixed(1)}%`
  const paidInterest = Math.max(0, Number(loanProfile.paidInterest) || 0)
  $('#paidInterestDisplay').textContent = paidInterest > 0 ? money(paidInterest) : '未填写'

  const available = suggestedPrepayment(state.savings, 50_000)
  $('#availableAmount').textContent = money(available)

  const totalMonthlyPayment = Math.max(0, state.totalMonthlyPayment)
  const extraPrepayment = calculateExtraPrepayment(totalMonthlyPayment, state.minimumPayment)
  $('#totalMonthlyPaymentDisplay').textContent = money(totalMonthlyPayment)
  $('#minimumPaymentDisplay').textContent = money(state.minimumPayment)
  $('#extraPrepaymentDisplay').textContent = money(extraPrepayment)

  if (!profileReady()) { setCalculationUnavailable(); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderFuturePlan(); renderProfile(); return }

  const result = simulatePrepayment({
    currentPrincipal: state.currentBalance,
    prepaymentAmount: extraPrepayment,
    annualRate: loanProfile.annualRate,
    currentMinimumPayment: state.minimumPayment,
    officialRemainingMonths: loanProfile.officialRemainingMonths,
  })

  renderSimulationResult(simulationElements, result, money)

  const baselineProjection = projectLoan({
    principal: state.currentBalance,
    annualRate: loanProfile.annualRate,
    monthlyPayment: state.minimumPayment,
  })
  const baselineRemainingInterest = baselineProjection.payable ? baselineProjection.totalInterest : 0
  const interestReduced = Math.max(0, Number(result.estimatedInterestSaved) || 0)
  const interestReductionPercent = baselineRemainingInterest > 0
    ? Math.min(100, interestReduced / baselineRemainingInterest * 100)
    : 0
  $('#baselineRemainingInterest').textContent = baselineProjection.payable ? money(baselineRemainingInterest) : '待完善'
  $('#interestReducedAmount').textContent = baselineProjection.payable ? money(interestReduced) : '待完善'
  $('#interestReductionPercent').textContent = baselineProjection.payable ? `${interestReductionPercent.toFixed(1)}%` : '—'
  $('#interestReductionFill').style.width = `${interestReductionPercent.toFixed(1)}%`

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
  renderFuturePlan()
  renderProfile()
}

function renderFuturePlan() {
  $('#futureCurrentPayment').textContent = money(state.totalMonthlyPayment)

  const currentMonth = currentMonthValue()
  const entries = [
    { month: currentMonth, totalPayment: state.totalMonthlyPayment },
    ...futurePlanEntries,
  ]

  let result
  try {
    if (!profileReady()) { $('#futurePlanHint').hidden = false; $('#futurePlanHint').textContent = '请先填写上方“我的贷款参数”。'; return }
    result = simulateFuturePlan({
      currentPrincipal: state.currentBalance,
      annualRate: loanProfile.annualRate,
      currentMinimumPayment: state.minimumPayment,
      officialRemainingMonths: loanProfile.officialRemainingMonths,
      startMonth: currentMonth,
      entries,
    })
  } catch (error) {
    $('#futurePlanHint').hidden = false
    $('#futurePlanHint').textContent = error.message
    return
  }

  const futureSteps = result.steps.filter((step) => step.month !== currentMonth)
  const list = $('#futurePlanList')
  if (!futureSteps.length) {
    list.innerHTML = '<div class="history-empty">先加入下个月或更晚的计划，就能看到每一步叠加后的预计余额。</div>'
  } else {
    list.innerHTML = futureSteps.map((step) => `
      <article class="history-item">
        <div class="history-date">${step.month}</div>
        <div class="history-item-grid">
          <div><span>总还款</span><strong>${money(step.totalPayment)}</strong></div>
          <div><span>额外提前还款</span><strong>${money(step.extraPrepayment)}</strong></div>
          <div><span>预计还款后余额</span><strong>${money(step.endingBalance)}</strong></div>
          <div><span>本次预计节省利息</span><strong>${money(step.estimatedInterestSaved)}</strong></div>
        </div>
        <button type="button" class="history-delete" data-future-month="${step.month}">删除</button>
      </article>
    `).join('')
  }

  $('#futurePlannedMonths').textContent = result.payable ? `${result.estimatedMonthsAfter} 期` : '待完善'
  $('#futureMonthsSaved').textContent = result.payable ? `${result.estimatedMonthsSaved} 个月` : '待完善'
  $('#futureInterestSaved').textContent = result.payable ? money(result.estimatedInterestSaved) : '待完善'
  const payoffDate = result.payable ? addMonthsToDate(new Date(), result.estimatedMonthsAfter) : null
  $('#futurePayoffDate').textContent = payoffDate ? formatMonth(payoffDate) : '待完善'
}

function exportData() {
  const payload = { version: 2, exportedAt: new Date().toISOString(), loanProfile, state, futurePlanEntries }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '我的公积金还款规划-备份.json'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  const hint = $('#dataHint')
  hint.hidden = false
  hint.textContent = '备份文件已导出。'
}

function addMonthsToDate(date, months) {
  const result = new Date(date)
  result.setDate(1)
  result.setMonth(result.getMonth() + Math.max(0, Number(months) || 0))
  return result
}

function formatMonth(date) { return `${date.getFullYear()}年${date.getMonth() + 1}月` }

function saveFuturePlan() {
  localStorage.setItem(FUTURE_PLAN_STORAGE_KEY, JSON.stringify(futurePlanEntries))
}

function loadFuturePlan() {
  try {
    const value = JSON.parse(localStorage.getItem(FUTURE_PLAN_STORAGE_KEY))
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function nextMonthValue() {
  const now = new Date()
  now.setDate(1)
  now.setMonth(now.getMonth() + 1)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function loadLoanProfile() { try { const value = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)); return value && typeof value === 'object' ? value : {} } catch { return {} } }
function saveLoanProfile() { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(loanProfile)) }
function profileReady() { return Number(loanProfile.originalPrincipal) > 0 && Number(loanProfile.annualRate) > 0 && Number(loanProfile.officialRemainingMonths) > 0 }
function renderProfile() {
  document.querySelectorAll('[data-profile-key]').forEach((input) => { if (document.activeElement !== input) input.value = loanProfile[input.dataset.profileKey] ?? '' })
  $('#annualRateDisplay').textContent = profileReady() ? loanProfile.annualRate+'%' : '未设置'
  $('#officialRemainingMonths').textContent = profileReady() ? loanProfile.officialRemainingMonths+' 期' : '未设置'
  $('#loanDateDisplay').textContent = loanProfile.loanDate || '未设置'
  $('#repaymentMethodDisplay').textContent = loanProfile.repaymentMethod || '未设置'
  $('#originalPrincipalDisplay').textContent = Number(loanProfile.originalPrincipal) > 0 ? money(Number(loanProfile.originalPrincipal)) : '未设置'
  $('#originalTermDisplay').textContent = Number(loanProfile.originalTermMonths) > 0 ? loanProfile.originalTermMonths+' 期' : '未设置'
  const hint=$('#profileHint'); hint.hidden=profileReady(); if(!profileReady()) hint.textContent='请填写原贷款金额、当前年利率和官方剩余期数后开始测算。'
}
function setCalculationUnavailable() { simulationElements.plannedMonths.textContent='待设置'; simulationElements.monthsSaved.textContent='—'; simulationElements.interestSaved.textContent='—'; simulationElements.principalBefore.textContent='—'; simulationElements.appliedAmount.textContent='—'; simulationElements.principalAfter.textContent='—'; $('#baselineRemainingInterest').textContent='—'; $('#interestReducedAmount').textContent='—'; $('#interestReductionPercent').textContent='—'; $('#interestReductionFill').style.width='0%' }
function loadStoredState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

document.addEventListener('input', (event) => {
  const profileKey=event.target.dataset.profileKey
  if(profileKey){ loanProfile[profileKey]=event.target.type==='number'?Math.max(0,Number(event.target.value)||0):event.target.value; saveLoanProfile(); render(); return }
  const key = event.target.dataset.key
  if (!key) return
  state[key] = Math.max(0, Number(event.target.value) || 0)
  if (key === 'totalMonthlyPayment') totalPaymentWasEdited = true
  if (key === 'savings' && !totalPaymentWasEdited) {
    state.totalMonthlyPayment = suggestedPrepayment(state.savings, 50_000)
  }
  render()
})

document.addEventListener('change', (event) => {
  if (event.target.id !== 'importDataFile') return
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const hint = $('#dataHint')
    try {
      const payload = JSON.parse(String(reader.result))
      if (!payload || ![1,2].includes(payload.version) || typeof payload.state !== 'object' || !Array.isArray(payload.futurePlanEntries)) throw new Error('备份文件格式不正确。')
      const importedState = { ...DEFAULTS, ...payload.state }
      if(payload.version>=2 && payload.loanProfile && typeof payload.loanProfile==='object') Object.assign(loanProfile,{...PROFILE_DEFAULTS,...payload.loanProfile})
      for (const key of ['currentBalance', 'minimumPayment', 'savings', 'totalMonthlyPayment']) if (!Number.isFinite(Number(importedState[key])) || Number(importedState[key]) < 0) throw new Error('备份文件中的贷款数据无效。')
      futurePlanEntries = payload.futurePlanEntries.filter((entry) => /^\d{4}-\d{2}$/.test(entry.month) && Number.isFinite(Number(entry.totalPayment))).map((entry) => ({ month: entry.month, totalPayment: Number(entry.totalPayment) }))
      Object.assign(state, importedState)
      totalPaymentWasEdited = true
      saveFuturePlan()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      hint.hidden = false
      hint.textContent = '数据已恢复。'
      render()
    } catch (error) { hint.hidden = false; hint.textContent = error.message || '导入失败。' }
    finally { event.target.value = '' }
  }
  reader.readAsText(file)
})

document.addEventListener('click', (event) => {
  if (event.target.id === 'clearFuturePlan') {
    futurePlanEntries = []
    saveFuturePlan()
    $('#futurePlanHint').hidden = false
    $('#futurePlanHint').textContent = '未来计划已清空。'
    renderFuturePlan()
    return
  }
  if (event.target.id === 'exportData') { exportData(); return }
  if (event.target.id === 'importData') { $('#importDataFile').click(); return }
  if (event.target.id === 'addFuturePlan') {
    const month = $('#futurePlanMonth').value
    const totalPayment = Number($('#futurePlanTotal').value)
    const hint = $('#futurePlanHint')
    const currentMonth = currentMonthValue()

    if (!/^\d{4}-\d{2}$/.test(month) || month <= currentMonth) {
      hint.hidden = false
      hint.textContent = '请选择下个月或更晚的月份。'
      return
    }
    if (!Number.isFinite(totalPayment) || totalPayment < state.minimumPayment) {
      hint.hidden = false
      hint.textContent = '该月计划总还款额不能低于当前最低还款额。'
      return
    }

    const existing = futurePlanEntries.find((entry) => entry.month === month)
    if (existing) {
      existing.totalPayment = totalPayment
    } else {
      futurePlanEntries.push({ month, totalPayment })
    }
    futurePlanEntries.sort((a, b) => a.month.localeCompare(b.month))
    saveFuturePlan()
    hint.hidden = false
    hint.textContent = existing ? '已更新该月计划。' : '已加入未来还款计划。'
    renderFuturePlan()
    return
  }

  const futureMonth = event.target.dataset?.futureMonth
  if (futureMonth) {
    futurePlanEntries = futurePlanEntries.filter((entry) => entry.month !== futureMonth)
    saveFuturePlan()
    renderFuturePlan()
  }
})
render()
