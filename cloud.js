/* StockTake cloud roles with Neon PostgreSQL. */
(() => {
'use strict';
const API_URL='/api/index';
const root=document.createElement('div');root.id='roleApp';document.body.prepend(root);
const state={user:null,role:null,isAdmin:false,date:new Date().toLocaleDateString('en-CA'),records:{},busy:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let seeded=false;
async function api(action,params={}){
 const controller=new AbortController();
 let timeoutId;
 const deadline=new Promise((_,reject)=>{timeoutId=setTimeout(()=>{controller.abort();reject(new Error('Sign-in request timed out. Please retry. If this repeats, the server is not responding.'))},10000)});
 try{
  const request=fetch(API_URL,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({action,...params}),signal:controller.signal}).then(async response=>{
   let result={};try{result=await response.json()}catch(e){}
   if(!response.ok)throw Error(result.error||'Backend request failed (HTTP '+response.status+').');
   return result;
  });
  return await Promise.race([request,deadline]);
 }catch(err){
  if(err.name==='AbortError')throw Error('Sign-in request was interrupted. Please try again.');
  if(err instanceof TypeError)throw Error('Unable to reach the sign-in server. Check your connection and try again.');
  throw err;
 }finally{clearTimeout(timeoutId)}
}
const message=(s)=>{const e=root.querySelector('#roleMessage');if(e)e.textContent=s};
const button=(id,label)=>'<button type="button" id="'+id+'" class="role-button">'+label+'</button>';
function shell(inner){root.innerHTML='<div class="role-shell"><div class="role-card"><img src="./brand/cgv-stocktake.svg" alt="CGV StockTake" class="role-logo">'+inner+'<p id="roleMessage" role="status"></p></div></div>'}
async function login(){
 document.querySelector('.frame').hidden=true;
 let setup=false;
 try{const status=await api('status');setup=!!status.needsSetup;}catch(err){shell('<div class="workspace-intro"><h2>Unable to connect</h2><p>'+esc(err.message)+'</p></div><button type="button" class="role-button" onclick="location.reload()">Try again</button>');return;}
 const form=setup
 ? '<div class="workspace-intro"><span class="workspace-eyebrow">FIRST-TIME SETUP</span><h2>Create administrator</h2><p>Set up the first StockTake administrator. Use a unique password of at least 12 characters.</p></div><form id="roleLogin"><label>Admin username<input name="username" autocomplete="username" required minlength="3" maxlength="32"></label><label>Password<input name="password" type="password" autocomplete="new-password" required minlength="12"></label><button class="role-button">Create administrator</button></form>'
 : '<div class="workspace-intro"><span class="workspace-eyebrow">WELCOME BACK</span><h2>Sign in</h2><p>Enter your username to continue.</p></div><form id="roleLogin" data-step="username"><label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="32"></label><button type="submit" class="role-button">Continue</button></form>';
 shell(form);
 const formEl=root.querySelector('#roleLogin');
 formEl.onsubmit=async e=>{
  e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type="submit"]')||f.querySelector('button');b.disabled=true;message('');
  if(setup){
   b.textContent='Creating…';
   try{const result=await api('setup',{username:f.elements.username.value.trim().toLowerCase(),password:f.elements.password.value});state.user=result.user.username;state.role=result.user.role;state.isAdmin=!!result.user.is_admin;if(state.isAdmin&&!seeded){await api('seedCatalog');seeded=true;}welcome();}
   catch(err){message(err.message)}
   finally{b.disabled=false;b.textContent='Create administrator'}
   return;
  }
  const username=f.dataset.step==='credential'?f.dataset.username:f.elements.username.value.trim().toLowerCase();
  if(f.dataset.step==='username'){
   b.textContent='Checking…';
   try{
    const result=await api('loginMethods',{username});
    if(result.needsSetup){setup=true;f.innerHTML='<div class="workspace-intro"><span class="workspace-eyebrow">FIRST-TIME SETUP</span><h2>Create administrator</h2><p>Set up the first StockTake administrator. Use a unique password of at least 12 characters.</p></div><label>Admin username<input name="username" value="'+esc(username)+'" autocomplete="username" required minlength="3" maxlength="32"></label><label>Password<input name="password" type="password" autocomplete="new-password" required minlength="12"></label><button type="submit" class="role-button">Create administrator</button>';return;}
    const methods=result.methods||{};
    if(!methods.password&&!methods.pin)throw Error('No sign-in method is configured for this account.');
    const choices=(methods.password&&methods.pin)
      ?'<div class="credential-switch" role="group" aria-label="Sign-in method"><button type="button" class="is-selected" data-method="password">Password</button><button type="button" data-method="pin">PIN</button></div>'
      :'<p class="workspace-access">'+(methods.pin?'PIN sign-in':'Password sign-in')+'</p>';
    const method=methods.password?'password':'pin';
    f.dataset.step='credential';f.dataset.username=username;
    f.innerHTML='<div class="workspace-intro"><h2>Welcome, '+esc(username)+'</h2><p>'+(methods.password&&methods.pin?'Choose how you would like to sign in.':'Enter your '+(methods.pin?'PIN':'password')+' to continue.')+'</p></div>'+choices+'<label id="credentialLabel">'+(method==='pin'?'PIN':'Password')+'<input name="credential" type="'+(method==='pin'?'tel':'password')+'" autocomplete="'+(method==='pin'?'one-time-code':'current-password')+'" '+(method==='pin'?'inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8"':'')+' required placeholder="'+(method==='pin'?'Enter 4–8 digit PIN':'Enter your password')+'"></label><button type="submit" class="role-button">Sign in</button><button type="button" id="backToUsername" class="role-button role-secondary">Back</button>';
    f.querySelectorAll('[data-method]').forEach(btn=>btn.onclick=()=>{
      const pin=btn.dataset.method==='pin';
      f.querySelectorAll('[data-method]').forEach(x=>x.classList.toggle('is-selected',x===btn));
      const label=f.querySelector('#credentialLabel');label.firstChild.textContent=pin?'PIN':'Password';
      const input=f.elements.credential;input.type=pin?'tel':'password';input.inputMode=pin?'numeric':'text';input.autocomplete=pin?'one-time-code':'current-password';input.pattern=pin?'[0-9]{4,8}':'';input.minLength=pin?4:0;input.maxLength=pin?8:256;input.placeholder=pin?'Enter 4–8 digit PIN':'Enter your password';input.value='';
    });
    f.querySelector('#backToUsername').onclick=()=>login();
    f.querySelector('button[type="submit"]').focus();
   }catch(err){message(err.message)}
   finally{b.disabled=false;if(f.dataset.step==='username')b.textContent='Continue'}
   return;
  }
  const selected=f.querySelector('[data-method].is-selected')?.dataset.method||(f.querySelector('[data-method]')? 'password':(f.querySelector('#credentialLabel')?.textContent.includes('PIN')?'pin':'password'));
  const credential=f.elements.credential?.value||'';
  const submitButton=f.querySelector('button[type="submit"]');
  if(!submitButton||submitButton.dataset.submitting==='yes')return;
  submitButton.dataset.submitting='yes';submitButton.disabled=true;submitButton.textContent='Signing in…';
  let recovered=false;
  const recoveryTimer=setTimeout(()=>{
   recovered=true;submitButton.disabled=false;submitButton.textContent='Try again';
   delete submitButton.dataset.submitting;
   message('Sign-in is taking too long. Please try again. If this keeps happening, the server request is not completing.');
  },12000);
  try{
   const result=await api('login',{username:f.dataset.username,method:selected,[selected]:credential});
   clearTimeout(recoveryTimer);
   state.user=result.user.username;state.role=result.user.role;state.isAdmin=!!result.user.is_admin;welcome();
  }catch(err){message(err.message)}
  finally{
   clearTimeout(recoveryTimer);
   if(!recovered&&submitButton.isConnected){submitButton.disabled=false;submitButton.textContent='Sign in';delete submitButton.dataset.submitting;}
  }
 };
}
function welcome(){
 document.querySelector('.frame').hidden=true;
 const r=state.role;
 shell('<div class="workspace-intro"><span class="workspace-eyebrow">SELECT WORKSPACE</span><h2>Choose your workspace</h2><p>Signed in as <strong>'+esc(state.user)+'</strong> <span class="workspace-access">'+esc(state.isAdmin?'admin':r)+'</span></p></div><div class="role-choices workspace-choices"><button type="button" id="enterCounter" class="role-button workspace-choice"><span class="workspace-choice-icon" aria-hidden="true">01</span><span class="workspace-choice-copy"><strong>Counter</strong><small>Enter physical stock quantities</small></span><span class="workspace-choice-arrow" aria-hidden="true">↗</span></button><button type="button" id="enterVerifier" class="role-button workspace-choice"><span class="workspace-choice-icon" aria-hidden="true">02</span><span class="workspace-choice-copy"><strong>Verifier</strong><small>Review counts and manage stock</small></span><span class="workspace-choice-arrow" aria-hidden="true">↗</span></button></div><div class="workspace-footer"><span>CGV · STOCKTAKE</span>'+button('roleLogout','Sign out')+'</div>');
 root.querySelector('#enterCounter').disabled=r!=='counter';root.querySelector('#enterVerifier').disabled=r!=='verifier';
 root.querySelector('#enterCounter').onclick=()=>counter();
 root.querySelector('#enterVerifier').onclick=()=>verifier();

 root.querySelector('#roleLogout').onclick=logout;
}
function mountStaffAccounts(){
  if(!state.isAdmin)return;
  const area=document.createElement('section');area.className='role-admin';
  area.innerHTML='<h3>Staff accounts</h3><p>Create Counter or Verifier access, or add a PIN to an existing account.</p><form id="newStaffForm"><label>New username<input name="username" required minlength="3" maxlength="32" pattern="[a-zA-Z][a-zA-Z0-9_.-]{2,31}" autocomplete="off"></label><label>Sign-in method<select name="credentialType"><option value="password">Password</option><option value="pin">PIN (4–8 digits)</option></select></label><label id="staffCredentialLabel">New password<input name="credential" type="password" required minlength="12" autocomplete="new-password"></label><label>Role<select name="role"><option value="counter">Counter</option><option value="verifier">Verifier</option></select></label><button class="role-button">Create account</button></form><p id="staffResult" role="status"></p>';
  document.querySelector('#itemCataloguePanel').appendChild(area);
  const staffForm=area.querySelector('form');
  const updateCredential=()=>{const pin=staffForm.elements.credentialType.value==='pin',input=staffForm.elements.credential,label=staffForm.querySelector('#staffCredentialLabel');label.firstChild.textContent=pin?'New PIN':'New password';input.type=pin?'tel':'password';input.inputMode=pin?'numeric':'text';input.pattern=pin?'[0-9]{4,8}':'';input.minLength=pin?4:12;input.maxLength=pin?8:256;input.placeholder=pin?'4–8 digits':'At least 12 characters';input.autocomplete=pin?'off':'new-password';input.value='';};
  staffForm.elements.credentialType.onchange=updateCredential;
  updateCredential();
  staffForm.onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]')||form.querySelector('button'),result=area.querySelector('#staffResult');
   button.disabled=true;result.textContent='Creating account…';
   try{const response=await api('createUser',{newUsername:form.elements.username.value,credential:form.elements.credential.value,credentialType:form.elements.credentialType.value,newRole:form.elements.role.value});result.textContent='Created '+response.username+' ('+response.role+').';form.reset();updateCredential()}
   catch(err){result.textContent='Account not created: '+err.message}
   finally{button.disabled=false}
  };
  const pinArea=document.createElement('div');pinArea.className='role-admin';pinArea.style.marginTop='18px';
  pinArea.innerHTML='<h4>Add PIN to existing account</h4><form id="existingPinForm"><label>Existing account<select name="username" required><option value="">Loading accounts…</option></select></label><label>New PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" placeholder="4–8 digits" required></label><button type="submit" class="role-button">Set PIN</button></form><p id="existingPinResult" role="status"></p>';
  area.appendChild(pinArea);
  const pinForm=pinArea.querySelector('#existingPinForm'),pinResult=pinArea.querySelector('#existingPinResult');
  (async()=>{try{const data=await api('listUsers');const select=pinForm.elements.username;select.innerHTML='<option value="">Select an account</option>'+(data.users||[]).filter(u=>u.active).map(u=>'<option value="'+esc(u.username)+'">'+esc(u.username)+' · '+esc(u.role)+'</option>').join('')}catch(err){pinForm.elements.username.innerHTML='<option value="">Could not load accounts</option>';pinResult.textContent=err.message}})();
  pinForm.onsubmit=async e=>{e.preventDefault();const btn=pinForm.querySelector('button');btn.disabled=true;pinResult.textContent='Saving PIN…';try{const result=await api('setUserPin',{username:pinForm.elements.username.value,pin:pinForm.elements.pin.value});pinResult.textContent='PIN added for '+result.username+'. They can now choose PIN on the login screen.';pinForm.elements.pin.value=''}catch(err){pinResult.textContent='PIN not saved: '+err.message}finally{btn.disabled=false}};
  
}
function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length<2)throw Error('CSV must include a header and at least one item.');
 const norm=s=>String(s||'').trim().toLowerCase().replace(/[ _-]/g,'');
 const headers=rows[0].map(norm);
 const find=keys=>headers.findIndex(h=>keys.includes(h));
 const ix={id:find(['id','itemid','code','itemcode']),name:find(['name','itemname','description']),uom:find(['uom','unit','unitofmeasure'])};
 if(Object.values(ix).some(v=>v<0))throw Error('CSV headers must include Item ID, Item Name and UOM.');
 return rows.slice(1).map((r,i)=>({id:String(r[ix.id]||'').trim(),name:String(r[ix.name]||'').trim(),uom:String(r[ix.uom]||'').trim(),line:i+2}));
}
function mountAdminCatalog(){
 const area=document.createElement('section');area.className='role-admin role-catalog-admin';
 area.innerHTML='<h3>Item catalogue</h3><p>Add stock items or import a CSV file. Existing IDs will be updated; archived items can be restored by importing them again.</p><form id="catalogAddForm"><label>Item ID<input name="id" required placeholder="e.g. stock-104"></label><label>Item name<input name="name" required></label><label>UOM<input name="uom" required placeholder="EA, g, ml"></label><button class="role-button">Add item</button></form><hr><label>Import CSV<input id="catalogFile" type="file" accept=".csv,text/csv"></label><div id="catalogPreview" aria-live="polite"></div><button type="button" class="role-button" id="catalogImport" disabled>Import catalogue</button><p id="catalogResult" role="status"></p><div id="catalogItems"></div>';
 document.querySelector('#verifierStaffPanel').appendChild(area);
 const result=area.querySelector('#catalogResult'),preview=area.querySelector('#catalogPreview'),importButton=area.querySelector('#catalogImport');let pending=[];
 async function refresh(){
  try{const data=await api('catalog');state.catalog=(data.items||[]).map(x=>[x.name,x.uom,x.id]);if(window.stockTakeSetCatalog)window.stockTakeSetCatalog(state.catalog);area.querySelector('#catalogItems').innerHTML='<p><strong>'+state.catalog.length+' active items</strong></p>'+state.catalog.map(x=>'<div class="role-item"><span><b>'+esc(x[0])+'</b><small>'+esc(x[2])+' · '+esc(x[1])+'</small></span></div>').join('');}
  catch(err){result.textContent='Could not load catalogue: '+err.message}
 }
 area.querySelector('#catalogAddForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{await api('upsertItem',{item:{id:f.elements.id.value,name:f.elements.name.value,uom:f.elements.uom.value}});result.textContent='Item saved.';f.reset();await refresh()}catch(err){result.textContent=err.message}finally{b.disabled=false}};
 area.querySelector('#catalogFile').onchange=async e=>{pending=[];importButton.disabled=true;try{const file=e.target.files[0];if(!file)return;if(!file.name.toLowerCase().endsWith('.csv'))throw Error('Please export your Excel item list as CSV first.');pending=parseCSV(await file.text());const ids=new Set();for(const x of pending){if(!x.id||!x.name||!x.uom)throw Error('Missing ID, name or UOM on CSV row '+x.line+'.');if(ids.has(x.id))throw Error('Duplicate item ID '+x.id+' in CSV.');ids.add(x.id)}preview.innerHTML='<p>Preview: <strong>'+pending.length+' valid items</strong></p><div class="role-item"><span><b>'+esc(pending[0].id)+' · '+esc(pending[0].name)+'</b><small>'+esc(pending[0].uom)+'</small></span></div>'+(pending.length>1?'<p>… and '+(pending.length-1)+' more rows</p>':'');importButton.disabled=false;result.textContent='Review the preview, then import.';}catch(err){preview.textContent='';result.textContent=err.message}};
 importButton.onclick=async()=>{if(!pending.length)return;importButton.disabled=true;result.textContent='Importing '+pending.length+' items…';try{const r=await api('importItems',{items:pending.map(({id,name,uom})=>({id,name,uom}))});result.textContent='Import complete: '+r.created+' created, '+r.updated+' updated.';pending=[];preview.textContent='';area.querySelector('#catalogFile').value='';await refresh()}catch(err){result.textContent='Import failed: '+err.message;importButton.disabled=false}};
 refresh();
}
function logout(){state.user=null;state.role=null;state.isAdmin=false;seeded=false;api('logout').catch(()=>{});login()}
async function load(){const result=await api('load',{date:state.date});const rows=result.rows;state.records=Object.fromEntries(rows.map(r=>[r.item_id,r]));state.catalog=(result.items||[]).map(it=>[it.name,it.uom,it.id]);return rows}
const catalog=()=>state.catalog||[];
function counterProgress(){const items=catalog(),done=items.filter(i=>state.records[i[2]]?.actual!=null).length,total=items.length,pct=total?Math.round(done/total*100):0;const n=30,filled=Math.round(pct*n/100);return '<section class="count-progress" aria-label="Counting progress"><div class="count-progress-top"><span>DAILY PROGRESS</span><span>'+esc(state.date)+'</span></div><div class="count-progress-metric"><strong id="countPercent">'+pct+'%</strong><span id="roleProgress">'+done+' of '+total+' items counted</span></div><div class="count-segments" id="countSegments" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'" aria-label="Stock items counted">'+Array.from({length:n},(_,i)=>'<i class="'+(i<filled?'filled':'')+'"></i>').join('')+'</div><div class="count-progress-bottom"><span>COMPLETED</span><span id="countRemaining">'+(total-done)+' REMAINING</span></div></section>'}
function refreshCounterProgress(){const items=catalog(),done=items.filter(i=>state.records[i[2]]?.actual!=null).length,pct=items.length?Math.round(done/items.length*100):0;const p=root.querySelector('#roleProgress'),v=root.querySelector('#countPercent'),rem=root.querySelector('#countRemaining'),bar=root.querySelector('#countSegments');if(p)p.textContent=done+' of '+items.length+' items counted';if(v)v.textContent=pct+'%';if(rem)rem.textContent=(items.length-done)+' REMAINING';if(bar){bar.setAttribute('aria-valuenow',pct);bar.querySelectorAll('i').forEach((el,i)=>el.classList.toggle('filled',i<Math.round(pct*30/100)))}}
function counterView(){
 const items=catalog(),done=items.filter(i=>state.records[i[2]]?.actual!==null&&state.records[i[2]]?.actual!==undefined).length;
 shell('<div class="role-toolbar">'+button('roleBack','← Roles')+'<strong>Counter</strong>'+button('roleOut','Sign out')+'</div><h2>Physical stock count</h2><label>Count date <input id="roleDate" type="date" value="'+state.date+'"></label>'+counterProgress()+'<input id="roleSearch" type="search" placeholder="Search stock items" aria-label="Search stock items"><div id="roleItems">'+items.map((it,i)=>'<label class="role-item" data-name="'+esc(it[0].toLowerCase())+'"><span><b>'+(i+1)+'. '+esc(it[0])+'</b><small>'+esc(it[1])+'</small></span><input inputmode="decimal" data-id="'+it[2]+'" aria-label="Quantity for '+esc(it[0])+'" placeholder="Quantity" value="'+esc(state.records[it[2]]?.actual??'')+'"></label>').join('')+'</div>');
 root.querySelector('#roleBack').onclick=welcome;root.querySelector('#roleOut').onclick=logout;
 root.querySelector('#roleSearch').oninput=e=>{const q=e.target.value.toLowerCase();root.querySelectorAll('.role-item').forEach(el=>el.hidden=!el.dataset.name.includes(q))};
 root.querySelector('#roleDate').onchange=async e=>{state.date=e.target.value;try{await load();counterView()}catch(err){message(err.message)}};
 const pendingSaves=new WeakMap();
 async function saveCounterInput(inp){
  clearTimeout(pendingSaves.get(inp));
  const id=inp.dataset.id,raw=inp.value.trim(),v=raw===''?null:Number(raw.replace(',','.'));
  if(raw!==''&&(!Number.isFinite(v)||v<0||!/^\\d+(?:[.,]\\d{1,4})?$/.test(raw))){message('Enter a non-negative quantity with up to 4 decimals.');return}
  inp.disabled=true;
  try{
   await api('save',{date:state.date,item_id:id,value:v===null?'':String(v)});
   state.records[id]={...state.records[id],actual:v};
   message('Saved · synced to verifier.');
   refreshCounterProgress();
  }catch(err){message('Not saved: '+err.message)}
  finally{inp.disabled=false}
 }
 root.querySelectorAll('[data-id]').forEach(inp=>{
  inp.addEventListener('input',()=>{
   clearTimeout(pendingSaves.get(inp));
   pendingSaves.set(inp,setTimeout(()=>saveCounterInput(inp),500));
  });
  inp.addEventListener('change',()=>saveCounterInput(inp));
 });
}
async function counter(){try{await load();counterView()}catch(err){message('Unable to load counts: '+err.message)}}
function setupReportDownloads(){
 const panel=document.querySelector('#reportPanel');
 const tools=window.StockTakeReports;
 if(!panel||!tools||state.role!=='verifier')return;
 const date=panel.querySelector('#reportDate');
 const hint=panel.querySelector('#reportPeriodHint');
 const status=panel.querySelector('#reportDownloadStatus');
 const csvButton=panel.querySelector('#downloadStockReport');
 const pdfButton=panel.querySelector('#downloadExecutivePdf');
 const pdfTools=window.StockTakeExecutivePdf;
 if(!csvButton||!pdfButton||!pdfTools)return;
 const buttons=[csvButton,pdfButton];
 const all=panel.querySelectorAll('[data-report-period]');
 const selectedDate=document.querySelector('#date')?.value||state.date;
 if(/^\d{4}-\d{2}-\d{2}$/.test(selectedDate))date.value=selectedDate;
 if(panel.dataset.reportReady==='yes')return;
 panel.dataset.reportReady='yes';
 let kind='daily';
 function updateHint(){
  try{
   const range=tools.periodRange(kind,date.value);
   hint.textContent=kind==='daily'
     ?'Daily report · '+range.start
     :kind==='weekly'
       ?'Weekly report · '+range.start+' to '+range.end+' (Monday–Sunday)'
       :'Monthly report · '+range.start+' to '+range.end;
  }catch(err){hint.textContent='Select a valid date to choose the report period.'}
 }
 all.forEach(option=>option.addEventListener('click',()=>{
  kind=option.dataset.reportPeriod;
  all.forEach(el=>{
    const active=el===option;
    el.classList.toggle('is-selected',active);
    el.setAttribute('aria-pressed',String(active));
  });
  status.textContent='';
  delete status.dataset.error;
  updateHint();
 }));
 date.addEventListener('change',()=>{
  status.textContent='';
  delete status.dataset.error;
  updateHint();
 });

 async function generateReport(format){
  let range;
  try{range=tools.periodRange(kind,date.value)}
  catch(err){
   status.dataset.error='true';status.textContent=err.message;date.focus();return;
  }
  const isPdf=format==='pdf',button=isPdf?pdfButton:csvButton;
  buttons.forEach(b=>b.disabled=true);
  const original=button.innerHTML;
  button.innerHTML='<span aria-hidden="true">⌛</span> Preparing…';
  status.textContent='Loading saved stock records from Neon…';
  delete status.dataset.error;
  try{
   // Wait for edits which are still in the verifier's auto-save debounce/queue.
   if(verifierSaveTimer)await new Promise(resolve=>setTimeout(resolve,750));
   await verifierSaveQueue;
   const payload=await api('report',{startDate:range.start,endDate:range.end});
   if(isPdf){
    const report=pdfTools.makeExecutivePdf(payload,kind,date.value);
    pdfTools.downloadExecutivePdf(report);
    status.textContent='Executive PDF prepared: '+report.filename+
      ' · '+report.pages+' page(s) · '+report.variances+' variance(s).';
   }else{
    const report=tools.makeReport(payload,kind,date.value);
    tools.download(report);
    status.textContent='Detailed CSV prepared: '+report.filename+' · '+report.activeDays+
      ' day(s) with saved records · '+report.variances+' variance(s).';
   }
  }catch(err){
   status.dataset.error='true';
   status.textContent=String(err.message||err).includes('Unknown action')
     ?'The reporting service needs updating.'
     :'Could not download the '+(isPdf?'PDF':'CSV')+': '+String(err.message||err);
  }finally{
   buttons.forEach(b=>b.disabled=false);
   button.innerHTML=original;
  }
 }
 csvButton.addEventListener('click',()=>generateReport('csv'));
 pdfButton.addEventListener('click',()=>generateReport('pdf'));
 updateHint();
}

let verifierSaveTimer=null;
let verifierSaveQueue=Promise.resolve();
async function verifier(){
 try{
  await load();
  const local={version:2,records:{}};
  for(const [id,r] of Object.entries(state.records))local.records[id]={a:r.actual==null?'':String(r.actual),s:r.system==null?'':String(r.system),r:r.remarks||''};
  localStorage.setItem('stocktake:'+state.date,JSON.stringify(local));
  document.querySelector('.frame').hidden=false;
  root.innerHTML='<span id="roleMessage" class="role-sync-state role-sr-only" role="status" aria-live="polite"></span>';
  if(window.stockTakeSetCatalog)window.stockTakeSetCatalog(catalog());
  if(window.stockTakeOpenDate)window.stockTakeOpenDate(state.date);
  mountStaffAccounts();
  if(state.isAdmin)mountAdminCatalog();
  setupReportDownloads();
  startVerifierLiveSync();
  /* Counter entries sync from Neon automatically while the verifier tab is open. */
 }catch(err){message('Unable to load verifier: '+err.message)}
}


// Verifier live sync: poll Neon for Counter changes and merge Actual quantities
// into the visible table. Poll only while the verifier workspace is active.
let verifierPollTimer=null,verifierPollBusy=false;
async function syncVerifierActuals(){
 if(state.role!=='verifier'||document.querySelector('.frame')?.hidden||document.visibilityState==='hidden'||verifierPollBusy)return;
 const date=document.querySelector('#date')?.value||state.date;
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))return;
 verifierPollBusy=true;
 try{
  const result=await api('load',{date});
  state.date=date;
  for(const row of result.rows||[])state.records[row.item_id]={...state.records[row.item_id],...row};
  if(window.stockTakeSyncActuals)window.stockTakeSyncActuals(result.rows||[],date);
 }catch(err){
  message('Live sync reconnecting…');
 }finally{verifierPollBusy=false}
}
function startVerifierLiveSync(){
 if(verifierPollTimer)clearInterval(verifierPollTimer);
 syncVerifierActuals();
 verifierPollTimer=setInterval(syncVerifierActuals,1000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncVerifierActuals()});
}

