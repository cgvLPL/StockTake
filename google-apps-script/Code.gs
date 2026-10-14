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
 if(s.getFilter())s.getFilter().remove();s.getRange(3,1,Math.max(2,items.length+1),8).createFilter();
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

function sheet_(){const id=PropertiesService.getScriptProperties().getProperty('SHEET_ID')||'1otK327n3_dVEB5iHFyi6PNdJ0t9BHmfycuo0sICYf-A';const ss=SpreadsheetApp.openById(id);let s=ss.getSheetByName(TAB);if(!s){s=ss.insertSheet(TAB);s.appendRow(['Date','Item ID','Actual','System','Remarks','Updated At','Updated By']);}return s;}
function digest_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(x=>('0'+(x&255).toString(16)).slice(-2)).join('');}
function user_(name,pin){const s=SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')||'1otK327n3_dVEB5iHFyi6PNdJ0t9BHmfycuo0sICYf-A').getSheetByName('Users');if(!s)throw Error('Create Users sheet');const rows=s.getDataRange().getDisplayValues();const row=rows.slice(1).find(r=>r[0]===name&&r[1]===digest_(pin));if(!row||!['counter','verifier'].includes(row[2]))throw Error('Invalid credentials');return {name,role:row[2]};}
function process_(p){
 const u=user_(String(p.username||''),String(p.pin||'')),action=String(p.action||'login');
 if(action==='login')return {role:u.role};
 if(action==='catalog')return {items:catalog_()};
 if(action==='listUsers'){
  if(u.role!=='verifier')throw Error('Verifier access required');
  const sh=sheet_().getParent().getSheetByName('Users');
  return {users:sh?sh.getDataRange().getDisplayValues().slice(1).filter(r=>r[0]).map(r=>({username:r[0],role:r[2]})):[]};
 }
 if(action==='createUser'){
  if(u.role!=='verifier')throw Error('Verifier access required');
  const username=String(p.newUsername||'').trim().toLowerCase(),pin=String(p.newPin||''),role=String(p.newRole||'');
  if(!/^[a-z][a-z0-9_.-]{2,31}$/.test(username))throw Error('Username must be 3-32 letters, numbers, dots, dashes or underscores');
  if(!['counter','verifier'].includes(role))throw Error('Invalid role');
  if(pin.length<8||pin.length>128)throw Error('Password must be at least 8 characters');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
   const sh=sheet_().getParent().getSheetByName('Users');if(!sh)throw Error('Run setupStaffAccounts first');
   if(sh.getDataRange().getDisplayValues().slice(1).some(r=>String(r[0]).toLowerCase()===username))throw Error('Username already exists');
   sh.appendRow([username,digest_(pin),role]);return {created:true,username,role};
  }finally{lock.releaseLock();}
 }

 if(action==='load'){
  const s=sheet_();
  const date=String(p.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid date');
  const all=s.getDataRange().getDisplayValues().slice(1).filter(r=>r[0]===date);
  return {role:u.role,items:catalog_(),rows:all.map(r=>({item_id:r[1],actual:r[2]===''?null:Number(r[2]),system:r[3]===''?null:Number(r[3]),remarks:r[4]}))};
 }
 if(action==='save'){
  const s=sheet_();
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
 const p=e&&e.parameter||{};
 let out;
 try{out={ok:true,data:process_(p)}}catch(err){out={ok:false,error:String(err.message)}}
 const payload=JSON.stringify({stocktake:true,requestId:String(p.requestId||''),result:out}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>try{window.top.postMessage('+payload+',"https://cgvlpl.github.io")}catch(e){}<\\/script></body></html>';
 return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** One-time initialization: creates the Inventory sheet with the original 103 items. */
function seedInventory(){
 const s=inventory_();if(s.getLastRow()>1)throw Error('Inventory already has items; refusing to overwrite.');
 const items=[["CON BIB COKE","g","stock-001"],["CON BIB FANTA","g","stock-002"],["CON BIB SPRITE","g","stock-003"],["CON CAPPUCINO POWDER NESTLE","g","stock-004"],["CON MILO ACTIVE GO NESTLE","g","stock-005"],["CON CORNSEED BUTTERFLY [PR]","g","stock-006"],["CON CARAMEL SMN [PR]","g","stock-007"],["CON SALTY MIX SMN [PR]","g","stock-008"],["CON POPPING OIL SMN [PR]","g","stock-009"],["CON COOKING OIL [PR]","ml","stock-010"],["CON FRENCH FRIES COATED STRAIGHT CUT 13.61KG","g","stock-011"],["CON ROLL BUN BERNARDI","EA","stock-012"],["CON BEEF SAUSAGE BERNARDI","EA","stock-013"],["CON CHICKEN SAUSAGE BERNARDI","EA","stock-014"],["CON SIOMAY PREMIUM CEDEA","EA","stock-015"],["CON COLD PAPER CUP 32OZ [PR]","EA","stock-016"],["CON COLD PAPER CUP 22OZ [PR]","EA","stock-017"],["CON COLD PAPER CUP 12OZ [PR]","EA","stock-018"],["CON&CAFE_PAPER CUP 8OZ HOT","EA","stock-019"],["CON CLEAR CUP - U 16OZ [PR]","EA","stock-020"],["CON SMALL PAPER BAG POPCRON [PR]","EA","stock-021"],["CON MEDIUM PAPER BAG POPCORN [PR]","EA","stock-022"],["CON SNACK TRAY [PR]","EA","stock-023"],["CON PAPER BOX TRAY [PR]","EA","stock-024"],["CON COLD PAPER CUP 16OZ [PR]","EA","stock-025"],["CON LYCHEE CAN DIP","g","stock-026"],["CON LEMON LOKAL","g","stock-027"],["CON DAUN MINT","g","stock-028"],["CON CORNSEED MUSHROOM [PR]","g","stock-029"],["CON CUTLERY SET (SPOON + FORK + TISSUE) [PR]","EA","stock-030"],["CON PAPER BOWL 650ML [PR]","EA","stock-031"],["CON FLAT LID PAPER BOWL 650ML [PR]","EA","stock-032"],["CON MIE SEDAAP GORENG 91GR BAG - WINGS","EA","stock-033"],["CON LYCHEE SYRUP BONALLIE","ml","stock-034"],["CON BUCKET POPCORN 110OZ [PR]","EA","stock-035"],["CON SJORA MANGO PEACH CONCENTRATE 1L NESTLE","ml","stock-036"],["CON KALAMANSI SYRUP BONALLIE","ml","stock-037"],["CON HOT LID LOGO CINECAFE 12OZ [PR]","EA","stock-038"],["CON HOT CUP LOGO CINECAFE 12OZ [PR]","EA","stock-039"],["CON CHICKEN KARAGE","g","stock-040"],["CON BLACKCURRANT NESTLE","g","stock-041"],["CON LEMONADE NESTLE","g","stock-042"],["CON HONEY SYRUP DIP","ml","stock-043"],["CON CLEAR CUP PP 22OZ [PR]","EA","stock-044"],["CON TROPICAL JELLY SANTINO","g","stock-045"],["CON SIMPLE SYRUP BONALLIE","ml","stock-046"],["CON SAUCE AYAM MADU - JSF","g","stock-047"],["CON JELLY BOBBA PMN","g","stock-048"],["CON YAKULT DIP","EA","stock-049"],["CON BENTO 3 COMPARTMENT [PR]","Set","stock-050"],["CON BLACK TEA JUMBO SUKANDA","g","stock-051"],["CON SHOPPING BAG CGV [PR]","EA","stock-052"],["CON POPCORN CHOCOLATE SMN [PR]","g","stock-053"],["CON SAKURA SYRUP BONALLIE","ml","stock-054"],["CON TWIN CUP SET","EA","stock-055"],["CON POPCORN BOX MINI [PR]","EA","stock-056"],["CON MANGO POPPING BOBA SANTINO","g","stock-057"],["CON OSMANTHUS SYRUP BONALLIE","ml","stock-058"],["CON CHOCOMALT TOPPING CRUMB 500GR BONALLIE","g","stock-059"],["CON SNACK TRAY PP [PR]","EA","stock-060"],["CON CHIA SEED DIP","g","stock-061"],["CON WHITE CHEESE SAUCE [PR]","g","stock-062"],["CON BIB ZERO COKE","g","stock-063"],["CON BIB JASMINE TEA","g","stock-064"],["CON BIB LEMON TEA","g","stock-065"],["CON WATERMELON SYRUP BONALLIE","ml","stock-066"],["COFFEE JELLY DIP","g","stock-067"],["CON HYDROCOCO 500ML - KALBE","ml","stock-068"],["CON MIXEDBERRIES SYRUP BONALLIE","ml","stock-069"],["CON CHEESE SEASONING POWDER [PR]","EA","stock-070"],["CON BBQ SEASONING POWDER [PR]","EA","stock-071"],["CON PAPER BAG SHAKE SERIES [PR]","EA","stock-072"],["CON GINGERBREAD SYRUP BONALLIE","ml","stock-073"],["CON SEASALT FOAM BONALLIE","g","stock-074"],["CON FRUIT COCKTAIL - DIP","g","stock-075"],["CON CHOCOLATE SAUCE - PMN","ml","stock-076"],["CON COOKIE CRUMB - PMN","g","stock-077"],["CON SANTAN CAIR 65ML - SASA","ml","stock-078"],["CON BUNGA TELANG - PMN","g","stock-079"],["CON POPPING CANDY – TOFFIN","g","stock-080"],["CON BUBBLEGUM - SANTINO","g","stock-081"],["CON NATAKU BAG 1000 ML","ml","stock-082"],["CON FO BLUE CURACAO - TOFFIN","ml","stock-083"],["Chocolatos Pillow 21 g","EA","stock-084"],["Garuda Rosta Bawang 20+4 g","EA","stock-085"],["Garuda Crunchy Corn Tornado Sea Salt 13+4 g","EA","stock-086"],["CON RTD AQUA MINERAL WATER 600ML","EA","stock-087"],["CON RTD MIZONE","EA","stock-088"],["CON RTD MINUTE MAID PULPY ORANGE","EA","stock-089"],["FANTASTIC BEAST COLLECTIBLE (BUKAN PLU SALES)","EA","stock-090"],["MERCHANDISE  2D CHARACTER STRAWS ( 2 DESIGN : JUDY & NICK ) - ZOOTOPIA","EA","stock-091"],["CON RTD FRESTEA LEMONGRASS 500ML","EA","stock-092"],["CON RTD FRESTEA BLACKCURRANT 500ML","EA","stock-093"],["CON DOUBLE SCOOP CHOCOLATE JOYDAY","EA","stock-094"],["CON DOUBLE SCOOP STRAWBERRY JOYDAY","EA","stock-095"],["CON TRAY FUN BOX","EA","stock-096"],["ADD BROWN PAPER BAG","EA","stock-097"],["MKT_MOVIE PASSPORT (UK A6-COVER AC 260GSM,210GSM - ISI HVS INCLUDE STICKER-FIN STEPLES, ROUNDED)","EA","stock-098"],["MKT_LUNCH BAG FOIL (D600 KOMBINASI PRINTING BAHAN TASLAN- 1 SISI FULL COLOUR) ORANGE/HIJAU","EA","stock-099"],["MKT_BUCKET POPCORN ( UK 1 LTR - MATERIAL PLASTIK FOOD GRADE, PRINTING, INCLUDE TALI + 2 PENGAIT )","EA","stock-100"],["CAP LANG AROMATHERAPY ROLL ON ( ORIGINAL, LAVENDER & ROSE )","EA","stock-101"],["CON_Coke 250ml PET (FREE)","EA","stock-102"],["FREE COCA COLA PET 250ml","EA","stock-103"]];
 s.getRange(2,1,items.length,5).setValues(items.map((r,i)=>[r[2],r[0],r[1],true,i+1]));
 s.getRange(2,4,items.length,1).insertCheckboxes();
 s.setFrozenRows(1);
 return items.length;
}

/**
 * Run once in the Apps Script editor to create/update the two staff accounts.
 * Set script properties ADMIN_PIN and STARS_PIN first (user-requested: 0000).
 * Credentials are stored only as SHA-256 hashes in the private Users sheet.
 * A four-digit PIN is insecure for an internet-accessible app; replace promptly.
 */
function setupStaffAccounts(){
 const props=PropertiesService.getScriptProperties();
 const adminPin=props.getProperty('ADMIN_PIN'),starsPin=props.getProperty('STARS_PIN');
 if(!adminPin||!starsPin)throw Error('Set ADMIN_PIN and STARS_PIN in Script Properties before running.');
 const ss=sheet_().getParent();let s=ss.getSheetByName('Users');
 if(!s){s=ss.insertSheet('Users');s.appendRow(['Username','PIN_SHA256','Role']);}
 const entries=[['admin',digest_(adminPin),'verifier'],['stars',digest_(starsPin),'counter']];
 const values=s.getDataRange().getDisplayValues();
 entries.forEach(entry=>{
  const i=values.findIndex((row,index)=>index>0&&row[0]===entry[0]);
  if(i<0)s.appendRow(entry);else s.getRange(i+1,1,1,3).setValues([entry]);
 });
 s.setFrozenRows(1);s.getRange(1,1,1,3).setBackground('#17263d').setFontColor('white').setFontWeight('bold');
 s.autoResizeColumns(1,3);
 return 'Configured admin (verifier) and stars (counter)';
}
