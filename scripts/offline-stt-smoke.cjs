// Uses a locally synthesized 16 kHz mono PCM WAV at cache/offline-validation/speech.wav.
// First: node scripts/offline-stt-smoke.cjs --download
// Then: node scripts/offline-stt-smoke.cjs (fresh router, cached non-default model)
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const modelCache = path.join(root, 'cache', 'offline-validation', 'models')
const model = 'Xenova/whisper-small'
if (!process.versions.electron) {
  const { spawn } = require('node:child_process')
  const env = { ...process.env, SARATHI_DEV_VISIBLE: '1', Sarathi_MODELS_DIR: modelCache }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true })
  child.on('error', error => { console.error(error); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
} else {
  const { app } = require('electron')
  const runDir = fs.mkdtempSync(path.join(root, 'cache', 'offline-stt-'))
  const userData = path.join(runDir, 'user-data')
  fs.mkdirSync(userData)
  app.setPath('userData', userData)
  const results = []
  const finish = code => {
    fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify({ date: new Date().toISOString(), model, modelCache, results }, null, 2))
    console.log(`OFFLINE_REPORT=${path.join(runDir, 'results.json')}`)
    app.exit(code)
  }
  const watchdog = setTimeout(() => { results.push({ status: 'FAIL', error: 'Timed out after ten minutes' }); finish(1) }, 600000)
  app.once('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', async () => {
      const js = code => window.webContents.executeJavaScript(code)
      const call = (name, ...args) => js(`window.sarathi[${JSON.stringify(name)}](...${JSON.stringify(args)})`)
      async function until(expression, timeout = 90000) {
        const deadline = Date.now() + timeout
        while (Date.now() < deadline) {
          const value = await js(expression)
          if (value) return value
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        throw new Error(`Timeout: ${expression}`)
      }
      try {
        await js(`window.smoke={status:[],engine:[],final:[],error:[],model:null};
          window.sarathi.onSttStatus(e=>window.smoke.status.push(e));
          window.sarathi.onSttEngine(e=>window.smoke.engine.push(e));
          window.sarathi.onSttFinal(e=>window.smoke.final.push(e));
          window.sarathi.onSttError(e=>window.smoke.error.push(e));
          window.sarathi.onSttModelStatus(e=>window.smoke.model=e); void 0;`)
        await call('setSettings', { sttModel: model, sttEngine: 'assemblyai', sttFallbackToLocal: true, sttLanguage: 'en' })
        if (process.argv.includes('--download')) {
          const progress = setInterval(async () => {
            console.log('MODEL_PROGRESS=' + JSON.stringify(await js('window.smoke.model')))
          }, 15000)
          let download
          try { download = await call('sttEnsureModel') } finally { clearInterval(progress) }
          console.log('DOWNLOAD_RESULT=' + JSON.stringify(download))
          assert.equal(download.ok, true, download.error)
          results.push({ name: 'Non-default model download and native ONNX load', status: 'PASS' })
        } else {
          // No status query or model configuration before start: this is the CR-006 cold-router case.
          const started = await call('sttStart', 'system')
          assert.equal(started.success, true, started.error)
          await until(`window.smoke.status.some(e=>e.source==='system' && e.status==='listening')`)
          assert.equal(await js(`window.smoke.engine.at(-1).engine`), 'local')
          results.push({ name: 'Fresh no-key router selects cached non-default model', status: 'PASS' })
          const wav = fs.readFileSync(path.join(root, 'cache/offline-validation/speech.wav'))
          assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
          let pcm
          for (let offset = 12; offset + 8 <= wav.length;) {
            const size = wav.readUInt32LE(offset + 4)
            if (wav.toString('ascii', offset, offset + 4) === 'data') { pcm = wav.subarray(offset + 8, offset + 8 + size); break }
            offset += 8 + size + (size % 2)
          }
          assert.ok(pcm?.length, 'WAV data chunk missing')
          const base64 = Buffer.concat([pcm, Buffer.alloc(16000 * 2 * 4)]).toString('base64')
          const begin = Date.now()
          await js(`(() => {
            const bytes=Uint8Array.from(atob(${JSON.stringify(base64)}), c=>c.charCodeAt(0));
            for(let offset=0;offset<bytes.length;offset+=3200) window.sarathi.sttSendAudioChunk('system',bytes.slice(offset,offset+3200).buffer);
          })()`)
          const final = await until('window.smoke.final[0]')
          assert.match(final.text.toLowerCase(), /project/)
          assert.match(final.text.toLowerCase(), /delivery|schedule|meeting/)
          results.push({ name: 'Synthetic speech transcribed by native cached model', status: 'PASS', transcript: final.text, elapsedMs: Date.now() - begin })
          console.log('TRANSCRIPT=' + final.text)
          if (process.argv.includes('--lifecycle')) {
            async function sendSpeech(withSilence = true, source = 'system') {
              const encoded = (withSilence ? Buffer.concat([pcm, Buffer.alloc(16000 * 2 * 4)]) : pcm).toString('base64')
              await js(`(() => {
                const bytes=Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0));
                for(let offset=0;offset<bytes.length;offset+=3200) window.sarathi.sttSendAudioChunk(${JSON.stringify(source)},bytes.slice(offset,offset+3200).buffer);
              })()`)
            }
            for (let turn = 1; turn <= 5; turn++) {
              const count = await js('window.smoke.final.length')
              await sendSpeech()
              await until(`window.smoke.final.length === ${count + 1}`, 20000)
              assert.match(await js('window.smoke.final.at(-1).text.toLowerCase()'), /project/)
            }
            results.push({ name: 'Five consecutive speech turns each produce one final', status: 'PASS' })
            const beforeStop = await js('window.smoke.final.length')
            await sendSpeech(false)
            await call('sttStop', 'system')
            await until(`window.smoke.final.length === ${beforeStop + 1}`, 15000)
            results.push({ name: 'Stopping before silence flushes the final utterance', status: 'PASS' })
            await js('window.smoke.status=[]')
            await call('sttStart', 'system')
            await until(`window.smoke.status.some(e=>e.source==='system' && e.status==='listening')`)
            await call('sttStart', 'mic')
            await until(`window.smoke.status.some(e=>e.source==='mic' && e.status==='listening')`)
            const beforeRestart = await js('window.smoke.final.length')
            await sendSpeech()
            await new Promise(resolve => setTimeout(resolve, 50))
            await call('sttStop', 'system')
            await call('sttStart', 'system')
            await sendSpeech()
            await until(`window.smoke.final.length >= ${beforeRestart + 1}`, 25000)
            await sendSpeech(true, 'mic')
            await until(`window.smoke.final.length >= ${beforeRestart + 2}`, 25000)
            assert.equal(await js('window.smoke.final.length'), beforeRestart + 2)
            assert.equal(await js('window.smoke.final.at(-1).source'), 'mic')
            await call('sttStop', 'mic')
            results.push({ name: 'Rapid restart suppresses stale finals while other source keeps transcribing', status: 'PASS' })
          }
          await call('sttStop', 'system')
          await js('window.smoke.status=[]')
          assert.equal((await call('sttStart', 'system')).success, true)
          await until(`window.smoke.status.some(e=>e.status==='listening')`)
          await call('sttStop', 'system')
          results.push({ name: 'Same-session local backend stop/restart', status: 'PASS' })
          // Exercise the actual Retry button after the initial no-key failure.
          await call('setSettings', { sttFallbackToLocal: false, openaiApiKey: 'synthetic-retry-test-key' })
          await js(`localStorage.setItem('sarathi-setup-store', JSON.stringify({state:{activePersona:'meeting'},version:0}));
            localStorage.setItem('sarathi-prompter-draft', JSON.stringify({state:{scriptText:'Offline retry fixture.',aiListenerEnabled:true},version:0}));`)
          await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.reload() })
          window.setSize(1050, 740)
          await until(`document.body.innerText.includes('Start Presenting')`)
          await js(`window.smoke={status:[]}; window.sarathi.onSttStatus(e=>window.smoke.status.push(e)); void 0;`)
          await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Start Presenting')).click()`)
          await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry')`)
          await call('setSettings', { sttFallbackToLocal: true })
          await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Retry').click()`)
          await until(`window.smoke.status.some(e=>e.source==='system' && e.status==='listening')`)
          await until(`![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry') && !document.body.innerText.includes('API key not configured')`)
          fs.writeFileSync(path.join(runDir, 'retry-recovered.png'), (await window.webContents.capturePage()).toPNG())
          await call('sttStop', 'system')
          await call('setSettings', { openaiApiKey: null })
          results.push({ name: 'Real Retry button recovers same session into cached local engine', status: 'PASS' })
        }
        clearTimeout(watchdog)
        finish(0)
      } catch (error) {
        clearTimeout(watchdog)
        results.push({ name: 'Offline STT validation', status: 'FAIL', error: error.message })
        console.error(error)
        finish(1)
      }
    })
  })
  require(path.join(root, 'out/main/index.js'))
}
