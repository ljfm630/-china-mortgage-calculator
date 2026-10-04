import {
  calculateSafeExtraPayment,
  compareFreedomRepayment,
  getRateForDate,
  loadMyLoanProfile,
  resetMyLoanProfile,
  saveMyLoanProfile,
} from './my-loan.js'

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 })
const formatMoney = (value, digits = 2) => money.format(value).replace('CN¥', '¥').replace(digits === 0 ? '.00' : /$^/, '')

export function mountMyLoan(container) {
  let profile = loadMyLoanProfile()
  container.innerHTML = template(profile)

  const $ = (selector) => container.querySelector(selector)
  const readMoney = (selector) => Math.max(0, Number($(selector).value) || 0)

  function update() {
    profile.availableSavings = readMoney('#mySavings')
    profile.reservedExpenses = readMoney('#myExpenses')
    profile.simulationExtraPayment = readMoney('#myExtraPayment')
    saveMyLoanProfile(profile)

    const safeExtra = calculateSafeExtraPayment(profile)
    const noExtra = safeExtra <= 0
    $('#safeAmount').textContent = noExtra ? '本月不建议额外还款' : `你今天可以放心拿 ${formatMoney(safeExtra, 0)} 去还房贷。`
    $('#safeHint').textContent = noExtra
      ? '当前优先保持或恢复5万元现金安全储备。'
      : '建议选择“仅调整本月还款额”，下个月再根据现金情况重新计算。'
    $('#adviceExtra').textContent = formatMoney(safeExtra)
    $('#adviceTotal').textContent = formatMoney(profile.officialMinimumPayment + safeExtra)
    $('#cashAfter').textContent = formatMoney(Math.max(0, profile.availableSavings - safeExtra - profile.reservedExpenses), 0)

    const comparison = compareFreedomRepayment(profile, profile.simulationExtraPayment)
    $('#simExtra').textContent = formatMoney(comparison.accelerated.extraPayment)
    $('#simRemaining').textContent = formatMoney(comparison.accelerated.remainingAfterExtra)
    $('#simInterest').textContent = formatMoney(comparison.accelerated.totalInterest)
    $('#simPayoff').textContent = comparison.accelerated.payoffDate
    $('#simMonths').textContent = `${comparison.accelerated.months} 期`
    $('#simSavedInterest').textContent = formatMoney(comparison.interestSaved)
    $('#simSavedMonths').textContent = `${comparison.monthsSaved} 个月`
  }

  function saveProfileFields() {
    const textFields = ['homeName', 'loanType', 'repaymentMethod', 'disbursementDate', 'firstPaymentDate']
    for (const key of textFields) profile[key] = $(`[data-profile="${key}"]`).value
    const numberFields = ['housePrice', 'originalPrincipal', 'originalPeriods', 'remainingPrincipal', 'remainingPeriods', 'officialMinimumPayment', 'paymentDay', 'cashSafetyLine']
    for (const key of numberFields) profile[key] = Math.max(0, Number($(`[data-profile="${key}"]`).value) || 0)
    profile.rateHistory[0].annualRate = Math.max(0, Number($('[data-profile="originalRate"]').value) || 0)
    profile.rateHistory[1].annualRate = Math.max(0, Number($('[data-profile="currentRate"]').value) || 0)
    profile.rateHistory[1].effectiveDate = $('[data-profile="currentRateDate"]').value
    profile.repaymentHistory[0].effectiveMonth = $('[data-profile="historicalExtraMonth"]').value
    profile.repaymentHistory[0].extraPrincipal = Math.max(0, Number($('[data-profile="historicalExtraAmount"]').value) || 0)
    saveMyLoanProfile(profile)
    container.innerHTML = template(profile)
    bind()
    update()
  }

  function bind() {
    for (const selector of ['#mySavings', '#myExpenses', '#myExtraPayment']) {
      $(selector).addEventListener('input', update)
    }
    container.querySelectorAll('[data-extra]').forEach((button) => button.addEventListener('click', () => {
      $('#myExtraPayment').value = button.dataset.extra
      update()
    }))
    container.querySelectorAll('[data-profile]').forEach((input) => input.addEventListener('change', saveProfileFields))
    $('#resetMyLoan').addEventListener('click', () => {
      if (!globalThis.confirm('确认恢复“我的还贷”默认数据？')) return
      profile = resetMyLoanProfile()
      container.innerHTML = template(profile)
      bind()
      update()
    })
  }

  bind()
  update()
}

