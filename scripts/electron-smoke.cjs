// Run after `npm run build`: node scripts/electron-smoke.cjs [--keep-open] [--native-picker]
// --native-picker requires manual/desktop selection of the printed fixture, then Cancel.
// Uses synthetic fixtures and a fresh userData directory; never uses real keys.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')

if (!process.versions.electron) {
  const { spawn } = require('node:child_process')
  const env = { ...process.env, SARATHI_DEV_VISIBLE: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [__filename, ...process.argv.slice(2)], {
    env, stdio: 'inherit', windowsHide: true
  })
  child.on('error', error => { console.error(error); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
} else {
  const { app, BrowserWindow, dialog, safeStorage, utilityProcess, ipcMain } = require('electron')
  let deleteBeforeHtml = false
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, handler) => originalHandle(channel, (event, ...args) => {
    if (channel === 'document:getHtml' && deleteBeforeHtml) {
      deleteBeforeHtml = false
      fs.unlinkSync(args[0])
    }
    return handler(event, ...args)
  })
  const cacheRoot = path.join(root, 'cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  const runDir = fs.mkdtempSync(path.join(cacheRoot, 'electron-smoke-'))
  const userData = path.join(runDir, 'user-data')
  fs.mkdirSync(userData)
  app.setPath('userData', userData)
  const results = []
  const timeoutMs = process.argv.includes('--native-picker') ? 180000 : 45000
  const watchdog = setTimeout(() => {
    results.push({ name: 'Smoke harness completion', status: 'FAIL', error: `Timed out after ${timeoutMs / 1000} seconds` })
    fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify({ results }, null, 2))
    app.exit(1)
  }, timeoutMs)
  let started = false
  let killNextWorker = false
  const originalFork = utilityProcess.fork
  utilityProcess.fork = function (...args) {
    const child = originalFork.apply(this, args)
    if (killNextWorker) {
      killNextWorker = false
      child.once('spawn', () => child.kill())
    }
    return child
  }

  async function check(name, operation) {
    try {
      await operation()
      results.push({ name, status: 'PASS' })
      console.log(`PASS: ${name}`)
    } catch (error) {
      results.push({ name, status: 'FAIL', error: error.message })
      console.error(`FAIL: ${name}: ${error.message}`)
    }
  }

  app.on('browser-window-created', (_event, window) => {
    if (started) return
    started = true
    window.webContents.once('did-finish-load', async () => {
      window.setSkipTaskbar(false)
      window.setAlwaysOnTop(false)
      window.setTitle('Sarathi smoke test')
      window.show()
      const call = (name, ...args) => window.webContents.executeJavaScript(
        `window.sarathi[${JSON.stringify(name)}](...${JSON.stringify(args)})`
      )
      const selected = path.join(runDir, 'selected.txt')
      const unrelated = path.join(runDir, 'unrelated.txt')
      fs.writeFileSync(selected, 'Sarathi integration fixture: selected document.')
      fs.writeFileSync(unrelated, 'Synthetic unrelated fixture.')
      const originalPicker = dialog.showOpenDialog
      for (const extension of ['docx', 'exe']) {
        await check(`Invalid ${extension} selection returns a structured error`, async () => {
          const invalid = path.join(runDir, `invalid.${extension}`)
          fs.writeFileSync(invalid, 'Synthetic invalid document')
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [invalid] })
          try { assert.ok((await call('getDocumentFilePath')).error) }
          finally { dialog.showOpenDialog = originalPicker }
        })
      }
      await check('Cancelled picker leaves no selected document', async () => {
        dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
        try { assert.deepEqual(await call('getDocumentFilePath'), { cancelled: true }) }
        finally { dialog.showOpenDialog = originalPicker }
      })
      if (process.argv.includes('--without-libreoffice')) {
        await check('PPTX selection reports the missing LibreOffice dependency', async () => {
          const fixture = path.join(runDir, 'dependency-check.pptx')
          fs.writeFileSync(fixture, 'Synthetic extension-routing fixture; no conversion expected.')
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
          try { assert.match((await call('getDocumentFilePath')).error, /LibreOffice is required/) }
          finally { dialog.showOpenDialog = originalPicker }
        })
      }
      await check('Missing selected PDF returns a structured error', async () => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(runDir, 'missing.pdf')] })
        try { assert.ok((await call('getDocumentFilePath')).error) }
        finally { dialog.showOpenDialog = originalPicker }
      })
      await check('Native picker failure returns a structured error', async () => {
        dialog.showOpenDialog = async () => { throw new Error('Synthetic picker failure') }
        try { assert.match((await call('getDocumentFilePath')).error, /Synthetic picker failure/) }
        finally { dialog.showOpenDialog = originalPicker }
      })
      await check('Production renderer and preload load', async () => {
        assert.equal(await window.webContents.executeJavaScript('typeof window.sarathi.getSettings'), 'function')
        assert.equal((await call('listSessions')).length, 0)
      })
      await check('Windows safeStorage encrypts synthetic key on disk and decrypts through IPC', async () => {
        assert.equal(safeStorage.isEncryptionAvailable(), true)
        const synthetic = 'sarathi-smoke-synthetic-key-not-a-credential'
        await call('setSettings', { openaiApiKey: synthetic })
        const raw = fs.readFileSync(path.join(userData, 'Sarathi-settings.json'), 'utf8')
        assert.equal(raw.includes(synthetic), false)
        assert.equal((await call('getSettings')).openaiApiKey, synthetic)
        await call('setSettings', { openaiApiKey: null })
      })
      await check('Real IPC rejects unselected files through both document endpoints', async () => {
        assert.match((await call('readDocumentBytes', unrelated)).error, /Select this document/)
        assert.match((await call('getDocumentHtml', unrelated)).error, /Select this document/)
      })
      await check('Picker-authorized TXT can be read through real IPC', async () => {
        // Native picker selection is the sole stub in this document test.
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
        try {
          const document = await call('getDocumentFilePath')
          assert.equal(document.kind, 'document')
          assert.match((await call('getDocumentHtml', document.filePath)).html, /integration fixture/)
          assert.ok((await call('readDocumentBytes', document.filePath)).data.length > 0)
        } finally { dialog.showOpenDialog = originalPicker }
      })
      await check('No-key/no-model STT startup returns an actionable failure', async () => {
        const result = await call('sttStart', 'system')
        assert.equal(result.success, false)
        assert.match(result.error, /API key not configured/)
      })
      for (const attempt of [1, 2]) {
        await check(`Real speech utility process exit settles model request (attempt ${attempt})`, async () => {
          killNextWorker = true
          let timer
          try {
            const result = await Promise.race([
              call('sttEnsureModel'),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Model request hung after worker exit')), 8000) })
            ])
            assert.equal(result.ok, false)
            assert.match(result.error, /stopped unexpectedly/)
          } finally { clearTimeout(timer) }
        })
      }
      await check('Generate synthetic PDF fixture in Chromium', async () => {
        const fixture = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
        try {
          await fixture.loadURL('data:text/html,<h1>Sarathi PDF smoke test</h1><p>Selected document fixture.</p>')
          fs.writeFileSync(path.join(runDir, 'fixture.pdf'), await fixture.webContents.printToPDF({}))
        } finally { fixture.destroy() }
      })
      const js = code => window.webContents.executeJavaScript(code)
      async function until(expression) {
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
          if (await js(expression)) return
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        throw new Error(`Renderer condition timed out: ${expression}`)
      }
      async function clickText(text) {
        await js(`(() => {
          const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}));
          if (!button) throw new Error('Missing button: ' + ${JSON.stringify(text)});
          button.click();
        })()`)
      }
      await check('DOCX visual conversion or formatted fallback works with real parsers', async () => {
        const JSZip = require('jszip')
        const zip = new JSZip()
        zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Sarathi DOCX integration fixture.</w:t></w:r></w:p></w:body></w:document>')
        const docx = path.join(runDir, 'fixture.docx')
        fs.writeFileSync(docx, await zip.generateAsync({ type: 'nodebuffer' }))
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [docx] })
        try {
          const result = await call('getDocumentFilePath')
          assert.ok(result.filePath, result.error)
          if (result.kind === 'document') assert.match((await call('getDocumentHtml', result.filePath)).html, /DOCX integration fixture/)
          else assert.ok((await call('readDocumentBytes', result.filePath)).data.length > 0)
          console.log(`DOCX_MODE=${result.kind}`)
        } finally { dialog.showOpenDialog = originalPicker }
      })
      await check('Settings renderer displays secure-storage failure (availability injected)', async () => {
        await call('setSettings', { openaiApiKey: 'synthetic-ui-smoke-key' })
        await js(`document.querySelector('button[title="Settings"]').click()`)
        await until(`!!document.querySelector('input[type="password"]')`)
        const originalAvailable = safeStorage.isEncryptionAvailable
        safeStorage.isEncryptionAvailable = () => false
        try {
          await clickText('Save')
          await until(`document.querySelector('[role="alert"]')?.textContent.includes('Secure key storage is unavailable')`)
          await js(`document.querySelector('[role="alert"]').scrollIntoView({ block: 'center' })`)
          await js(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
          fs.writeFileSync(path.join(runDir, 'settings-error.png'), (await window.webContents.capturePage()).toPNG())
        } finally { safeStorage.isEncryptionAvailable = originalAvailable }
      })
      await check('Production PDF canvas renders and initial audio failure offers Retry', async () => {
        // Reload to close Settings and refresh the synthetic provider key.
        await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.reload() })
        window.setSize(1050, 740)
        await until(`document.body.innerText.includes('Start Presenting')`)
        await clickText('Speaker')
        await until(`document.body.innerText.includes('Browse')`)
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(runDir, 'fixture.pdf')] })
        try {
          await clickText('Browse')
          await until(`document.body.innerText.includes('fixture.pdf')`)
        } finally { dialog.showOpenDialog = originalPicker }
        await check('Failed replacement preserves the existing PDF and permits retry', async () => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
          deleteBeforeHtml = true
          try {
            await clickText('Replace document')
            await until(`document.body.innerText.includes('ENOENT')`)
            assert.equal(await js(`document.body.innerText.includes('PDF loaded')`), true)
            assert.equal(await js(`document.body.innerText.includes('fixture.pdf')`), true)
            await until(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Replace document') && !b.disabled)`)
            fs.writeFileSync(selected, 'Recovered replacement fixture.')
            await clickText('Replace document')
            await until(`document.body.innerText.includes('Document loaded') && document.body.innerText.includes('selected.txt')`)
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(runDir, 'fixture.pdf')] })
            await clickText('Replace document')
            await until(`document.body.innerText.includes('PDF loaded') && document.body.innerText.includes('fixture.pdf')`)
          } finally {
            deleteBeforeHtml = false
            dialog.showOpenDialog = originalPicker
          }
        })
        await clickText('Start Presenting')
        await until(`!!document.querySelector('canvas') && document.querySelector('canvas').width > 300`)
        await until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Retry')`)
        await clickText('Retry')
        await until(`document.body.innerText.includes('API key not configured') && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Retry')`)
        fs.writeFileSync(path.join(runDir, 'pdf-and-retry.png'), (await window.webContents.capturePage()).toPNG())
      })
      await call('setSettings', { openaiApiKey: null })
      for (const source of ['mic', 'system']) {
        await check(`Real ${source} audio track and worklet acquire/release without recording`, async () => {
          const result = await window.webContents.executeJavaScript(`(async () => {
            let stream;
            let context;
            let timer;
            let expired = false;
            try {
              if (${JSON.stringify(source)} === 'system') await window.sarathi.enableLoopbackAudio();
              const acquire = ${JSON.stringify(source)} === 'mic'
                ? navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
                : navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
              acquire.then(value => { if (expired) value.getTracks().forEach(track => track.stop()); });
              stream = await Promise.race([acquire, new Promise((_, reject) => {
                timer = setTimeout(() => { expired = true; reject(new Error('Device acquisition timed out')); }, 8000);
              })]);
              const audioTracks = stream.getAudioTracks().length;
              if (!audioTracks) throw new Error('No audio track available');
              context = new AudioContext();
              await context.audioWorklet.addModule('./pcm-capture-worklet.js');
              const node = new AudioWorkletNode(context, 'pcm-capture-processor');
              node.disconnect();
              stream.getTracks().forEach(track => track.stop());
              return { audioTracks, released: stream.getTracks().every(track => track.readyState === 'ended') };
            } finally {
              clearTimeout(timer);
              stream?.getTracks().forEach(track => track.stop());
              if (context) await context.close();
              if (${JSON.stringify(source)} === 'system') await window.sarathi.disableLoopbackAudio();
            }
          })()`, true)
          assert.ok(result.audioTracks > 0)
          assert.equal(result.released, true)
        })
      }
      if (process.argv.includes('--native-picker')) {
        fs.writeFileSync(selected, 'Sarathi native picker fixture.')
        console.log(`NATIVE_PICKER_SELECT=${selected}`)
        await check('Native Windows picker selects TXT and authorizes real HTML read', async () => {
          const picked = await call('getDocumentFilePath')
          assert.equal(picked.filePath, selected)
          assert.match((await call('getDocumentHtml', picked.filePath)).html, /native picker fixture/)
        })
        console.log('NATIVE_PICKER_CANCEL_NEXT')
        await check('Native Windows picker cancellation returns cleanly', async () => {
          assert.deepEqual(await call('getDocumentFilePath'), { cancelled: true })
        })
      }
      const report = { date: new Date().toISOString(), electron: process.versions.electron, userData, results }
      clearTimeout(watchdog)
      fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(report, null, 2))
      console.log(`SMOKE_REPORT=${path.join(runDir, 'results.json')}`)
      console.log(`SMOKE_FIXTURES=${runDir}`)
      if (!process.argv.includes('--keep-open')) app.exit(results.some(result => result.status === 'FAIL') ? 1 : 0)
    })
  })
  require(path.join(root, 'out/main/index.js'))
}
