import { calculateMortgage, calculateVariableRateMortgage } from './mortgage.js'
import { mountMyLoan } from './my-loan-view.js'

const state = {
  housePrice: 155,
  downPayment: 40,
  loanType: 'fund',
  annualRate: 2.85,
  rateMode: 'fixed',
  originalAnnualRate: 2.85,
  newAnnualRate: 2.6,
  startDate: '2025-01-01',
  effectiveDate: '2026-01-01',
  years: 30,
  method: 'annuity',
  page: 1,
}
const PAGE_SIZE = 12

document.querySelector('#app').innerHTML = `
  <header class="hero">
    <div class="hero-inner">
      <div class="brand"><span class="brand-mark">¥</span><span>安居算</span></div>
      <h1>房贷计算器</h1>
      <p>清楚算好每一笔，安心规划理想家</p>
      <nav class="app-tabs" aria-label="功能切换">
        <button class="active" data-view="calculator">房贷计算器</button>
        <button data-view="myLoan">我的还贷</button>
      </nav>
    </div>
  </header>
  <main>
    <div id="calculatorView">
    <section class="card form-card" aria-labelledby="loan-heading">
      <div class="section-title"><span>01</span><h2 id="loan-heading">房屋与贷款</h2></div>
      <div class="field-grid">
        <label class="field">房屋总价<div class="input-wrap"><input id="housePrice" type="number" min="0" step="1" inputmode="decimal" value="155"><span>万元</span></div></label>
        <label class="field">首付金额<div class="input-wrap"><input id="downPayment" type="number" min="0" step="1" inputmode="decimal" value="40"><span>万元</span></div></label>
      </div>
      <div class="loan-summary">
        <div><span>贷款金额</span><strong id="loanAmount">¥1,150,000</strong></div>
        <div><span>首付比例</span><strong id="downRatio">25.8%</strong></div>
      </div>
      <label class="group-label">贷款类型</label>
      <div class="segmented" data-control="loanType">
        <button data-value="commercial">商业贷款</button><button class="active" data-value="fund">公积金贷款</button>
      </div>
      <label class="group-label">贷款期限</label>
      <div class="year-options" data-control="years">
        ${[10, 15, 20, 25, 30].map((year) => `<button class="${year === 30 ? 'active' : ''}" data-value="${year}">${year}年</button>`).join('')}
      </div>
      <label class="group-label">利率模式</label>
      <div class="segmented" data-control="rateMode">
        <button class="active" data-value="fixed">固定利率</button><button data-value="variable">分段利率</button>
      </div>
      <div id="fixedRateFields">
        <label class="field rate-field">年利率<div class="input-wrap"><input id="annualRate" type="number" min="0" step="0.01" inputmode="decimal" value="2.85"><span>%</span></div><small>利率可按实际贷款情况修改</small></label>
      </div>
      <div id="variableRateFields" class="variable-rate-fields" hidden>
        <div class="field-grid">
          <label class="field">原年利率<div class="input-wrap"><input id="originalAnnualRate" type="number" min="0" step="0.01" inputmode="decimal" value="2.85"><span>%</span></div></label>
          <label class="field">新年利率<div class="input-wrap"><input id="newAnnualRate" type="number" min="0" step="0.01" inputmode="decimal" value="2.60"><span>%</span></div></label>
        </div>
        <div class="field-grid date-grid">
          <label class="field">贷款开始日期<div class="input-wrap"><input id="startDate" type="date" value="2025-01-01"></div></label>
          <label class="field">新利率执行日期<div class="input-wrap"><input id="effectiveDate" type="date" value="2026-01-01"></div></label>
        </div>
      </div>
      <p id="formError" class="form-error" role="alert" hidden></p>
    </section>

    <section class="card result-card" aria-labelledby="result-heading">
      <div class="section-title"><span>02</span><h2 id="result-heading">还款结果</h2></div>
      <div class="segmented method-switch" data-control="method">
        <button class="active" data-value="annuity">等额本息</button><button data-value="equalPrincipal">等额本金</button>
      </div>
      <div class="primary-result"><span id="primaryLabel">每月月供</span><strong id="primaryValue">—</strong><small id="primaryHint">每月还款金额固定</small></div>
      <div id="secondaryResults" class="secondary-results"></div>
    </section>

    <section class="card details-card" aria-labelledby="details-heading">
      <button class="details-toggle" id="detailsToggle" aria-expanded="false">
        <span><b>03</b><strong id="details-heading">还款明细</strong></span><span class="toggle-meta">共 <i id="totalPeriods">360</i> 期 <em>⌄</em></span>
      </button>
      <div id="detailsBody" class="details-body" hidden>
        <div id="schedule" class="schedule"></div>
        <nav class="pagination" aria-label="还款明细分页">
          <button id="prevPage">上一页</button><span id="pageInfo"></span><button id="nextPage">下一页</button>
        </nav>
      </div>
    </section>
    <p class="disclaimer">计算结果仅供参考，实际还款金额以贷款合同为准</p>
    </div>
    <div id="myLoanView" hidden></div>
  </main>
`

