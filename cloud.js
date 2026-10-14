/* StockTake cloud roles with Google Apps Script + Google Sheets. */
(() => {
'use strict';
const cfg=window.STOCKTAKE_CLOUD||{};
const root=document.createElement('div');root.id='roleApp';document.body.prepend(root);
const state={token:null,user:null,role:null,date:new Date().toLocaleDateString('en-CA'),records:{},busy:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configured=Boolean(cfg.scriptUrl&&/^https:\/\/script\.google\.com\/macros\/s\//.test(cfg.scriptUrl));
let requestNumber=0;
function api(action,params={}){
 return new Promise((resolve,reject)=>{
  if(!configured)return reject(Error('Configure the Google Apps Script deployment URL.'));
  const id='stocktake-post-'+(++requestNumber),frame=document.createElement('iframe');
  frame.name=id;frame.hidden=true;frame.setAttribute('aria-hidden','true');document.body.appendChild(frame);
  const form=document.createElement('form');form.method='POST';form.action=cfg.scriptUrl;form.target=id;form.hidden=true;
  const fields={action,requestId:id,username:state.user,pin:state.token,...params};
  Object.entries(fields).forEach(([k,v])=>{const input=document.createElement('input');input.name=k;input.value=v??'';form.appendChild(input)});
  document.body.appendChild(form);
  let timer;
  const finish=()=>{clearTimeout(timer);window.removeEventListener('message',receive);form.remove();frame.remove()};
  const receive=e=>{if(!e.data||e.data.stocktake!==true||e.data.requestId!==id||!(e.origin==='https://script.google.com'||e.origin.endsWith('.googleusercontent.com')))return;finish();e.data.result?.ok?resolve(e.data.result.data):reject(Error(e.data.result?.error||'Backend error'))};
  window.addEventListener('message',receive);
  timer=setTimeout(()=>{finish();reject(Error('Google Apps Script did not respond. Check that the latest Code.gs is deployed as a Web App accessible to Anyone, then try again.'))},10000);
  form.submit();
 });
}
const message=(s)=>{const e=root.querySelector('#roleMessage');if(e)e.textContent=s};
const button=(id,label)=>'<button type="button" id="'+id+'" class="role-button">'+label+'</button>';
function shell(inner){root.innerHTML='<div class="role-shell"><div class="role-card"><img src="./brand/cgv-stocktake.svg" alt="CGV StockTake" class="role-logo">'+inner+'<p id="roleMessage" role="status"></p></div></div>'}
function login(){
 document.querySelector('.frame').hidden=true;
 shell('<h2>Shared StockTake</h2><p>Sign in with your assigned staff username and PIN.</p><form id="roleLogin"><label>Username<input name="username" autocomplete="username" required></label><label>PIN<input type="password" name="pin" autocomplete="off" required></label><button class="role-button">Sign in</button></form>'+(!configured?'<p class="role-error">Google Apps Script URL is not configured. See README.</p>':''));
 root.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;b.textContent='Signing in…';message('Connecting to Google Sheets…');state.user=e.target.elements.username.value.trim();state.token=e.target.elements.pin.value;try{const x=await api('login');state.role=x.role;welcome()}catch(err){message(err.message)}finally{b.disabled=false;b.textContent='Sign in'}};
}
function welcome(){
 document.querySelector('.frame').hidden=true;
 const r=state.role;
 shell('<h2>Welcome to StockTake</h2><p>Choose your workspace. Your account is authorized as <strong>'+esc(r)+'</strong>.</p><div class="role-choices">'+button('enterCounter','Counter · Enter physical quantities')+button('enterVerifier','Verifier · Open dashboard')+'</div>'+button('roleLogout','Sign out'));
 root.querySelector('#enterCounter').disabled=r!=='counter';root.querySelector('#enterVerifier').disabled=r!=='verifier';
 root.querySelector('#enterCounter').onclick=()=>counter();
 root.querySelector('#enterVerifier').onclick=()=>verifier();

 root.querySelector('#roleLogout').onclick=logout;
}
function mountStaffAccounts(){
  const area=document.createElement('section');area.className='role-admin';
  area.innerHTML='<h3>Staff accounts</h3><p>Create Counter or Verifier access.</p><form id="newStaffForm"><label>New username<input name="username" required minlength="3" maxlength="32" pattern="[a-zA-Z][a-zA-Z0-9_.-]{2,31}" autocomplete="off"></label><label>New password<input name="password" type="password" required minlength="8" autocomplete="new-password"></label><label>Role<select name="role"><option value="counter">Counter</option><option value="verifier">Verifier</option></select></label><button class="role-button">Create account</button></form><p id="staffResult" role="status"></p>';
  document.querySelector('#verifierStaffPanel').appendChild(area);
  area.querySelector('form').onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),result=area.querySelector('#staffResult');
   button.disabled=true;result.textContent='Creating account…';
   try{const response=await api('createUser',{newUsername:form.elements.username.value,newPin:form.elements.password.value,newRole:form.elements.role.value});result.textContent='Created '+response.username+' ('+response.role+').';form.reset()}
   catch(err){result.textContent='Account not created: '+err.message}
   finally{button.disabled=false}
  };
 }

function logout(){state.token=null;state.user=null;state.role=null;login()}
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
 root.querySelectorAll('[data-id]').forEach(inp=>inp.onchange=async()=>{
 const id=inp.dataset.id,raw=inp.value.trim(),v=raw===''?null:Number(raw.replace(',','.'));
 if(raw!==''&&(!Number.isFinite(v)||v<0||!/^\d+(?:[.,]\d{1,4})?$/.test(raw))){message('Enter a non-negative quantity with up to 4 decimals.');return}
 inp.disabled=true;try{await api('save',{date:state.date,item_id:id,value:v===null?'':String(v)});state.records[id]={...state.records[id],actual:v};message('Saved to cloud.');refreshCounterProgress()}catch(err){message('Not saved: '+err.message)}finally{inp.disabled=false}
 });
}
async function counter(){try{await load();counterView()}catch(err){message('Unable to load counts: '+err.message)}}
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
  /* Verifier loads cloud data automatically; no manual refresh or transition toolbar. */
 }catch(err){message('Unable to load verifier: '+err.message)}
}
function queueVerifierSave(){
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
