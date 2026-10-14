/* StockTake cloud roles. Configure public Supabase URL and anon key in cloud-config.js. */
(() => {
'use strict';
const cfg=window.STOCKTAKE_CLOUD||{};
const root=document.createElement('div');root.id='roleApp';document.body.prepend(root);
const state={token:null,user:null,role:null,date:new Date().toLocaleDateString('en-CA'),records:{},busy:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configured=Boolean(cfg.url&&cfg.anonKey&&!cfg.url.includes('YOUR_PROJECT'));
const api=async(path,method='GET',body,token=state.token)=>{
 const r=await fetch(cfg.url+'/rest/v1/'+path,{method,headers:{apikey:cfg.anonKey,Authorization:'Bearer '+(token||cfg.anonKey),'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)throw Error((await r.text()).slice(0,220));return r.status===204?[]:r.json();
};
const auth=async(email,password)=>{
 const r=await fetch(cfg.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 const x=await r.json();if(!r.ok)throw Error(x.error_description||x.msg||x.error||'Sign-in failed');return x;
};
const message=(s)=>{const e=root.querySelector('#roleMessage');if(e)e.textContent=s};
const button=(id,label)=>'<button type="button" id="'+id+'" class="role-button">'+label+'</button>';
function shell(inner){root.innerHTML='<div class="role-shell"><div class="role-card"><img src="./brand/cgv-stocktake.svg" alt="CGV StockTake" class="role-logo">'+inner+'<p id="roleMessage" role="status"></p></div></div>'}
function login(){
 document.querySelector('.frame').hidden=true;
 shell('<h2>Shared StockTake</h2><p>Sign in with your authorized Counter or Verifier account.</p><form id="roleLogin"><label>Email<input type="email" name="email" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button class="role-button">Sign in</button></form>'+(!configured?'<p class="role-error">Cloud synchronization requires Supabase configuration. See README.</p>':''));
 root.querySelector('form').onsubmit=async e=>{e.preventDefault();if(!configured)return message('Cloud backend is not configured.');const b=e.target.querySelector('button');b.disabled=true;try{const x=await auth(e.target.email.value,e.target.password.value);state.token=x.access_token;state.user=x.user;const p=await api('profiles?select=role&id=eq.'+encodeURIComponent(x.user.id));if(!p.length||!['counter','verifier'].includes(p[0].role))throw Error('Your account has no assigned role. Ask an administrator.');state.role=p[0].role;sessionStorage.setItem('stocktake-session',JSON.stringify({token:state.token,user:state.user,role:state.role}));welcome()}catch(err){message(err.message)}finally{b.disabled=false}};
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
function logout(){sessionStorage.removeItem('stocktake-session');state.token=null;state.role=null;login()}
async function load(){const rows=await api('stock_counts?select=item_id,actual,system,remarks&count_date=eq.'+state.date);state.records=Object.fromEntries(rows.map(r=>[r.item_id,r]));return rows}
const catalog=()=>window.STOCKTAKE_ITEMS||[];
function counterView(){
 const items=catalog(),done=items.filter(i=>state.records[i[2]]?.actual!==null&&state.records[i[2]]?.actual!==undefined).length;
 shell('<div class="role-toolbar">'+button('roleBack','← Roles')+'<strong>Counter</strong>'+button('roleOut','Sign out')+'</div><h2>Physical stock count</h2><label>Count date <input id="roleDate" type="date" value="'+state.date+'"></label><p id="roleProgress">'+done+' / '+items.length+' items counted</p><input id="roleSearch" type="search" placeholder="Search stock items" aria-label="Search stock items"><div id="roleItems">'+items.map((it,i)=>'<label class="role-item" data-name="'+esc(it[0].toLowerCase())+'"><span><b>'+(i+1)+'. '+esc(it[0])+'</b><small>'+esc(it[1])+'</small></span><input inputmode="decimal" data-id="'+it[2]+'" aria-label="Quantity for '+esc(it[0])+'" placeholder="Quantity" value="'+esc(state.records[it[2]]?.actual??'')+'"></label>').join('')+'</div>');
 root.querySelector('#roleBack').onclick=welcome;root.querySelector('#roleOut').onclick=logout;
 root.querySelector('#roleSearch').oninput=e=>{const q=e.target.value.toLowerCase();root.querySelectorAll('.role-item').forEach(el=>el.hidden=!el.dataset.name.includes(q))};
 root.querySelector('#roleDate').onchange=async e=>{state.date=e.target.value;try{await load();counterView()}catch(err){message(err.message)}};
 root.querySelectorAll('[data-id]').forEach(inp=>inp.onchange=async()=>{
 const id=inp.dataset.id,raw=inp.value.trim(),v=raw===''?null:Number(raw.replace(',','.'));
 if(raw!==''&&(!Number.isFinite(v)||v<0||!/^\d+(?:[.,]\d{1,4})?$/.test(raw))){message('Enter a non-negative quantity with up to 4 decimals.');return}
 inp.disabled=true;try{await api('stock_counts?on_conflict=count_date,item_id','POST',[{count_date:state.date,item_id:id,actual:v}],state.token);state.records[id]={...state.records[id],actual:v};message('Saved to cloud.');const done=catalog().filter(i=>state.records[i[2]]?.actual!=null).length;root.querySelector('#roleProgress').textContent=done+' / '+catalog().length+' items counted'}catch(err){message('Not saved: '+err.message)}finally{inp.disabled=false}
 });
}
async function counter(){try{await load();counterView()}catch(err){message('Unable to load counts: '+err.message)}}
async function verifier(){
 try{await load();const saved=state.records;const k='stocktake:'+state.date;const local={version:2,records:{}};for(const [id,r] of Object.entries(saved))local.records[id]={a:r.actual==null?'':String(r.actual),s:r.system==null?'':String(r.system),r:r.remarks||''};
 // Cloud data is copied to the existing dashboard's local view. Editing remains local until explicitly synced.
 localStorage.setItem(k,JSON.stringify(local));
 document.querySelector('.frame').hidden=false;root.innerHTML='<div class="role-topbar"><strong>Verifier · Cloud snapshot '+esc(state.date)+'</strong>'+button('roleSync','Upload dashboard changes')+button('roleReload','Reload cloud')+button('roleBack','Switch role')+'<span id="roleMessage" role="status"></span></div>';
 if(window.stockTakeOpenDate)window.stockTakeOpenDate(state.date);
 root.querySelector('#roleBack').onclick=welcome;
 root.querySelector('#roleReload').onclick=()=>verifier();
 root.querySelector('#roleSync').onclick=async()=>{
  const b=root.querySelector('#roleSync');b.disabled=true;
  try{const current=JSON.parse(localStorage.getItem('stocktake:'+state.date)||'{}').records||{};const payload=catalog().filter(it=>current[it[2]]).map(it=>({count_date:state.date,item_id:it[2],actual:current[it[2]].a===''?null:Number(String(current[it[2]].a).replace(',','.')),system:current[it[2]].s===''?null:Number(String(current[it[2]].s).replace(',','.')),remarks:current[it[2]].r||''}));if(payload.some(x=>[x.actual,x.system].some(v=>v!==null&&!Number.isFinite(v))))throw Error('Invalid number in dashboard.');if(payload.length)await api('stock_counts?on_conflict=count_date,item_id','POST',payload);message('Dashboard changes uploaded.')}catch(err){message('Upload failed: '+err.message)}finally{b.disabled=false}
 };
 }catch(err){message('Unable to load verifier: '+err.message)}
}
window.STOCKTAKE_CLOUD_ACTIVE=true;
try{const s=JSON.parse(sessionStorage.getItem('stocktake-session')||'null');if(s&&s.token&&s.user&&['counter','verifier'].includes(s.role)){state.token=s.token;state.user=s.user;state.role=s.role;welcome()}else login()}catch{login()}
})();
