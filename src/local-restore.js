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
      localStorage.setItem(key, JSON.stringify(payload[field])); restored++
    }
  }
  if (!restored) throw new Error('没有可恢复的数据')
}
const hash = window.location.hash
if (hash.startsWith('#restore=')) {
  try {
    let encoded = hash.slice(9).replace(/-/g, '+').replace(/_/g, '/')
    while (encoded.length % 4) encoded += '='
    restorePayload(JSON.parse(new TextDecoder('utf-8').decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)))))
    history.replaceState(null, '', window.location.pathname + window.location.search); window.location.reload()
  } catch (e) { console.error(e) }
}
document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.createElement('section')
  wrap.style.cssText='max-width:760px;margin:20px auto 48px;padding:0 20px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;box-sizing:border-box'
  wrap.innerHTML=`<div style="background:#fff;border:1px solid #dfe7df;border-radius:28px;padding:24px">
    <div style="font-size:14px;color:#7b817d;margin-bottom:8px">手机本地恢复</div><div style="font-size:26px;font-weight:750;margin-bottom:8px">恢复备份数据</div>
    <p style="font-size:15px;line-height:1.65;color:#6e6e73">iCloud 没空间也没关系。可以直接把恢复数据粘贴到下面，不需要上传文件。</p>
    <textarea id="restore-text" placeholder="长按这里 → 粘贴恢复数据" style="width:100%;height:110px;box-sizing:border-box;border:1px solid #d2d2d7;border-radius:14px;padding:12px;font-size:16px;margin:8px 0 12px"></textarea>
    <button id="restore-text-button" style="width:100%;border:0;border-radius:16px;padding:16px;background:#2f6845;color:#fff;font-size:17px;font-weight:700">恢复并刷新</button>
    <div id="restore-status" style="margin-top:10px;font-size:14px;color:#6e6e73"></div>
    <details style="margin-top:18px"><summary style="color:#6e6e73">也可以从备份文件恢复</summary><input id="restore-file" type="file" accept="application/json,.json" style="margin-top:14px;width:100%"></details>
  </div>`
  document.body.appendChild(wrap)
  const status=document.getElementById('restore-status')
  const finish=p=>{restorePayload(p);status.textContent='恢复成功，正在刷新…';setTimeout(()=>location.reload(),250)}
  document.getElementById('restore-text-button').onclick=()=>{try{finish(JSON.parse(document.getElementById('restore-text').value.trim()))}catch(e){status.textContent='恢复失败：'+e.message}}
  document.getElementById('restore-file').onchange=async e=>{try{const f=e.target.files[0];if(f)finish(JSON.parse(await f.text()))}catch(err){status.textContent='恢复失败：'+err.message}}
})
