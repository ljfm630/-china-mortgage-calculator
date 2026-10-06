// Private local restore helper. Data arrives only in the URL fragment and is
// stored locally in this browser. The fragment is removed immediately.
const hash = window.location.hash
if (hash.startsWith('#restore=')) {
  try {
    let encoded = hash.slice('#restore='.length).replace(/-/g, '+').replace(/_/g, '/')
    while (encoded.length % 4) encoded += '='

    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
    const json = new TextDecoder('utf-8').decode(bytes)
    const payload = JSON.parse(json)

    const allowed = {
      'gjj-prepayment-planner-v3': payload.state,
      'gjj-loan-profile-v1': payload.loanProfile,
      'gjj-future-payment-plan-v1': payload.futurePlanEntries,
      'gjj-historical-prepayment-v2': payload.historicalPrepayments,
      'gjj-monthly-update-v1': payload.monthlyUpdates,
    }

    for (const [key, value] of Object.entries(allowed)) {
      if (value !== undefined && value !== null) {
        localStorage.setItem(key, JSON.stringify(value))
      }
    }

    history.replaceState(null, '', window.location.pathname + window.location.search)
    window.location.replace(window.location.pathname + window.location.search + '?restored=' + Date.now())
  } catch (error) {
    console.error('Local restore failed', error)
    document.addEventListener('DOMContentLoaded', () => {
      const app = document.getElementById('app')
      if (app) app.innerHTML = '<main style="max-width:680px;margin:40px auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,sans-serif"><h1>恢复没有完成</h1><p>请回到 ChatGPT，告诉我页面显示了这句话。你不需要重新填写任何贷款数据。</p></main>'
    })
  }
}
