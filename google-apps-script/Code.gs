/**
 * CGV StockTake Apps Script backend.
 * Deploy as Web App: Execute as me; access Anyone.
 * Set Script Property SHEET_ID to spreadsheet ID.
 * Create Users sheet: A username, B SHA-256 PIN hex, C role (counter/verifier).
 * Store only hashed PINs, never raw PINs.
 */
const TAB='Counts';
const HEAD=['No','Item Name','UOM','Actual','System','Difference','Remarks','Status'];
function inventory_(){
 const ss=sheet_().getParent();let s=ss.getSheetByName('Inventory');
 if(!s){
  s=ss.insertSheet('Inventory');s.appendRow(['Item ID','Item Name','UOM','Active','Sort Order']);
  s.setFrozenRows(1);s.getRange(1,1,1,5).setBackground('#17263d').setFontColor('#ffffff').setFontWeight('bold');
  s.setColumnWidths(1,1,120);s.setColumnWidths(2,1,420);s.setColumnWidths(3,3,110);
 }
 return s;
}
function catalog_(){
 const values=inventory_().getDataRange().getDisplayValues().slice(1);
 return values.filter(r=>r[0]&&r[1]&&String(r[3]).toLowerCase()!=='false'&&String(r[3]).toLowerCase()!=='no')
 .map((r,i)=>({id:r[0],name:r[1],uom:r[2],order:Number(r[4])||i+1}))
 .sort((a,b)=>a.order-b.order);
}
function daySheet_(date){
 const ss=sheet_().getParent(),name=date.slice(8,10)+'-'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(date.slice(5,7))-1]+'-'+date.slice(0,4);
 let s=ss.getSheetByName(name);if(!s)s=ss.insertSheet(name);
 return s;
}
function rebuildDay_(date){
 const s=daySheet_(date),items=catalog_(),rows=sheet_().getDataRange().getDisplayValues().slice(1).filter(r=>r[0]===date),map=Object.fromEntries(rows.map(r=>[r[1],r]));
 s.clear();s.getRange(1,1,1,8).merge().setValue('DAILY STOCK TAKE - '+date).setBackground('#17263d').setFontColor('white').setFontWeight('bold').setFontSize(16);
 s.getRange(2,1,1,8).merge().setValue('Actual: Counter | System and Remarks: Verifier | Difference and Status calculated automatically');
 s.getRange(3,1,1,8).setValues([HEAD]).setBackground('#30455e').setFontColor('white').setFontWeight('bold');
 if(items.length){
  const values=items.map((it,i)=>{const r=map[it.id]||[];return [i+1,it.name,it.uom,r[2]||'',r[3]||'','',r[4]||'','']});
  s.getRange(4,1,values.length,8).setValues(values);
  s.getRange(4,6,values.length,1).setFormulas(items.map((_,i)=>['=IF(OR(D'+(i+4)+'="",E'+(i+4)+'=""),"",D'+(i+4)+'-E'+(i+4)+')']));
  s.getRange(4,8,values.length,1).setFormulas(items.map((_,i)=>['=IF(F'+(i+4)+'="","",IF(F'+(i+4)+'=0,"MATCH","DO NOT MATCH"))']));
  s.getRange(4,4,values.length,2).setBackground('#dceeff');s.getRange(4,7,values.length,1).setBackground('#dceeff');
 }
 s.setFrozenRows(3);s.setColumnWidth(1,55);s.setColumnWidth(2,420);s.setColumnWidth(3,70);s.setColumnWidths(4,5,120);
 s.getRange(3,1,Math.max(2,items.length+1),8).createFilter();
}
function summary_(){
 const ss=sheet_().getParent();let s=ss.getSheetByName('Summary');if(!s)s=ss.insertSheet('Summary',0);
 const rows=sheet_().getDataRange().getDisplayValues().slice(1),dates=[...new Set(rows.map(r=>r[0]).filter(Boolean))].sort().reverse();
 s.clear();s.getRange('A1:F1').merge().setValue('STOCK TAKE SUMMARY').setBackground('#17263d').setFontColor('white').setFontWeight('bold');
 s.getRange('A3:F3').setValues([['Date','Sheet','Items Counted','MATCH','DO NOT MATCH','Not Counted']]).setBackground('#30455e').setFontColor('white');
 const total=catalog_().length;
 if(dates.length)s.getRange(4,1,dates.length,6).setValues(dates.map(d=>{
 const records=rows.filter(r=>r[0]===d),complete=records.filter(r=>r[2]!==''&&r[3]!==''),match=complete.filter(r=>Number(r[2])===Number(r[3])).length;
 return [d,d.slice(8,10)+'-'+d.slice(5,7),complete.length,match,complete.length-match,Math.max(0,total-complete.length)];
 }));
 s.setFrozenRows(3);s.autoResizeColumns(1,6);
}
function setupInventory(){
 const s=inventory_();return {sheet:s.getName(),items:catalog_().length};
}

function sheet_(){const id=PropertiesService.getScriptProperties().getProperty('SHEET_ID');if(!id)throw Error('Set SHEET_ID script property');const ss=SpreadsheetApp.openById(id);let s=ss.getSheetByName(TAB);if(!s){s=ss.insertSheet(TAB);s.appendRow(['Date','Item ID','Actual','System','Remarks','Updated At','Updated By']);}return s;}
function digest_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(x=>('0'+(x&255).toString(16)).slice(-2)).join('');}
function user_(name,pin){const s=sheet_().getParent().getSheetByName('Users');if(!s)throw Error('Create Users sheet');const rows=s.getDataRange().getDisplayValues();const row=rows.slice(1).find(r=>r[0]===name&&r[1]===digest_(pin));if(!row||!['counter','verifier'].includes(row[2]))throw Error('Invalid credentials');return {name,role:row[2]};}
function process_(p){
 const u=user_(String(p.username||''),String(p.pin||'')),action=String(p.action||'login');
 if(action==='login')return {role:u.role};
 if(action==='catalog')return {items:catalog_()};
 const s=sheet_();
 if(action==='load'){
  const date=String(p.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid date');
  const all=s.getDataRange().getDisplayValues().slice(1).filter(r=>r[0]===date);
  return {role:u.role,items:catalog_(),rows:all.map(r=>({item_id:r[1],actual:r[2]===''?null:Number(r[2]),system:r[3]===''?null:Number(r[3]),remarks:r[4]}))};
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
   rebuildDay_(date);summary_();
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
