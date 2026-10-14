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
  frame.name=id;frame.hidden=true;document.body.appendChild(frame);
  const form=document.createElement('form');form.method='POST';form.action=cfg.scriptUrl;form.target=id;form.hidden=true;
  const fields={action,username:state.user,pin:state.token,...params};
  Object.entries(fields).forEach(([k,v])=>{const input=document.createElement('input');input.name=k;input.value=v??'';form.appendChild(input)});
  document.body.appendChild(form);
  let timer;
  const finish=()=>{clearTimeout(timer);window.removeEventListener('message',receive);form.remove();frame.remove()};
  const receive=e=>{if(e.source!==frame.contentWindow||!e.data||e.data.stocktake!==true||!(e.origin==='https://script.google.com'||e.origin.endsWith('.googleusercontent.com')))return;finish();e.data.result?.ok?resolve(e.data.result.data):reject(Error(e.data.result?.error||'Backend error'))};
  window.addEventListener('message',receive);
  timer=setTimeout(()=>{finish();reject(Error('Request timed out. Check deployment permissions.'))},25000);
  form.submit();
 });
}
const message=(s)=>{const e=root.querySelector('#roleMessage');if(e)e.textContent=s};
const button=(id,label)=>'<button type="button" id="'+id+'" class="role-button">'+label+'</button>';
function shell(inner){root.innerHTML='<div class="role-shell"><div class="role-card"><img src="./brand/cgv-stocktake.svg" alt="CGV StockTake" class="role-logo">'+inner+'<p id="roleMessage" role="status"></p></div></div>'}
function login(){
 document.querySelector('.frame').hidden=true;
 shell('<h2>Shared StockTake</h2><p>Sign in with your assigned staff username and PIN.</p><form id="roleLogin"><label>Username<input name="username" autocomplete="username" required></label><label>PIN<input type="password" name="pin" autocomplete="off" required></label><button class="role-button">Sign in</button></form>'+(!configured?'<p class="role-error">Google Apps Script URL is not configured. See README.</p>':''));
 root.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;state.user=e.target.elements.username.value.trim();state.token=e.target.elements.pin.value;try{const x=await api('login');state.role=x.role;welcome()}catch(err){message(err.message)}finally{b.disabled=false}};
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
function logout(){state.token=null;state.user=null;state.role=null;login()}
async function load(){const result=await api('load',{date:state.date});const rows=result.rows;state.records=Object.fromEntries(rows.map(r=>[r.item_id,r]));state.catalog=(result.items||[]).map(it=>[it.name,it.uom,it.id]);return rows}
const catalog=()=>state.catalog||[];
function counterView(){
 const items=catalog(),done=items.filter(i=>state.records[i[2]]?.actual!==null&&state.records[i[2]]?.actual!==undefined).length;
 shell('<div class="role-toolbar">'+button('roleBack','← Roles')+'<strong>Counter</strong>'+button('roleOut','Sign out')+'</div><h2>Physical stock count</h2><label>Count date <input id="roleDate" type="date" value="'+state.date+'"></label><p id="roleProgress">'+done+' / '+items.length+' items counted</p><input id="roleSearch" type="search" placeholder="Search stock items" aria-label="Search stock items"><div id="roleItems">'+items.map((it,i)=>'<label class="role-item" data-name="'+esc(it[0].toLowerCase())+'"><span><b>'+(i+1)+'. '+esc(it[0])+'</b><small>'+esc(it[1])+'</small></span><input inputmode="decimal" data-id="'+it[2]+'" aria-label="Quantity for '+esc(it[0])+'" placeholder="Quantity" value="'+esc(state.records[it[2]]?.actual??'')+'"></label>').join('')+'</div>');
 root.querySelector('#roleBack').onclick=welcome;root.querySelector('#roleOut').onclick=logout;
 root.querySelector('#roleSearch').oninput=e=>{const q=e.target.value.toLowerCase();root.querySelectorAll('.role-item').forEach(el=>el.hidden=!el.dataset.name.includes(q))};
 root.querySelector('#roleDate').onchange=async e=>{state.date=e.target.value;try{await load();counterView()}catch(err){message(err.message)}};
 root.querySelectorAll('[data-id]').forEach(inp=>inp.onchange=async()=>{
 const id=inp.dataset.id,raw=inp.value.trim(),v=raw===''?null:Number(raw.replace(',','.'));
 if(raw!==''&&(!Number.isFinite(v)||v<0||!/^\d+(?:[.,]\d{1,4})?$/.test(raw))){message('Enter a non-negative quantity with up to 4 decimals.');return}
 inp.disabled=true;try{await api('save',{date:state.date,item_id:id,value:v===null?'':String(v)});state.records[id]={...state.records[id],actual:v};message('Saved to cloud.');const done=catalog().filter(i=>state.records[i[2]]?.actual!=null).length;root.querySelector('#roleProgress').textContent=done+' / '+catalog().length+' items counted'}catch(err){message('Not saved: '+err.message)}finally{inp.disabled=false}
 });
}
async function counter(){try{await load();counterView()}catch(err){message('Unable to load counts: '+err.message)}}
async function verifier(){
 try{await load();const saved=state.records;const k='stocktake:'+state.date;const local={version:2,records:{}};for(const [id,r] of Object.entries(saved))local.records[id]={a:r.actual==null?'':String(r.actual),s:r.system==null?'':String(r.system),r:r.remarks||''};
 // Cloud data is copied to the existing dashboard's local view. Editing remains local until explicitly synced.
 localStorage.setItem(k,JSON.stringify(local));
 document.querySelector('.frame').hidden=false;root.innerHTML='<div class="role-topbar"><strong>Verifier · Cloud snapshot '+esc(state.date)+'</strong>'+button('roleSync','Upload dashboard changes')+button('roleReload','Reload cloud')+button('roleBack','Switch role')+'<span id="roleMessage" role="status"></span></div>';
 if(window.stockTakeSetCatalog)window.stockTakeSetCatalog(catalog());if(window.stockTakeOpenDate)window.stockTakeOpenDate(state.date);
 root.querySelector('#roleBack').onclick=welcome;
 root.querySelector('#roleReload').onclick=()=>verifier();
 root.querySelector('#roleSync').onclick=async()=>{
  const b=root.querySelector('#roleSync');b.disabled=true;
  try{const current=JSON.parse(localStorage.getItem('stocktake:'+state.date)||'{}').records||{};const payload=catalog().filter(it=>current[it[2]]).map(it=>({count_date:state.date,item_id:it[2],actual:current[it[2]].a===''?null:Number(String(current[it[2]].a).replace(',','.')),system:current[it[2]].s===''?null:Number(String(current[it[2]].s).replace(',','.')),remarks:current[it[2]].r||''}));if(payload.some(x=>[x.actual,x.system].some(v=>v!==null&&!Number.isFinite(v))))throw Error('Invalid number in dashboard.');for(const row of payload)await api('save',{date:row.count_date,item_id:row.item_id,value:row.system===null?'':String(row.system),remarks:row.remarks});message('Dashboard changes uploaded.')}catch(err){message('Upload failed: '+err.message)}finally{b.disabled=false}
 };
 }catch(err){message('Unable to load verifier: '+err.message)}
}
window.STOCKTAKE_CLOUD_ACTIVE=true;
login();
})();
