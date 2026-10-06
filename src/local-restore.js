// Private local restore helper. Personal data is supplied only in the URL hash,
// is never committed to the repository, and is removed from the address bar
// immediately after being written to this browser's localStorage.
const hash = window.location.hash
if (hash.startsWith('#restore=')) {
  try {
    const encoded = hash.slice('#restore='.length)
    const json = decodeURIComponent(escape(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))))
    const payload = JSON.parse(json)
    const allowed = {
      'gjj-prepayment-planner-v3': payload.state,
      'gjj-loan-profile-v1': payload.loanProfile,
      'gjj-future-payment-plan-v1': payload.futurePlanEntries,
      'gjj-historical-prepayment-v2': payload.historicalPrepayments,
      'gjj-monthly-update-v1': payload.monthlyUpdates,
    }
    for (const [key, value] of Object.entries(allowed)) {
      if (value !== undefined && value !== null) localStorage.setItem(key, JSON.stringify(value))
    }
    history.replaceState(null, '', window.location.pathname + window.location.search)
    sessionStorage.setItem('gjj-restore-success', '1')
    window.location.reload()
  } catch (error) {
    console.error('Local restore failed', error)
    history.replaceState(null, '', window.location.pathname + window.location.search)
    sessionStorage.setItem('gjj-restore-error', '1')
  }
}
