/**
 * CGV StockTake Apps Script backend.
 * Deploy as Web App: Execute as me; access Anyone.
 * Set Script Property SHEET_ID to spreadsheet ID.
 * Create Users sheet: A username, B SHA-256 PIN hex, C role (counter/verifier).
 * Store only hashed PINs, never raw PINs.
 */
const TAB='Counts';
function sheet_(){const id=PropertiesService.getScriptProperties().getProperty('SHEET_ID');if(!id)throw Error('Set SHEET_ID script property');const ss=SpreadsheetApp.openById(id);let s=ss.getSheetByName(TAB);if(!s){s=ss.insertSheet(TAB);s.appendRow(['Date','Item ID','Actual','System','Remarks','Updated At','Updated By']);}return s;}
function digest_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(x=>('0'+(x&255).toString(16)).slice(-2)).join('');}
function user_(name,pin){const s=sheet_().getParent().getSheetByName('Users');if(!s)throw Error('Create Users sheet');const rows=s.getDataRange().getDisplayValues();const row=rows.slice(1).find(r=>r[0]===name&&r[1]===digest_(pin));if(!row||!['counter','verifier'].includes(row[2]))throw Error('Invalid credentials');return {name,role:row[2]};}
function process_(p){
 const u=user_(String(p.username||''),String(p.pin||'')),action=String(p.action||'login');
 if(action==='login')return {role:u.role};
 const s=sheet_();
 if(action==='load'){
  const date=String(p.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid date');
  const all=s.getDataRange().getDisplayValues().slice(1).filter(r=>r[0]===date);
  return {role:u.role,rows:all.map(r=>({item_id:r[1],actual:r[2]===''?null:Number(r[2]),system:r[3]===''?null:Number(r[3]),remarks:r[4]}))};
 }
 if(action==='save'){
  const date=String(p.date||''),id=String(p.item_id||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^stock-\d{3}$/.test(id)||Number(id.slice(6))>103)throw Error('Invalid record');
  const field=u.role==='counter'?'actual':'system',v=String(p.value??'');
  if(v!==''&&(!/^\d+(?:\.\d{1,4})?$/.test(v)||Number(v)>1e10))throw Error('Invalid quantity');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
   const data=s.getDataRange().getDisplayValues(),i=data.findIndex((r,n)=>n>0&&r[0]===date&&r[1]===id);
   const row=i>=0?i+1:s.getLastRow()+1;
   if(i<0){s.getRange(row,1,1,7).setValues([[date,id,'','','','','']]);}
   s.getRange(row,field==='actual'?3:4).setValue(v===''?'':Number(v));
   if(u.role==='verifier')s.getRange(row,5).setValue(String(p.remarks||'').slice(0,500));
   s.getRange(row,6,1,2).setValues([[new Date(),u.name]]);
   return {saved:true};
  }finally{lock.releaseLock();}
 }
 throw Error('Unknown action');
}
function doPost(e){
 let out;try{out={ok:true,data:process_(e.parameter||{})}}catch(err){out={ok:false,error:String(err.message)}}
 // Parent verifies event.origin against script.google.com / googleusercontent.com.
 const json=JSON.stringify(out).replace(/</g,'\\u003c');
 return HtmlService.createHtmlOutput('<script>parent.postMessage({stocktake:true,result:'+json+'},"*")</script>');
}