function template(profile) {
  const currentRate = getRateForDate(profile.rateHistory, profile.rateHistory.at(-1).effectiveDate)
  return `
    <section class="my-loan-summary">
      <p class="eyebrow">我的还贷 · ${escapeHtml(profile.homeName)}</p>
      <h2 id="safeAmount">你今天可以放心拿 ¥0 去还房贷。</h2>
      <p id="safeHint" class="my-lead"></p>
      <div class="profile-stats">
        ${stat('当前贷款余额', formatMoney(profile.remainingPrincipal))}
        ${stat('当前执行利率', `${currentRate.toFixed(2)}%`)}
        ${stat('当前最低还款额', formatMoney(profile.officialMinimumPayment))}
        ${stat('当前剩余期限', `${profile.remainingPeriods}期`)}
        ${stat('现金安全线', formatMoney(profile.cashSafetyLine, 0))}
      </div>
    </section>

    <section class="card loan-overview" aria-labelledby="loan-overview-title">
      <div class="section-title"><span>档案</span><h2 id="loan-overview-title">国管公积金自由还款</h2></div>
      <div class="overview-grid">
        ${stat('原始贷款本金', formatMoney(profile.originalPrincipal))}
        ${stat('原贷款利率', `${profile.rateHistory[0].annualRate.toFixed(2)}%`)}
        ${stat('原始贷款期限', `${profile.originalPeriods}期 / ${profile.originalPeriods / 12}年`)}
        ${stat('还款方式', escapeHtml(profile.repaymentMethod))}
        ${stat('放款日期', profile.disbursementDate)}
        ${stat('首次还款日期', profile.firstPaymentDate)}
      </div>
      <div class="history-event">
        <span class="history-date">${profile.repaymentHistory[0].effectiveMonth.replace('-', '年')}月</span>
        <div><b>已提前偿还 ${formatMoney(profile.repaymentHistory[0].extraPrincipal, 0)}</b><small>此后最低还款额由国管公积金系统按剩余本金重新调整；当前余额已包含本次还款，不会重复扣除。</small></div>
      </div>
    </section>

    <section class="card action-card">
      <div class="section-title"><span>01</span><h2>今天能安心还多少</h2></div>
      <div class="field-grid">
        ${moneyField('mySavings', '当前可用存款', profile.availableSavings)}
        ${moneyField('myExpenses', '近期预留支出', profile.reservedExpenses)}
      </div>
      <div class="advice-grid">
        ${stat('本月最低还款', formatMoney(profile.officialMinimumPayment))}
        ${stat('建议额外还款', '<span id="adviceExtra">—</span>')}
        ${stat('建议本月总还款', '<span id="adviceTotal">—</span>')}
        ${stat('还款后预计保留现金', '<span id="cashAfter">—</span>')}
      </div>
      <div class="operation-tip"><b>建议操作</b><span>仅调整本月还款额</span></div>
      <p class="estimate-note">现金安全线不是“必须攒够5万元才能提前还款”：账户现金不高于安全线时不建议多还；高于安全线并扣除近期预留支出后的部分，都可以用于额外还贷。</p>
    </section>

    <section class="card">
      <div class="section-title"><span>02</span><h2>提前还款模拟</h2></div>
      ${moneyField('myExtraPayment', '本月额外偿还本金', profile.simulationExtraPayment)}
      <div class="quick-amounts">${[500, 1000, 2000, 5000, 8000, 10000, 50000, 100000].map((value) => `<button type="button" data-extra="${value}">${value >= 10000 ? `${value / 10000}万` : value}</button>`).join('')}</div>
      <div class="compare-heading"><span>方案A · 继续最低还款</span><span>方案B · 本月多还后恢复最低还款</span></div>
      <div class="simulation-results">
        ${stat('额外偿还本金', '<span id="simExtra">—</span>')}
        ${stat('还款后剩余本金', '<span id="simRemaining">—</span>')}
        ${stat('预计未来利息', '<span id="simInterest">—</span>')}
        ${stat('预计还清日期', '<span id="simPayoff">—</span>')}
        ${stat('预计剩余还款月数', '<span id="simMonths">—</span>')}
        ${stat('预计节省利息', '<span id="simSavedInterest">—</span>')}
        ${stat('预计提前还清', '<span id="simSavedMonths">—</span>')}
      </div>
      <p class="estimate-note">估算说明：使用国管系统当前给出的最低还款额 ${formatMoney(profile.officialMinimumPayment)} 作为后续基准，不反推官方最低还款算法；实际重新核定金额请以国管公积金系统为准。</p>
    </section>

    <details class="card profile-editor">
      <summary>贷款档案与设置 <span>可修改</span></summary>
      <div class="profile-fields">
        ${textField('homeName', '住房', profile.homeName)}
        ${numberField('housePrice', '房屋总价（元）', profile.housePrice)}
        ${numberField('originalPrincipal', '原始贷款本金（元）', profile.originalPrincipal)}
        ${textField('loanType', '贷款类型', profile.loanType)}
        ${textField('repaymentMethod', '还款方式', profile.repaymentMethod)}
        ${dateField('disbursementDate', '放款日期', profile.disbursementDate)}
        ${dateField('firstPaymentDate', '首次还款日期', profile.firstPaymentDate)}
        ${numberField('originalPeriods', '原始贷款期数', profile.originalPeriods)}
        ${numberField('remainingPrincipal', '当前贷款余额（元）', profile.remainingPrincipal)}
        ${numberField('remainingPeriods', '当前剩余期数', profile.remainingPeriods)}
        ${numberField('officialMinimumPayment', '当前最低还款额（元）', profile.officialMinimumPayment)}
        ${numberField('paymentDay', '约定还款日', profile.paymentDay)}
        ${numberField('cashSafetyLine', '现金安全线（元）', profile.cashSafetyLine)}
        ${numberField('originalRate', '原年利率（%）', profile.rateHistory[0].annualRate)}
        ${numberField('currentRate', '当前年利率（%）', profile.rateHistory[1].annualRate)}
        ${dateField('currentRateDate', '新利率执行日期', profile.rateHistory[1].effectiveDate)}
        ${monthField('historicalExtraMonth', '历史提前还款月份', profile.repaymentHistory[0].effectiveMonth)}
        ${numberField('historicalExtraAmount', '历史提前偿还本金（元）', profile.repaymentHistory[0].extraPrincipal)}
      </div>
      <div class="policy-note"><b>国管公积金档案：</b>2025年1月已提前偿还10万元，之后最低还款额已由国管公积金系统根据剩余本金重新调整。当前余额已经包含该历史还款，不会在未来模拟中重复扣除。原始期限30年 / 5年以上档，预计提前还清不会触发2.10%利率。2026年1月最低还款额继续采用国管系统实际值，2月后的重新核定金额需以系统为准。</div>
      <button type="button" id="resetMyLoan" class="reset-button">恢复默认数据</button>
    </details>

    <p class="disclaimer">模拟结果仅用于个人现金规划，不替代国管公积金中心的正式还款数据</p>
  `
}

function stat(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`
}

function moneyField(id, label, value) {
  return `<label class="field">${label}<div class="input-wrap"><input id="${id}" type="number" min="0" step="100" inputmode="decimal" value="${value}"><span>元</span></div></label>`
}

function textField(key, label, value) {
  return `<label class="field">${label}<div class="input-wrap"><input data-profile="${key}" value="${escapeHtml(value)}"></div></label>`
}

function numberField(key, label, value) {
  return `<label class="field">${label}<div class="input-wrap"><input data-profile="${key}" type="number" min="0" step="0.01" value="${value}"></div></label>`
}

function dateField(key, label, value) {
  return `<label class="field">${label}<div class="input-wrap"><input data-profile="${key}" type="date" value="${value}"></div></label>`
}

function monthField(key, label, value) {
  return `<label class="field">${label}<div class="input-wrap"><input data-profile="${key}" type="month" value="${value}"></div></label>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character])
}
