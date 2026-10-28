// Smoke-test the packaged runtime without installing it or touching a real profile.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const asar = require('@electron/asar')
const root = path.resolve(__dirname, '..')
fs.mkdirSync(path.join(root, 'cache'), { recursive: true })
const dir = fs.mkdtempSync(path.join(root, 'cache', 'packaged-smoke-'))
const executable = path.join(root, 'dist-installer', 'win-unpacked', 'Sarathi.exe')
const archive = path.join(path.dirname(executable), 'resources', 'app.asar')
const env = { ...process.env, SARATHI_DEV_VISIBLE: '1' }
if (process.argv.includes('--offline')) env.Sarathi_MODELS_DIR = path.join(root, 'cache/offline-validation/models')
delete env.ELECTRON_RUN_AS_NODE
const results = []
let child
let socket
let mainSocket
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function check(name, operation) {
  try { await operation(); results.push({ name, status: 'PASS' }); console.log(`PASS: ${name}`) }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); console.error(`FAIL: ${name}: ${error.message}`) }
}
async function main() {
  await check('Packaged archive contains main, preload, renderer and speech worker', async () => {
    const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'))
    for (const file of ['/out/main/index.js', '/out/main/stt-worker.js', '/out/preload/index.js', '/out/renderer/index.html']) assert.ok(files.includes(file), file)
  })
  let inspectorUrl
  child = spawn(executable, [`--user-data-dir=${dir}`, '--remote-debugging-port=0', '--inspect=0'], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  child.stderr.on('data', data => { inspectorUrl ||= data.toString().match(/ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/)?.[0] })
  child.on('error', error => { console.error(error.message) })
  const portFile = path.join(dir, 'DevToolsActivePort')
  const deadline = Date.now() + 15000
  while (!fs.existsSync(portFile) && Date.now() < deadline) await delay(100)
  assert.ok(fs.existsSync(portFile), 'Packaged Chromium did not start')
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0]
  let target
  while (!target && Date.now() < deadline) {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(page => page.type === 'page')
    if (!target) await delay(100)
  }
  assert.ok(target, 'Packaged renderer missing')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = event => {
    const data = JSON.parse(event.data)
    const request = pending.get(data.id)
    if (request) { pending.delete(data.id); clearTimeout(request.timer); request.resolve(data) }
  }
  async function evaluate(expression) {
    const current = ++id
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(current); reject(new Error('Packaged IPC timed out')) }, 10000)
      pending.set(current, { resolve, timer })
      socket.send(JSON.stringify({ id: current, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
    if (response.error || response.result.exceptionDetails) throw new Error(JSON.stringify(response.error || response.result.exceptionDetails))
    return response.result.result.value
  }
  const call = (name, ...args) => evaluate(`window.sarathi[${JSON.stringify(name)}](...${JSON.stringify(args)})`)
  await check('Packaged renderer and preload load with isolated profile', async () => {
    while (!(await evaluate('!!window.sarathi && !!document.querySelector("h1")')) && Date.now() < deadline) await delay(100)
    assert.match(await evaluate('document.body.innerText'), /Sarathi/)
    assert.equal((await call('listSessions')).length, 0)
  })
  await check('Packaged theme button switches both palettes and saves preference', async () => {
    for (const theme of ['dark', 'light']) {
      await evaluate(`(() => { const button = document.querySelector('[data-testid="theme-toggle"]'); if (document.documentElement.dataset.theme === '${theme}') button.click(); button.click(); })()`)
      assert.equal(await evaluate('document.documentElement.dataset.theme'), theme)
      assert.equal(await evaluate('localStorage.getItem("sarathi-theme")'), theme)
      assert.equal(await evaluate('document.querySelector("[data-testid=theme-toggle]").getAttribute("aria-pressed")'), String(theme === 'dark'))
    }
  })
  await check('Packaged safeStorage round trip uses isolated profile', async () => {
    await call('setSettings', { openaiApiKey: 'packaged-synthetic-key' })
    assert.equal((await call('getSettings')).openaiApiKey, 'packaged-synthetic-key')
    const settingsPath = path.join(dir, 'Sarathi-settings.json')
    assert.ok(fs.existsSync(settingsPath))
    assert.equal(fs.readFileSync(settingsPath, 'utf8').includes('packaged-synthetic-key'), false)
    await call('setSettings', { openaiApiKey: null })
  })
  await check('Packaged document endpoints reject an unauthorized synthetic file', async () => {
    const fixture = path.join(dir, 'unselected.txt')
    fs.writeFileSync(fixture, 'Synthetic file')
    assert.match((await call('readDocumentBytes', fixture)).error, /Select this document/)
    assert.match((await call('getDocumentHtml', fixture)).error, /Select this document/)
  })
  await check('Packaged STT returns a usable configuration error', async () => {
    const result = await call('sttStart', 'system')
    assert.equal(result.success, false)
    assert.match(result.error, /API key not configured/)
  })
  await check('Packaged local speech startup reports missing-model error', async () => {
    await evaluate(`window.smokeSttErrors=[]; window.sarathi.onSttError(e => window.smokeSttErrors.push(e.error)); window.sarathi.onSttModelStatus(e => window.smokeModelStatus=e);`)
    await call('setSettings', { sttEngine: 'local' })
    await call('sttStart', 'system')
    const workerDeadline = Date.now() + 5000
    while (!(await evaluate('window.smokeSttErrors.length > 0')) && Date.now() < workerDeadline) await delay(100)
    assert.match(await evaluate('window.smokeSttErrors.join(" ")'), /not downloaded|not cached/)
    await call('sttStop', 'system')
  })
  await check('Production worker loads from ASAR in a real utility process', async () => {
    assert.ok(inspectorUrl, 'Main-process inspector unavailable')
    mainSocket = new WebSocket(inspectorUrl)
    await new Promise((resolve, reject) => { mainSocket.onopen = resolve; mainSocket.onerror = reject })
    const workerPath = path.join(archive, 'out', 'main', 'stt-worker.js')
    const modelId = (await call('getSettings')).sttModel
    const expression = `new Promise((resolve, reject) => {
      const worker = process.mainModule.require('electron').utilityProcess.fork(${JSON.stringify(workerPath)}, [], { stdio: 'ignore' });
      const timer = setTimeout(() => { worker.kill(); reject(new Error('Worker did not initialize')); }, 8000);
      worker.once('message', message => { clearTimeout(timer); worker.kill(); resolve(message); });
      worker.once('spawn', () => worker.postMessage({ type: 'init', modelId: ${JSON.stringify(modelId)}, cacheDir: ${JSON.stringify(path.join(dir, 'empty-model-cache'))}, language: 'en', allowDownload: false }));
    })`
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Main-process probe timed out')), 10000)
      mainSocket.onmessage = event => {
        const data = JSON.parse(event.data)
        if (data.id === 1) { clearTimeout(timer); resolve(data) }
      }
      mainSocket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
    assert.equal(response.result?.exceptionDetails, undefined, JSON.stringify(response.result?.exceptionDetails))
    assert.equal(response.result?.result?.value?.type, 'model-error')
    assert.match(response.result.result.value.error, /not downloaded|not cached/)
  })
  if (process.argv.includes('--offline')) {
    let lifecyclePcm
    await check('Packaged native ONNX transcribes cached non-default model offline', async () => {
      await evaluate(`window.smokeFinals=[]; window.smokeStatuses=[];
        window.sarathi.onSttFinal(e=>window.smokeFinals.push(e.text));
        window.sarathi.onSttStatus(e=>window.smokeStatuses.push(e.status)); void 0;`)
      await call('setSettings', { sttEngine: 'assemblyai', sttModel: 'Xenova/whisper-small', sttFallbackToLocal: true, sttLanguage: 'en' })
      const start = await call('sttStart', 'system')
      assert.equal(start.success, true, start.error)
      const readyDeadline = Date.now() + 90000
      while (!(await evaluate(`window.smokeStatuses.includes('listening')`)) && Date.now() < readyDeadline) await delay(100)
      assert.equal(await evaluate(`window.smokeStatuses.includes('listening')`), true)
      const wav = fs.readFileSync(path.join(root, 'cache/offline-validation/speech.wav'))
      let pcm
      for (let offset = 12; offset + 8 <= wav.length;) {
        const size = wav.readUInt32LE(offset + 4)
        if (wav.toString('ascii', offset, offset + 4) === 'data') { pcm = wav.subarray(offset + 8, offset + 8 + size); break }
        offset += 8 + size + (size % 2)
      }
      assert.ok(pcm?.length)
      lifecyclePcm = pcm
      const audio = Buffer.concat([pcm, Buffer.alloc(16000 * 2 * 4)]).toString('base64')
      await evaluate(`(() => {
        const bytes=Uint8Array.from(atob(${JSON.stringify(audio)}),c=>c.charCodeAt(0));
        for(let offset=0;offset<bytes.length;offset+=3200) window.sarathi.sttSendAudioChunk('system',bytes.slice(offset,offset+3200).buffer);
      })()`)
      const finalDeadline = Date.now() + 90000
      while (!(await evaluate('window.smokeFinals.length')) && Date.now() < finalDeadline) await delay(100)
      const transcript = await evaluate('window.smokeFinals.join(" ")')
      assert.match(transcript.toLowerCase(), /project/)
      assert.match(transcript.toLowerCase(), /delivery|schedule|meeting/)
      console.log(`PACKAGED_TRANSCRIPT=${transcript}`)
      await call('sttStop', 'system')
    })
    if (process.argv.includes('--lifecycle')) {
      await check('Packaged stop before silence returns the final utterance', async () => {
        assert.ok(lifecyclePcm?.length)
        await evaluate('window.smokeStatuses=[]; window.smokeFinals=[];')
        assert.equal((await call('sttStart', 'system')).success, true)
        const readyDeadline = Date.now() + 90000
        while (!(await evaluate(`window.smokeStatuses.includes('listening')`)) && Date.now() < readyDeadline) await delay(100)
        assert.equal(await evaluate(`window.smokeStatuses.includes('listening')`), true)
        await evaluate(`(() => {
          const bytes=Uint8Array.from(atob(${JSON.stringify(lifecyclePcm.toString('base64'))}),c=>c.charCodeAt(0));
          for(let offset=0;offset<bytes.length;offset+=3200) window.sarathi.sttSendAudioChunk('system',bytes.slice(offset,offset+3200).buffer);
        })()`)
        await call('sttStop', 'system')
        const deadline = Date.now() + 20000
        while (!(await evaluate('window.smokeFinals.length')) && Date.now() < deadline) await delay(100)
        assert.match((await evaluate('window.smokeFinals.join(" ")')).toLowerCase(), /project/)
        assert.equal(await evaluate('window.smokeFinals.length'), 1)
      })
    }
  }
}
main().catch(error => {
  results.push({ name: 'Packaged runtime setup', status: 'FAIL', error: error.message })
  console.error(error)
}).finally(() => {
  socket?.close()
  mainSocket?.close()
  child?.kill()
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ date: new Date().toISOString(), executable, results }, null, 2))
  console.log(`PACKAGED_SMOKE_REPORT=${path.join(dir, 'results.json')}`)
  process.exitCode = results.some(result => result.status === 'FAIL') ? 1 : 0
})
