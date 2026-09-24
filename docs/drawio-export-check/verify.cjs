const {chromium}=require('playwright');
const fs=require('fs');
const assert=require('assert');
const port=process.env.DRAWIO_TEST_PORT||'8091';
const out=process.env.DRAWIO_TEST_OUTPUT||'/tmp/drawio-check';
fs.mkdirSync(out,{recursive:true});
const capture=`\nconst origInit=EditorUi.prototype.init; EditorUi.prototype.init=function(){window.testUi=this;return origInit.apply(this,arguments);};`;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const mode of ['direct','embedded']){
  const context=await browser.newContext();
  await context.route('**/js/PostConfig.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+capture});});
  await context.route('**/drawio/**',async route=>{const u=new URL(route.request().url()); const r=await route.fetch({url:'http://127.0.0.1:8088'+u.pathname+u.search});let body=await r.body();if(u.pathname.endsWith('/js/PostConfig.js'))body=Buffer.concat([body,Buffer.from(capture)]);await route.fulfill({response:r,body});});
  await context.route('**/api/**',route=>route.fulfill({json:{}}));
  let externalExports=0;
  await context.route('https://convert.diagrams.net/**',route=>{externalExports++;return route.abort();});
  await context.addInitScript(()=>{window.showSaveFilePicker=undefined;sessionStorage.setItem('token','synthetic-ui-test');sessionStorage.setItem('user_role','admin');localStorage.setItem('has_seen_welcome_tour','true');});
  const page=await context.newPage();
  await page.goto(mode==='direct'?`http://127.0.0.1:${port}/?splash=0&lang=en&ui=min`:'http://127.0.0.1:8088/tools/drawio');
  if(mode==='embedded'){await page.waitForSelector('iframe');await page.waitForTimeout(2000);}
  const frame=mode==='direct'?page:page.frames().find(f=>f!==page.mainFrame());
  await frame.waitForFunction(()=>window.testUi?.editor?.graph);
  await frame.waitForTimeout(1500);
  await frame.evaluate(()=>{
   const g=testUi.editor.graph;const parent=g.getDefaultParent();
   g.getModel().beginUpdate();try{const a=g.insertVertex(parent,null,'PDF regression test',100,100,200,80,'rounded=1;fillColor=#dae8fc;');const b=g.insertVertex(parent,null,'PNG WebP XML OK',400,100,200,80,'fillColor=#d5e8d4;');g.insertEdge(parent,null,'export',a,b);}finally{g.getModel().endUpdate();}
   // Retain the actual print window in headless mode, whose native dialog closes immediately.
   window.printCalls=0;const open=window.open;window.open=function(){const w=open.apply(this,arguments);if(w){w.print=()=>{window.printCalls++;};w.close=()=>{};}return w;};
  });
  console.log(mode,await frame.evaluate(()=>({version:EditorUi.VERSION,exportUrl:EXPORT_URL,printPdf:testUi.isPrintPdfExport()})));
  await frame.evaluate(()=>testUi.actions.get('exportPdf').funct());
  const popupPromise=page.waitForEvent('popup');
  await frame.locator('.geDialog .gePrimaryBtn').click();
  const popup=await popupPromise;
  await frame.waitForFunction(()=>window.printCalls>0);
  await popup.waitForFunction(()=>document.body.innerText.includes('PDF regression test'));
  const pdf=await popup.pdf({path:`${out}/${mode}.pdf`,printBackground:true,preferCSSPageSize:true});
  assert(pdf.subarray(0,5).equals(Buffer.from('%PDF-')));
  console.log(mode,'PDF print invoked; preview text:',(await popup.locator('body').innerText()).trim(),'bytes:',pdf.length);
  await popup.close();
  for(const format of ['png','webp','xml']){
   const downloadPromise=page.waitForEvent('download');
   if(format==='xml'){await frame.evaluate(()=>testUi.downloadFile('xml'));}else{await frame.evaluate(format=>testUi.actions.get(format==='png'?'exportPng':'exportWebp').funct(),format); await frame.locator('.geDialog .gePrimaryBtn').click();}
   console.log(mode,format,'dialog',(await frame.locator('.geDialog').innerText()).slice(-600)); await frame.locator('.geDialog .gePrimaryBtn').waitFor();
   await frame.locator('.geDialog .gePrimaryBtn').click();
   const download=await downloadPromise;await download.saveAs(`${out}/${mode}.${format}`);
   const data=fs.readFileSync(`${out}/${mode}.${format}`);
   if(format==='png')assert.equal(data.subarray(1,4).toString(),'PNG');
   if(format==='webp')assert.equal(data.subarray(8,12).toString(),'WEBP');
   if(format==='xml')assert(data.includes(Buffer.from('<mxfile')));
   console.log(mode,format,'downloaded',data.length,'bytes');
  }
  if(mode==='embedded'){
   await page.evaluate(()=>{window.saveMessage=null;window.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.event==='save'||m.event==='autosave')window.saveMessage=m;}catch{}});});
   await frame.evaluate(()=>testUi.actions.get('save').funct());
   await page.waitForFunction(()=>window.saveMessage?.xml?.includes('<mxfile'));
   console.log(mode,'save postMessage XML received by parent');
  }
  assert.equal(externalExports,0);console.log(mode,'external export requests:',externalExports);
  await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
