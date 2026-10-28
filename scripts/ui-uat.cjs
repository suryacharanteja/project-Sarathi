// Live acceptance against the production Electron renderer, using synthetic data.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
if (!process.versions.electron) {
  const env = { ...process.env, SARATHI_DEV_VISIBLE: '1' }; delete env.ELECTRON_RUN_AS_NODE
  const child = require('node:child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true })
  child.on('exit', code => { process.exitCode = code ?? 1 })
  child.on('error', error => { console.error(error); process.exitCode = 1 })
} else {
  const { app, ipcMain, nativeTheme } = require('electron')
  const dir = fs.mkdtempSync(path.join(root, 'cache', 'ui-uat-'))
  app.setPath('userData', path.join(dir, 'profile'))
  const results = []
  let started = false
  const finish = code => {
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2))
    console.log('UI_UAT_REPORT=' + path.join(dir, 'results.json')); app.exit(code)
  }
  const watchdog = setTimeout(() => { results.push({ name: 'Completion', status: 'FAIL', error: '120s timeout' }); finish(1) }, 120000)
  app.on('browser-window-created', (_, win) => {
    if (started) return; started = true
    win.webContents.once('did-finish-load', async () => {
      const js = code => win.webContents.executeJavaScript(code)
      const wait = ms => new Promise(r => setTimeout(r, ms))
      const until = async code => { for (let i=0;i<100;i++) { if(await js(code)) return; await wait(50) } throw new Error('Condition timed out: '+code) }
      const click = selector => js(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}); if(!b) throw Error('Missing control'); b.focus(); b.click()})()`)
      const key = async (keyCode, modifiers=[]) => { win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers}); if (keyCode === 'Enter') win.webContents.sendInputEvent({type:'char',keyCode:'\r'}); win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers}); await wait(80) }
      const theme = async value => { if (await js('document.documentElement.dataset.theme') !== value) await click('[data-testid="theme-toggle"]'); await until(`document.documentElement.dataset.theme === '${value}'`) }
      const shot = async name => { await wait(150); fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG()) }
      const check = async(name,fn) => { try { await fn();results.push({name,status:'PASS'});console.log('PASS: '+name) } catch(e) { results.push({name,status:'FAIL',error:e.message});console.error('FAIL: '+name+': '+e.message) } }
      try {
        win.setSize(820, 860); win.show()
        await until('!!document.querySelector("[data-testid=theme-toggle]")')
        await check('UX-001 initial theme follows OS preference', async()=> assert.equal(await js('document.documentElement.dataset.theme'),nativeTheme.shouldUseDarkColors?'dark':'light'))
        for (const mode of ['light','dark']) {
          await check(`UX-001 ${mode} theme applies and persists through reload`,async()=>{
            await theme(mode); await shot('setup-'+mode)
            await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload()})
            await until('!!document.querySelector("[data-testid=theme-toggle]")')
            assert.equal(await js('document.documentElement.dataset.theme'),mode)
            assert.equal(await js('localStorage.getItem("sarathi-theme")'),mode)
          })
          await check(`UX-001 ${mode} semantic text contrast is at least 4.5:1`,async()=>{
            const pairs=await js(`(()=>{const s=getComputedStyle(document.documentElement); return ['--text-hi','--text-mid','--accent','--danger','--warning','--positive'].map(t=>[t,s.getPropertyValue(t).trim(),s.getPropertyValue('--bg-base').trim(),s.getPropertyValue('--bg-surface').trim()])})()`)
            const lum=hex=>{const raw=hex.replace('#','');const rgb=(raw.length===3?raw.split('').map(c=>c+c).join(''):raw).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
            for(const [token,fg,...backgrounds] of pairs) for(const bg of backgrounds){const a=lum(fg),b=lum(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,token+' '+bg)}
          })
        }
        await check('UX-002 keyboard activates 48px theme control beside Settings',async()=>{
          const before=await js('document.documentElement.dataset.theme')
          await js('document.querySelector("[data-testid=theme-toggle]").focus()'); await key('Enter')
          assert.notEqual(await js('document.documentElement.dataset.theme'),before)
          const size=await js('(()=>{const r=document.querySelector("[data-testid=theme-toggle]").getBoundingClientRect();return [r.width,r.height]})()')
          assert.ok(size.every(v=>v>=48))
        })
        await check('UX-002 four modes remain labeled and selectable at 360px',async()=>{
          win.setMinimumSize(360,480);win.setSize(360,780); await wait(150)
          for(const name of ['Webinar Host','Teacher','Speaker','Meeting']){
            await click(`[aria-label="${name}"]`)
            assert.equal(await js(`document.querySelector('[aria-label="${name}"]').getAttribute('aria-pressed')`),'true')
            assert.equal(await js(`getComputedStyle(document.querySelector('[aria-label="${name}"] span')).display === 'none'`),false)
          }
          assert.equal(await js('innerWidth'),360);assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'),true)
          await shot('setup-narrow')
        })
        await check('UX-002 slide creation, teacher timer and mirror controls work',async()=>{
          await click('[aria-label="Teacher"]');await click('[aria-label="Add slide"]')
          await until(`!!document.querySelector('[aria-label="Slide title"]')`)
          assert.ok(await js(`!!document.querySelector('[aria-label="Slide content"]')`))
          await js(`(()=>{const b=[...document.querySelectorAll('[role=switch]')].find(b=>b.textContent.includes('Lesson timer'));b.click()})()`)
          assert.equal(await js(`[...document.querySelectorAll('[role=switch]')].find(b=>b.textContent.includes('Lesson timer')).getAttribute('aria-checked')`),'true')
          await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Mirror flip')).click()`)
          assert.equal(await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Mirror flip')).getAttribute('aria-pressed')`),'true')
          await shot('teacher-narrow')
          await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Mirror flip')).click()`)
          await click('[aria-label="Delete slide"]');assert.ok(await js('document.body.innerText.includes("No slides yet")'))
        })
        win.setSize(820,860)
        for(const mode of ['light','dark']) {
          await check(`UX-003 ${mode} Settings labels, focus trap and Escape`,async()=>{
            await theme(mode);await click('[aria-label="Settings"]')
            await until('!!document.querySelector("input[type=password]")')
            assert.equal(await js('document.activeElement.getAttribute("role")'),'dialog')
            assert.equal(await js('[...document.querySelectorAll("input[type=password]")].every(i=>!!document.querySelector(`label[for="${i.id}"]`))'),true)
            await key('Tab',['shift']);assert.equal(await js('!!document.activeElement.closest("[role=dialog]")'),true)
            await key('Tab');assert.equal(await js('document.activeElement.getAttribute("data-testid")'),'theme-toggle')
            await js('document.querySelector("[role=dialog] .overflow-y-auto").scrollTop=0');await shot('settings-'+mode)
            await key('Escape');await until('!document.querySelector("[role=dialog]")')
            assert.equal(await js('document.activeElement.getAttribute("aria-label")'),'Settings')
          })
        }
        await check('UX-003 dropdown supports arrows, Enter and focus return',async()=>{
          await js(`(()=>{const b=[...document.querySelectorAll('[role=switch]')].find(b=>b.textContent.includes('Audience'));if(b.getAttribute('aria-checked')==='false')b.click()})()`)
          await until('!!document.querySelector("[aria-haspopup=listbox]")')
          await click('[aria-haspopup=listbox]');await until('!!document.querySelector("[role=option]:focus")')
          await key('ArrowDown');const chosen=await js('document.activeElement.textContent');await key('Enter')
          assert.equal(await js('document.querySelector("[aria-haspopup=listbox]").textContent'),chosen)
          assert.equal(await js('document.activeElement.getAttribute("aria-haspopup")'),'listbox')
        })
        await check('UX-004 presentation preserves content while switching both themes',async()=>{
          await click('[aria-label="Meeting"]')
          await js(`(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Live UAT: a clear presentation begins with a simple plan.\\n'+'Manual scroll acceptance line.\\n'.repeat(100));t.dispatchEvent(new Event('input',{bubbles:true}));const b=[...document.querySelectorAll('[role=switch]')].find(b=>b.textContent.includes('Audience'));if(b.getAttribute('aria-checked')==='true')b.click()})()`)
          await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Start Presenting')).click()`)
          await until('!!document.querySelector("[data-screen=presentation]")')
          await check('UX-006 manual controls pause auto-scroll and move the script',async()=>{
            const area='[data-screen=presentation] .overflow-y-auto'
            const targets=await js(`['Scroll up manually','Pause auto-scroll','Scroll down manually'].map(label=>{const r=document.querySelector('[aria-label="'+label+'"]').getBoundingClientRect();return [r.width,r.height]})`)
            assert.ok(targets.flat().every(size=>size>=48),`scroll controls are below a 48px target: ${JSON.stringify(targets)}`)
            const start=await js(`document.querySelector(${JSON.stringify(area)}).scrollTop`)
            await click('[aria-label="Scroll down manually"]');await wait(600)
            assert.equal(await js('document.querySelector("[aria-label=\\"Resume auto-scroll\\"]").getAttribute("aria-pressed")'),'true')
            const down=await js(`document.querySelector(${JSON.stringify(area)}).scrollTop`)
            assert.ok(down>start,`scroll down did not advance: ${start} -> ${down}`)
            await click('[aria-label="Scroll up manually"]');await wait(600)
            const up=await js(`document.querySelector(${JSON.stringify(area)}).scrollTop`)
            assert.ok(up<down,`scroll up did not return toward the beginning: ${down} -> ${up}`)
            await click('[aria-label="Resume auto-scroll"]');await wait(400)
            assert.ok(await js(`document.querySelector(${JSON.stringify(area)}).scrollTop`)>up,'resume did not restart auto-scroll')
          })
          await check('UX-007 co-pilot collapses when unused and question detection can be toggled',async()=>{
            if(await js('!!document.querySelector("[data-panel=copilot]")')){
              assert.ok(await js('!!document.querySelector("[data-panel=copilot]").innerText.match(/System:|Mic:/)'),'co-pilot was expanded without answers or a visible error')
              win.webContents.send('stt:status',{source:'system',status:'listening'})
              win.webContents.send('stt:status',{source:'mic',status:'listening'})
              await until('!document.querySelector("[data-panel=copilot]")')
            }
            await until('!!document.querySelector("[aria-label=\\"Open co-pilot\\"]")')
            assert.equal(await js('!!document.querySelector("[data-panel=copilot]")'),false)
            assert.equal(await js('document.querySelector("[aria-label=\\"Question detection\\"]").getAttribute("aria-pressed")'),'false')
            win.webContents.send('stt:final',{source:'system',text:'How should we improve this design?'})
            await wait(2200)
            assert.equal(await js('!!document.querySelector("[data-panel=copilot]")'),false,'disabled detection unexpectedly opened the co-pilot')
            await click('[aria-label="Open co-pilot"]')
            await until('!!document.querySelector("[data-panel=copilot]")')
            assert.ok(await js('document.querySelector("[data-panel=copilot]").innerText.includes("How should we improve this design?")'),'transcript stopped when detection was disabled')
            assert.equal(await js('document.querySelector("[data-panel=copilot]").innerText.includes("Question detected")'),false,'disabled detection still raised a question')
            assert.ok(await js('document.querySelector("[data-panel=copilot]").innerText.includes("No answers yet")'),'disabled detection created an answer')
            await click('[aria-label="Minimize co-pilot"]')
            await until('!!document.querySelector("[aria-label=\\"Open co-pilot\\"]")')
            await click('[aria-label="Question detection"]')
            assert.equal(await js('document.querySelector("[aria-label=\\"Question detection\\"]").getAttribute("aria-pressed")'),'true')
            await click('[aria-label="Question detection"]')
            assert.equal(await js('document.querySelector("[aria-label=\\"Question detection\\"]").getAttribute("aria-pressed")'),'false')
            await click('[aria-label="Open co-pilot"]')
            await until('!!document.querySelector("[data-panel=copilot]")')
            await click('[aria-label="Question detection"]')
            assert.equal(await js('document.querySelector("[aria-label=\\"Question detection\\"]").getAttribute("aria-pressed")'),'true')
            await click('[aria-label="Auto answer"]')
            assert.equal(await js('document.querySelector("[aria-label=\\"Auto answer\\"]").getAttribute("aria-pressed")'),'true')
            await click('[aria-label="Minimize co-pilot"]')
            win.webContents.send('stt:status',{source:'system',status:'listening'})
            await wait(120)
            assert.equal(await js('!!document.querySelector("[data-panel=copilot]")'),false,'co-pilot remained open after its actionable error cleared')
          })
          for(const mode of ['light','dark']){await theme(mode);assert.ok(await js('document.body.innerText.includes("Live UAT:")'));await shot('presentation-'+mode)}
          if(!await js('!!document.querySelector("[data-panel=copilot]")')) await click('[aria-label="Open co-pilot"]')
          await until('!!document.querySelector("[data-panel=copilot]")')
          win.setMinimumSize(360,480);win.setSize(360,780);await wait(150)
          assert.equal(await js('innerWidth'),360);assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'),true)
          const bounds=await js(`(()=>{const a=document.querySelector('[data-screen=presentation]').getBoundingClientRect(),b=document.querySelector('[data-panel=copilot]').getBoundingClientRect();return {outer:a.bottom,panel:b.bottom}})()`)
          assert.ok(bounds.panel<=bounds.outer+1,JSON.stringify(bounds));await shot('presentation-narrow')
        })
        await check('UX-008 PDF fit-page and high-DPI canvas rendering',async()=>{
          let stage='returning to setup'
          try {
          await click('[aria-label="Back to setup"]')
          stage='selecting speaker mode'
          await click('[aria-label="Speaker"]')
          stage='waiting for document picker'
          await until(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Browse'))`)
          stage='installing synthetic PDF fixture'
          const content='BT /F1 24 Tf 20 140 Td (Sarathi PDF clarity test) Tj ET'
          const objects=[
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            '<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream'
          ]
          let pdf='%PDF-1.4\n',offsets=[0]
          for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n'}
          const xref=pdf.length
          pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'
          for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n'
          pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF'
          const pdfBytes=Uint8Array.from(Buffer.from(pdf))
          ipcMain.removeHandler('document:getFilePath')
          ipcMain.removeHandler('document:readBytes')
          ipcMain.handle('document:getFilePath',async()=>({filePath:'synthetic-clarity-test.pdf',fileName:'Synthetic PDF',kind:'pdf',text:'PDF clarity test'}))
          ipcMain.handle('document:readBytes',async()=>({data:pdfBytes}))
          stage='loading PDF fixture'
          await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Browse')).click()`)
          stage='starting PDF presentation'
          await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Start Presenting')).click()`)
          stage='waiting for PDF canvas'
          await until('!!document.querySelector("[data-testid=pdf-page-canvas]")')
          await until('document.querySelector("[data-testid=pdf-page-canvas]").width > 0')
          stage='checking fitted high-DPI rendering'
          const metrics=await js(`(()=>{const c=document.querySelector('[data-testid=pdf-page-canvas]'),v=document.querySelector('[data-testid=pdf-page-viewport]'),r=c.getBoundingClientRect();return {cssWidth:r.width,cssHeight:r.height,bitmapWidth:c.width,bitmapHeight:c.height,viewerWidth:v.clientWidth,viewerHeight:v.clientHeight,dpr:devicePixelRatio,zoom:document.querySelector('[data-testid=pdf-zoom]').textContent}})()`)
          assert.ok(metrics.cssWidth>300,`PDF did not fit the viewer: ${JSON.stringify(metrics)}`)
          assert.ok(metrics.cssWidth<=metrics.viewerWidth && metrics.cssHeight<=metrics.viewerHeight,`fit-page overflowed: ${JSON.stringify(metrics)}`)
          assert.ok(metrics.bitmapWidth>=metrics.cssWidth*Math.min(metrics.dpr,2)-2,`canvas backing resolution is too low: ${JSON.stringify(metrics)}`)
          assert.ok(Number.parseInt(metrics.zoom,10)>100,`fit-page did not enlarge the PDF: ${JSON.stringify(metrics)}`)
          await shot('pdf-fit-page')
          const before=Number.parseInt(metrics.zoom,10)
          await click('[aria-label="Zoom in PDF"]');await wait(300)
          assert.ok(Number.parseInt(await js('document.querySelector("[data-testid=pdf-zoom]").textContent'),10)>before,'zoom-in control did not increase scale')
          await click('[data-testid="pdf-fit-page"]')
          assert.equal(await js('document.querySelector("[data-testid=pdf-fit-page]").getAttribute("aria-pressed")'),'true')
          } catch(error) {
            throw new Error(`${stage}: ${error instanceof Error ? error.message : String(error)}`)
          }
        })
      } catch(error) {results.push({name:'Harness',status:'FAIL',error:error.message})}
      clearTimeout(watchdog);finish(results.some(r=>r.status==='FAIL')?1:0)
    })
  })
  require(path.join(root,'out/main/index.js'))
}
