// Local-only backup restore helper. No personal mortgage data is stored in source code.
const STORAGE_KEYS = {
  state: 'gjj-prepayment-planner-v3',
  loanProfile: 'gjj-loan-profile-v1',
  futurePlanEntries: 'gjj-future-payment-plan-v1',
  historicalPrepayments: 'gjj-historical-prepayment-v2',
  monthlyUpdates: 'gjj-monthly-update-v1',
}

function restorePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('备份格式无效')
  let restored = 0
  for (const [field, key] of Object.entries(STORAGE_KEYS)) {
    if (payload[field] !== undefined && payload[field] !== null) {
      localStorage.setItem(key, JSON.stringify(payload[field]))
      restored += 1
    }
  }
  if (!restored) throw new Error('备份中没有可恢复的数据')
  return restored
}

// Keep URL-fragment restore for compatibility, but file restore below is the reliable iPhone path.
const hash = window.location.hash
if (hash.startsWith('#restore=')) {
  try {
    let encoded = hash.slice('#restore='.length).replace(/-/g, '+').replace(/_/g, '/')
    while (encoded.length % 4) encoded += '='
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
    restorePayload(JSON.parse(new TextDecoder('utf-8').decode(bytes)))
    history.replaceState(null, '', window.location.pathname + window.location.search)
    window.location.reload()
  } catch (error) {
    console.error('URL restore failed', error)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.createElement('section')
  wrap.style.cssText = 'max-width:760px;margin:20px auto 48px;padding:0 20px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;box-sizing:border-box'
  wrap.innerHTML = `
    <div style="background:#fff;border:1px solid #dfe7df;border-radius:28px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.03)">
      <div style="font-size:14px;color:#7b817d;margin-bottom:8px">手机本地恢复</div>
      <div style="font-size:26px;font-weight:750;color:#1d1d1f;margin-bottom:8px">恢复备份数据</div>
      <p style="font-size:15px;line-height:1.65;color:#6e6e73;margin:0 0 18px">选择之前下载的“我的公积金还款规划-备份.json”。文件只在当前浏览器读取，不会上传到网站。</p>
      <input id="local-backup-file" type="file" accept="application/json,.json" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden" />
      <button id="local-backup-button" type="button" style="width:100%;border:0;border-radius:16px;padding:16px;background:#2f6845;color:#fff;font-size:17px;font-weight:700">选择备份文件并恢复</button>
      <div id="local-backup-status" style="margin-top:12px;font-size:14px;line-height:1.5;color:#6e6e73"></div>
    </div>`
  document.body.appendChild(wrap)

  const input = document.getElementById('local-backup-file')
  const button = document.getElementById('local-backup-button')
  const status = document.getElementById('local-backup-status')
  button.addEventListener('click', () => input.click())
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0]
    if (!file) return
    try {
      status.textContent = '正在恢复…'
      const payload = JSON.parse(await file.text())
      restorePayload(payload)
      status.textContent = '恢复成功，正在刷新…'
      setTimeout(() => window.location.reload(), 250)
    } catch (error) {
      console.error('Backup restore failed', error)
      status.textContent = '恢复失败：' + (error && error.message ? error.message : '无法读取这个备份文件')
    }
  })
})
