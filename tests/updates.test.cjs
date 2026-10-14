const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../updates.js'),'utf8');
function target(extra={}) {
  const events={};
  return {...extra,addEventListener(name,fn){(events[name]??=[]).push(fn)},async emit(name){for(const fn of events[name]||[])await fn()}};
}
async function setup({waiting=true,controlled=true}={}) {
  const worker=target({state:'installed',messages:[],postMessage(m){this.messages.push(m)}});
  const reg=target({waiting:waiting?worker:null,installing:null,updates:0,update(){this.updates++;return Promise.resolve()}});
  const sw=target({controller:controlled?{}:null,register:async()=>reg});
  const els=Object.fromEntries(['updateBanner','updateMessage','refreshApp','dismissUpdate'].map(id=>['#'+id,target({hidden:true,textContent:'',disabled:false})]));
  let safe=true,reloads=0,checks=[];
  const win=target({stockTakeCanRefresh:()=>safe});
  const doc=target({visibilityState:'visible',querySelector:id=>els[id]});
  const ctx={window:win,document:doc,navigator:{serviceWorker:sw,onLine:true},location:{protocol:'https:',reload(){reloads++}},setTimeout:()=>1,clearTimeout(){},setInterval:fn=>checks.push(fn)};
  vm.runInNewContext(source,ctx);await win.emit('load');
  return {worker,reg,sw,els,win,doc,ctx,checks,setSafe(v){safe=v},get reloads(){return reloads}};
}
test('waiting update prompts without automatically reloading; Later dismisses this version',async()=>{
  const f=await setup();assert.equal(f.els['#updateBanner'].hidden,false);assert.equal(f.reloads,0);
  await f.els['#dismissUpdate'].emit('click');f.checks[0]();assert.equal(f.els['#updateBanner'].hidden,true);
});
test('Refresh activates the waiting worker and reloads after activation',async()=>{
  const f=await setup();await f.els['#refreshApp'].emit('click');
  assert.equal(f.worker.messages[0].type,'SKIP_WAITING');assert.equal(f.reloads,0);
  await f.sw.emit('controllerchange');assert.equal(f.reloads,1);
});
test('unsaved entries block refresh both before and during activation',async()=>{
  const f=await setup();f.setSafe(false);await f.els['#refreshApp'].emit('click');
  assert.equal(f.worker.messages.length,0);assert.equal(f.reloads,0);assert.match(f.els['#updateMessage'].textContent,/could not be saved/);
  f.setSafe(true);await f.els['#refreshApp'].emit('click');f.setSafe(false);await f.sw.emit('controllerchange');
  assert.equal(f.reloads,0);assert.equal(f.els['#refreshApp'].disabled,false);
});
test('an update activated in another tab prompts instead of reloading',async()=>{
  const f=await setup({waiting:false});await f.sw.emit('controllerchange');
  assert.equal(f.els['#updateBanner'].hidden,false);assert.equal(f.reloads,0);
  await f.els['#refreshApp'].emit('click');assert.equal(f.reloads,1);
});
test('first installation is silent and later worker installation prompts',async()=>{
  const first=await setup({waiting:false,controlled:false});await first.sw.emit('controllerchange');
  assert.equal(first.els['#updateBanner'].hidden,true);
  const f=await setup({waiting:false});f.worker.state='installing';f.reg.installing=f.worker;
  await f.reg.emit('updatefound');assert.equal(f.els['#updateBanner'].hidden,true);
  f.worker.state='installed';f.reg.waiting=f.worker;await f.worker.emit('statechange');assert.equal(f.els['#updateBanner'].hidden,false);
});
test('checks run on return and reconnection, but skip hidden or offline tabs',async()=>{
  const f=await setup();const n=f.reg.updates;await f.win.emit('focus');await f.win.emit('online');assert.equal(f.reg.updates,n+2);
  f.doc.visibilityState='hidden';f.checks[0]();assert.equal(f.reg.updates,n+2);
  f.doc.visibilityState='visible';f.ctx.navigator.onLine=false;f.checks[0]();assert.equal(f.reg.updates,n+2);
});