const $ = (selector) => document.querySelector(selector)
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 })
const compactCurrency = (value) => currency.format(value).replace('CN¥', '¥')
let currentResult

function readNumber(selector) {
  const value = Number.parseFloat($(selector).value)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function render() {
  state.housePrice = readNumber('#housePrice')
  state.downPayment = readNumber('#downPayment')
  state.annualRate = readNumber('#annualRate')
  state.originalAnnualRate = readNumber('#originalAnnualRate')
  state.newAnnualRate = readNumber('#newAnnualRate')
  state.startDate = $('#startDate').value
  state.effectiveDate = $('#effectiveDate').value
  const principal = Math.max(0, state.housePrice - state.downPayment) * 10_000
  const ratio = state.housePrice > 0 ? Math.min(100, state.downPayment / state.housePrice * 100) : 0
  $('#loanAmount').textContent = compactCurrency(principal).replace('.00', '')
  $('#downRatio').textContent = `${ratio.toFixed(1)}%`

  try {
    currentResult = state.rateMode === 'fixed'
      ? calculateMortgage({ principal, annualRate: state.annualRate, years: state.years, method: state.method })
      : calculateVariableRateMortgage({
          principal,
          originalAnnualRate: state.originalAnnualRate,
          newAnnualRate: state.newAnnualRate,
          years: state.years,
          method: state.method,
          startDate: state.startDate,
          effectiveDate: state.effectiveDate,
        })
    $('#formError').hidden = true
  } catch (error) {
    $('#formError').textContent = error.message
    $('#formError').hidden = false
    return
  }
  const isAnnuity = state.method === 'annuity'
  const isVariable = state.rateMode === 'variable'
  $('#primaryLabel').textContent = isVariable ? '调整后月供' : (isAnnuity ? '每月月供' : '首月月供')
  $('#primaryValue').textContent = compactCurrency(isVariable ? currentResult.paymentAfter : (isAnnuity ? currentResult.monthlyPayment : currentResult.firstPayment))
  $('#primaryHint').textContent = isVariable
    ? `调整前 ${compactCurrency(currentResult.paymentBefore ?? currentResult.firstPayment)}`
    : (isAnnuity ? '每月还款金额固定' : `每月递减 ${compactCurrency(currentResult.monthlyDecrease)}`)

  const common = [
    ['贷款本金', currentResult.principal],
    ['总利息', currentResult.totalInterest],
    ['本息合计', currentResult.totalPayment],
    ['总期数', `${currentResult.periods} 期`],
  ]
  if (isVariable) {
    common.unshift(
      ['原利率', `${currentResult.originalAnnualRate.toFixed(2)}%`],
      ['新利率', `${currentResult.newAnnualRate.toFixed(2)}%`],
      ['调整日期', currentResult.effectiveDate],
      ['调整前月供', currentResult.paymentBefore ?? currentResult.firstPayment],
    )
  } else if (!isAnnuity) common.unshift(['末月月供', currentResult.lastPayment])
  $('#secondaryResults').innerHTML = common.map(([label, value]) => `
    <div><span>${label}</span><strong>${typeof value === 'number' ? compactCurrency(value) : value}</strong></div>`).join('')
  $('#totalPeriods').textContent = currentResult.periods
  renderSchedule()
}

function renderSchedule() {
  const totalPages = Math.ceil(currentResult.periods / PAGE_SIZE)
  state.page = Math.min(Math.max(1, state.page), totalPages)
  const start = (state.page - 1) * PAGE_SIZE
  $('#schedule').innerHTML = currentResult.schedule.slice(start, start + PAGE_SIZE).map((row) => `
    ${row.rateChanged ? `<div class="rate-change">—— ${formatMonth(row.paymentDate)}起执行新利率 ${row.annualRate.toFixed(2)}% ——</div>` : ''}
    <article class="schedule-row">
      <div class="period"><b>${row.period}</b><span>期</span></div>
      <div class="payment"><span>月供</span><strong>${compactCurrency(row.payment)}</strong></div>
      <dl><div><dt>本金</dt><dd>${compactCurrency(row.principal)}</dd></div><div><dt>利息</dt><dd>${compactCurrency(row.interest)}</dd></div><div><dt>剩余本金</dt><dd>${compactCurrency(row.remaining)}</dd></div></dl>
    </article>`).join('')
  $('#pageInfo').textContent = `${state.page} / ${totalPages}`
  $('#prevPage').disabled = state.page === 1
  $('#nextPage').disabled = state.page === totalPages
}

function formatMonth(value) {
  const [year, month] = value.split('-').map(Number)
  return `${year}年${month}月`
}

document.querySelectorAll('input').forEach((input) => input.addEventListener('input', () => { state.page = 1; render() }))
document.querySelectorAll('[data-control]').forEach((control) => control.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) return
  control.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button))
  const key = control.dataset.control
  state[key] = key === 'years' ? Number(button.dataset.value) : button.dataset.value
  if (key === 'loanType') {
    state.annualRate = state.loanType === 'fund' ? 2.85 : 3.1
    $('#annualRate').value = state.annualRate
    state.originalAnnualRate = state.annualRate
    $('#originalAnnualRate').value = state.originalAnnualRate
  }
  if (key === 'rateMode') {
    $('#fixedRateFields').hidden = state.rateMode !== 'fixed'
    $('#variableRateFields').hidden = state.rateMode !== 'variable'
  }
  state.page = 1
  render()
}))
$('#detailsToggle').addEventListener('click', () => {
  const expanded = $('#detailsToggle').getAttribute('aria-expanded') === 'true'
  $('#detailsToggle').setAttribute('aria-expanded', String(!expanded))
  $('#detailsBody').hidden = expanded
})
$('#prevPage').addEventListener('click', () => { state.page--; renderSchedule(); $('.details-card').scrollIntoView({ behavior: 'smooth' }) })
$('#nextPage').addEventListener('click', () => { state.page++; renderSchedule(); $('.details-card').scrollIntoView({ behavior: 'smooth' }) })
document.querySelectorAll('.app-tabs button').forEach((button) => button.addEventListener('click', () => {
  const showMyLoan = button.dataset.view === 'myLoan'
  document.querySelectorAll('.app-tabs button').forEach((item) => item.classList.toggle('active', item === button))
  $('#calculatorView').hidden = showMyLoan
  $('#myLoanView').hidden = !showMyLoan
  document.querySelector('h1').textContent = showMyLoan ? '我的还贷' : '房贷计算器'
}))

render()
mountMyLoan($('#myLoanView'))