function queueVerifierSave(){
 state.date=document.querySelector('#date')?.value||state.date;
 if(state.role!=='verifier'||!document.querySelector('.frame')||document.querySelector('.frame').hidden)return;
 clearTimeout(verifierSaveTimer);
 message('Saving changes…');
 verifierSaveTimer=setTimeout(()=>{
  const date=state.date,items=catalog();
  let records={};
  try{records=JSON.parse(localStorage.getItem('stocktake:'+date)||'{}').records||{}}catch(err){message('Local save unavailable');return}
  const changes=items.filter(it=>records[it[2]]&&String(records[it[2]].s??'')!==String(state.records[it[2]]?.system??'')||records[it[2]]&&String(records[it[2]].r??'')!==String(state.records[it[2]]?.remarks??''));
  for(const it of changes){
   const r=records[it[2]],raw=String(r.s??'').trim().replace(',','.'),value=raw===''?'':Number(raw);
   if(raw!==''&&(!Number.isFinite(value)||value<0)){message('Invalid system quantity; not saved to cloud');continue}
   const remarks=String(r.r||'');
   verifierSaveQueue=verifierSaveQueue.then(()=>api('save',{date,item_id:it[2],value:value===''?'':String(value),remarks}).then(()=>{
    state.records[it[2]]={...state.records[it[2]],system:value===''?null:value,remarks};
    message('All changes saved to cloud');
   })).catch(err=>{message('Cloud save failed: '+err.message)});
  }
  if(!changes.length)message('All changes saved');
 },650);
}
document.querySelector('#rows')?.addEventListener('change',queueVerifierSave);

window.STOCKTAKE_CLOUD_ACTIVE=true;
login();
})();
