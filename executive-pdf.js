/* StockTake Executive PDF: self-contained A4 PDF writer, no external runtime dependency. */
(function (root) {
'use strict';
const W=595.28,H=841.89, M=36, RIGHT=W-M;
const C={
  ink:[.100,.110,.125],muted:[.45,.48,.51],white:[1,1,1],
  orange:[.953,.408,.180],light:[.968,.971,.972],line:[.88,.89,.90],
  dark:[.075,.081,.092],dark2:[.15,.16,.18],pale:[.955,.960,.959],
  green:[.16,.48,.34],red:[.70,.26,.22],amber:[.57,.39,.19]
};
function sane(text){
  return String(text??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\u2010-\u2015\u2212]/g,'-')
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
    .replace(/\u00a0/g,' ').replace(/[\x00-\x1f\x7f]/g,' ')
    .replace(/[^\x20-\x7e]/g,'?');
}
function esc(s){return sane(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function ellipsis(s,max){const str=sane(s);return str.length>max?str.slice(0,Math.max(0,max-3))+'...':str;}
function f(n){return Number(n).toFixed(2).replace(/\.00$/,'');}
function color(rgb){return rgb.map(f).join(' ');}
function quantity(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function fmtNum(n){return typeof n==='number'&&Number.isFinite(n)?String(Math.round(n*10000)/10000):'-';}
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
function dateRange(kind,date){
  if(!validDate(date))throw Error('Choose a valid report date.');
  const d=new Date(date+'T00:00:00Z');
  if(kind==='daily')return {start:date,end:date};
  if(kind==='weekly'){const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
    const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6);
    return {start:monday.toISOString().slice(0,10),end:sunday.toISOString().slice(0,10)};}
  if(kind==='monthly')return {start:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)).toISOString().slice(0,10),
    end:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10)};
  throw Error('Invalid report period.');
}
function days(start,end){
  const all=[];let current=new Date(start+'T00:00:00Z'),stop=new Date(end+'T00:00:00Z');
  while(current<=stop&&all.length<=31){all.push(current.toISOString().slice(0,10));current.setUTCDate(current.getUTCDate()+1);}
  if(all.length<1||all.length>31||current<=stop)throw Error('Report range must be 1-31 days.');
  return all;
}
function summarize(payload,kind,anchor){
  const range=dateRange(kind,anchor);
  if(!payload||payload.start!==range.start||payload.end!==range.end||
    !Array.isArray(payload.items)||!Array.isArray(payload.rows))
    throw Error('Incomplete data returned for the selected report period.');
  const dates=days(range.start,range.end),catalog=payload.items.map(i=>({
    id:String(i.id),name:String(i.name||i.id),uom:String(i.uom||'')
  }));
  const itemMap=new Map(catalog.map(i=>[i.id,i])),byDate=new Map();
  payload.rows.forEach(r=>{
    if(!r||!r.date||!r.item_id||r.date<range.start||r.date>range.end)return;
    const id=String(r.item_id);
    if(!byDate.has(r.date))byDate.set(r.date,new Map());
    byDate.get(r.date).set(id,r);
  });
  let counted=0,verified=0,matched=0,variances=0,pending=0,uncounted=0,expected=0;
  const exceptions=[],daily=[];
  dates.forEach(date=>{
    const records=byDate.get(date)||new Map();
    const all=catalog.slice();
    for(const [id] of records)if(!itemMap.has(id))all.push({id,name:'Archived item '+id,uom:''});
    const entry={date,total:all.length,counted:0,verified:0,matched:0,variances:0,pending:0,uncounted:0,hasRecords:records.size>0};
    for(const item of all){
      const row=records.get(item.id)||{};
      const a=quantity(row.actual),s=quantity(row.system);
      if(a!==null)entry.counted++;else entry.uncounted++;
      if(a!==null&&s!==null){
        entry.verified++;
        if(Math.abs(a-s)<.00005)entry.matched++;
        else{
          entry.variances++;
          exceptions.push({date,item:item.name,id:item.id,uom:item.uom,actual:a,system:s,
            diff:Math.round((a-s)*10000)/10000,remarks:String(row.remarks||'')});
        }
      }else if(a!==null)entry.pending++;
    }
    expected+=entry.total;counted+=entry.counted;verified+=entry.verified;matched+=entry.matched;
    variances+=entry.variances;pending+=entry.pending;uncounted+=entry.uncounted;
    daily.push(entry);
  });
  exceptions.sort((a,b)=>b.date.localeCompare(a.date)||
    Math.abs(b.diff)-Math.abs(a.diff)||a.id.localeCompare(b.id));
  return {kind,range,daily,exceptions,expected,counted,verified,matched,variances,pending,uncounted,
    activeDays:daily.filter(d=>d.hasRecords).length,days:dates.length,
    coverage:expected?counted/expected:0,matchRate:verified?matched/verified:0};
}


/* Builds the same dated stock-item rows displayed in the Verifier table.
   A daily export includes every catalog item; longer periods include every
   item for dates with saved records, plus archived IDs found in those records. */
function buildItemDetails(payload,summary){
  const catalog=payload.items.map((item,i)=>({
    number:i+1,
    id:String(item.id),
    name:String(item.name||item.id),
    uom:String(item.uom||'')
  }));
  const ids=new Set(catalog.map(item=>item.id)),byDate=new Map();
  payload.rows.forEach(rec=>{
    if(!rec||!rec.item_id||!rec.date||rec.date<summary.range.start||rec.date>summary.range.end)return;
    if(!byDate.has(rec.date))byDate.set(rec.date,new Map());
    byDate.get(rec.date).set(String(rec.item_id),rec);
  });
  return summary.daily
    .filter(day=>summary.kind==='daily'||(byDate.get(day.date)?.size||0)>0)
    .map(day=>{
      const recs=byDate.get(day.date)||new Map();
      const unknown=[...recs.keys()].filter(id=>!ids.has(id)).sort()
        .map((id,i)=>({number:catalog.length+i+1,id,name:'Archived item '+id,uom:''}));
      const rows=catalog.concat(unknown).map(item=>{
        const rec=recs.get(item.id)||{};
        const actual=quantity(rec.actual),system=quantity(rec.system);
        const difference=actual!==null&&system!==null?
          Math.round((actual-system)*10000)/10000:null;
        const status=difference!==null?
          (difference===0?'MATCH':'VARIANCE'):
          actual!==null?'PENDING':
          system!==null?'AWAIT COUNT':'NOT COUNTED';
        return {...item,actual,system,difference,remarks:String(rec.remarks||''),status};
      });
      return {date:day.date,recordCount:recs.size,rows};
    });
}
/* Approximate Standard Helvetica AFM widths (1000ths of an em) so the
   PDF's stock table wraps by rendered width, not character count. */
function helveticaTextWidth(value,fontSize,bold=false){
  const U=[667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611];
  const L=[556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500];
  const punctuation={
    ' ':278,'.':278,',':278,':':278,';':278,'-':333,'_':556,'/':278,
    "'":222,'"':355,'(':333,')':333,'[':278,']':278,'&':667,
    '+':584,'=':584,'@':1015,'#':556,'!':278,'?':556,'%':889
  };
  let units=0;
  for(const ch of sane(value)){
    const code=ch.charCodeAt(0);
    if(code>=65&&code<=90)units+=U[code-65];
    else if(code>=97&&code<=122)units+=L[code-97];
    else if(code>=48&&code<=57)units+=556;
    else units+=punctuation[ch]??620;
  }
  // Bold Helvetica is slightly wider than regular for many glyphs.
  return units*Number(fontSize)/1000*(bold?1.065:1.015);
}
/* Do not split on arbitrary character counts: use each actual cell width,
   including for long unbroken product names and multi-line staff remarks. */
function wrapPdfCell(value,maxWidth,fontSize=7.8,bold=false){
  const lines=[];
  const paragraphs=String(value??'').replace(/\r\n?/g,'\n').split('\n');
  const width=Math.max(4,Number(maxWidth)-3);
  const fits=s=>helveticaTextWidth(s,fontSize,bold)<=width;
  function appendWord(word,current){
    let remaining=word;
    while(remaining){
      let length=remaining.length;
      while(length>1&&!fits(remaining.slice(0,length)))length--;
      const part=remaining.slice(0,length);
      if(current){
        lines.push(current);
        current='';
      }
      remaining=remaining.slice(length);
      if(remaining)lines.push(part);
      else current=part;
    }
    return current;
  }
  for(const paragraph of paragraphs){
    const words=sane(paragraph).trim().split(/\s+/).filter(Boolean);
    if(!words.length){lines.push('');continue;}
    let line='';
    for(const word of words){
      const candidate=line?line+' '+word:word;
      if(fits(candidate)){line=candidate;continue;}
      if(line){lines.push(line);line='';}
      if(fits(word))line=word;
      else line=appendWord(word,line);
    }
    lines.push(line);
  }
  return lines.length?lines:[''];
}

function imageJpegHex(jpegBase64){
  if(typeof jpegBase64!=='string'||jpegBase64.length<128||jpegBase64.length>250000)
    throw Error('Invalid embedded report logo.');
  const raw=typeof atob==='function'?atob(jpegBase64):
    (typeof Buffer!=='undefined'?Buffer.from(jpegBase64,'base64').toString('binary'):null);
  if(!raw||raw.length<100||raw.charCodeAt(0)!==255||raw.charCodeAt(1)!==216||
     raw.charCodeAt(raw.length-2)!==255||raw.charCodeAt(raw.length-1)!==217)
    throw Error('Embedded report logo is not a complete JPEG.');
  const hex=[];
  for(let i=0;i<raw.length;i++)hex.push(raw.charCodeAt(i).toString(16).padStart(2,'0'));
  return hex.join('').toUpperCase();
}
function reportLogo(){
  if(root&&root.StockTakeReportLogo)return root.StockTakeReportLogo;
  if(typeof module!=='undefined'&&module.exports&&typeof require==='function')
    return require('./brand/cgv-stocktake-report-logo.js');
  return null;
}
function writer(logo){
  const pages=[];let page=null;
  const add=s=>page.commands.push(s);
  function newPage(){page={commands:[]};pages.push(page);return page;}
  const rect=(x,y,w,h,fill,stroke)=>{
    add(color(fill)+' rg '+[x,H-y-h,w,h].map(f).join(' ')+' re f\n');
    if(stroke)add(color(stroke)+' RG .6 w '+[x,H-y-h,w,h].map(f).join(' ')+' re S\n');
  };
  const line=(x1,y1,x2,y2,stroke=C.line,width=1)=>{
    add(color(stroke)+' RG '+f(width)+' w '+f(x1)+' '+f(H-y1)+' m '+f(x2)+' '+f(H-y2)+' l S\n');
  };
  const text=(str,x,top,size=11,bold=false,fill=C.ink)=>{
    add('BT /'+(bold?'F2':'F1')+' '+f(size)+' Tf '+color(fill)+' rg 1 0 0 1 '+f(x)+' '+f(H-top-size)+' Tm ('+esc(str)+') Tj ET\n');
  };
  const textRight=(str,right,top,size=11,bold=false,fill=C.ink)=>{
    const width=sane(str).length*size*(bold?.54:.49);text(str,right-width,top,size,bold,fill);
  };
  const image=(x,y,w,h)=>{
    if(!logo)return;
    add('q '+[w,0,0,h,x,H-y-h].map(f).join(' ')+' cm /ReportLogo Do Q\n');
  };
  const boxText=(str,x,top,width,size=8,bold=false,fill=C.ink,align='left')=>{
    const w=Math.max(1,width),h=size+4;
    const drawX=align==='right'?x+Math.max(0,w-2-helveticaTextWidth(str,size,bold)):x+1;
    // PDF clip path is a hard boundary: no glyph can enter a neighbouring cell.
    add('q '+[x,H-top-h+1,w,h].map(f).join(' ')+' re W n\n');
    text(str,drawX,top,size,bold,fill);
    add('Q\n');
  };
  function finish(){
    if(!pages.length)newPage();
    const objs=[null];const push=s=>(objs.push(s),objs.length-1);
    const normal=push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const bold=push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    let imageId=null;
    if(logo){
      const hex=imageJpegHex(logo.jpegBase64),stream=hex+'>\n';
      imageId=push('<< /Type /XObject /Subtype /Image /Width '+Number(logo.width)+
        ' /Height '+Number(logo.height)+' /ColorSpace /DeviceRGB /BitsPerComponent 8'+
        ' /Filter [/ASCIIHexDecode /DCTDecode] /Length '+stream.length+
        ' >>\nstream\n'+stream+'endstream');
    }
    const pagesRef=push(null);
    const pageIds=[];
    for(const p of pages){
      const stream=p.commands.join('');
      const streamId=push('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
      pageIds.push(push('<< /Type /Page /Parent '+pagesRef+' 0 R /MediaBox [0 0 '+f(W)+' '+f(H)+
        '] /Resources << /Font << /F1 '+normal+' 0 R /F2 '+bold+' 0 R >>'+
        (imageId?' /XObject << /ReportLogo '+imageId+' 0 R >>':'')+
        ' >> /Contents '+streamId+' 0 R >>'));
    }
    objs[pagesRef]='<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>';
    const catalog=push('<< /Type /Catalog /Pages '+pagesRef+' 0 R >>');
    let body='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n',offsets=[0];
    const encoder=new TextEncoder();
    const byteSize=str=>encoder.encode(str).byteLength;
    for(let id=1;id<objs.length;id++){
      offsets[id]=byteSize(body);
      body+=id+' 0 obj\n'+objs[id]+'\nendobj\n';
    }
    const start=byteSize(body);
    body+='xref\n0 '+objs.length+'\n0000000000 65535 f \n';
    for(let id=1;id<objs.length;id++)body+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
    body+='trailer\n<< /Size '+objs.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
    return {bytes:encoder.encode(body),pages:pages.length};
  }
  return {newPage,rect,line,text,textRight,boxText,image,finish,hasLogo:!!logo,get pages(){return pages;}};
}
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatCoverDate(value){
  const [y,m,d]=value.split('-').map(Number);
  return d+' '+MONTHS[m-1]+' '+y;
}
function coverPeriodLabel(kind,start,end){
  if(kind==='daily')return formatCoverDate(start);
  if(kind==='monthly')return MONTHS[Number(start.slice(5,7))-1]+' '+start.slice(0,4);
  const [sy,sm]=start.split('-').map(Number),[ey,em]=end.split('-').map(Number);
  if(sy===ey&&sm===em)return Number(start.slice(8))+' - '+formatCoverDate(end);
  return formatCoverDate(start)+' - '+formatCoverDate(end);
}
function makeExecutivePdf(payload,kind,anchor,generatedAt){
  const s=summarize(payload,kind,anchor),time=generatedAt||new Date();
  if(!(time instanceof Date)||!Number.isFinite(time.valueOf()))throw Error('Invalid report generation timestamp.');
  const pdf=writer(reportLogo()), period=kind.toUpperCase(),range=s.range.start===s.range.end?
    s.range.start:s.range.start+'  -  '+s.range.end;
  const percent=n=>Math.round(n*100)+'%';
  const coverType=kind.charAt(0).toUpperCase()+kind.slice(1);
  const coverDate=coverPeriodLabel(kind,s.range.start,s.range.end);
  const generated=time.toISOString().slice(0,16).replace('T',' ')+' UTC';
  function logoAt(x,y,w){
    if(pdf.hasLogo)pdf.image(x,y,w,w*106/520);
    else{
      pdf.text('CGV',x,y+8,25,true,C.orange);
      pdf.text('StockTake',x+65,y+8,24,true,C.ink);
    }
  }
  function subPage(title,desc){
    pdf.newPage();
    // All content stays within the printable A4 margins.
    logoAt(M,14,207);
    pdf.line(M,66,RIGHT,66,C.line,.8);
    pdf.text(title,M,80,18,true,C.ink);
    pdf.textRight(desc,RIGHT,87,9,false,C.muted);
  }

  // A4 portrait cover: white paper, embedded logo, explicit report type and dates.
  pdf.newPage();
  logoAt(M,78,410);
  pdf.line(M,187,RIGHT,187,C.line,1);
  pdf.text('OPERATIONS  /  STOCKTAKE',M,212,10,true,C.muted);
  pdf.text(coverType+' Stocktake',M,271,41,true,C.ink);
  pdf.text('Executive Report',M,338,25,false,C.ink);
  pdf.rect(M,428,W-2*M,136,C.light);
  pdf.rect(M,428,4,136,C.orange);
  pdf.text(kind==='daily'?'REPORT DATE':'REPORTING PERIOD',M+20,448,10,true,C.muted);
  pdf.text(coverDate,M+20,478,kind==='weekly'?19:23,true,C.ink);
  pdf.line(M+20,518,RIGHT-20,518,C.line,.8);
  pdf.text('DATES COVERED',M+20,527,9,true,C.muted);
  pdf.text(s.range.start+' to '+s.range.end,M+145,527,10,false,C.ink);
  pdf.line(M,689,RIGHT,689,C.line,.8);
  pdf.text('PREPARED FOR INTERNAL REVIEW',M,704,10,true,C.ink);
  pdf.textRight('Generated '+generated,RIGHT,706,9,false,C.muted);

  // Page two begins the executive summary. No black header or footer bars.
  pdf.newPage();
  logoAt(M,15,302);
  pdf.textRight('EXECUTIVE  /  '+period,RIGHT,29,9,true,C.muted);
  pdf.line(M,83,RIGHT,83,C.line,1);
  pdf.text('Stocktake executive summary',M,97,22,true,C.ink);
  pdf.text(range,M,131,11,false,C.muted);
  pdf.textRight('GENERATED  '+generated,RIGHT,151,8,false,C.muted);
  pdf.text('PERIOD PERFORMANCE',M,186,9,true,C.muted);
  const metrics=[
    ['PHYSICAL COUNT',s.counted,percent(s.coverage)+' coverage'],
    ['VERIFIED',s.verified,s.pending+' pending review'],
    ['MATCHED',s.matched,percent(s.matchRate)+' of verified'],
    ['VARIANCES',s.variances,s.activeDays+' active day(s)']
  ],gap=9,cw=(W-2*M-gap*3)/4;
  metrics.forEach((m,i)=>{
    const x=M+i*(cw+gap);
    pdf.rect(x,207,cw,105,C.light);
    pdf.rect(x,207,cw,3,i===3&&s.variances?C.orange:C.line);
    pdf.text(m[0],x+12,220,8,true,C.muted);
    pdf.text(String(m[1]),x+12,241,27,true,C.ink);
    pdf.text(ellipsis(m[2],21),x+12,290,8,false,C.muted);
  });
  pdf.text('EXECUTIVE SUMMARY',M,337,9,true,C.muted);
  pdf.rect(M,356,W-M*2,102,C.light);
  pdf.rect(M,356,4,102,C.orange);
  const message=s.activeDays===0?
    'No saved stocktake records were found for the selected period. The report does not imply zero physical inventory.':
    s.variances>0?
      s.variances+' unmatched item-day'+(s.variances===1?' requires':'s require')+
      ' reconciliation. '+s.pending+' physical count(s) still await verification.':
      s.pending>0?
        'No variances among the '+s.verified+' verified item-days. '+s.pending+' count(s) still await verification.':
        'No variances among '+s.verified+' verified item-days. Review overall counting coverage below.';
  const words=sane(message).split(/\s+/),wrapped=[];let part='';
  words.forEach(word=>{
    if((part+' '+word).trim().length>77&&part){wrapped.push(part);part=word;}
    else part+=(part?' ':'')+word;
  });if(part)wrapped.push(part);
  wrapped.slice(0,3).forEach((l,i)=>pdf.text(l,M+16,371+i*18,11,i===0,C.ink));
  pdf.text('SOURCE  Saved Google Sheets data - read-only export',M+16,433,8,false,C.muted);
  function progress(label,value,y,caption){
    pdf.text(label,M,y,11,true,C.ink);
    pdf.textRight(caption,RIGHT,y,9,false,C.muted);
    pdf.rect(M,y+22,W-2*M,10,C.line);
    if(value>0)pdf.rect(M,y+22,(W-2*M)*Math.max(0,Math.min(1,value)),10,C.dark);
  }
  progress('Physical counting coverage',s.coverage,482,s.counted+' / '+s.expected+' item-days');
  progress('Verification match rate',s.matchRate,540,s.matched+' / '+s.verified+' verified');
  pdf.text('ACTIVITY SNAPSHOT',M,610,9,true,C.muted);
  pdf.textRight('LAST '+Math.min(s.daily.length,14)+' DAYS IN PERIOD',RIGHT,610,8,false,C.muted);
  const shown=s.daily.slice(-14),chartTop=637,chartBottom=720,cell=(W-2*M)/Math.max(1,shown.length),bh=68;
  shown.forEach((day,i)=>{
    const x=M+i*cell+Math.max(2,cell*.17);
    const width=Math.min(cell*.65,28);
    pdf.rect(x,chartTop,width,bh,C.pale);
    const portion=day.total?day.counted/day.total:0;
    if(portion>0)pdf.rect(x,chartTop+bh-bh*portion,width,bh*portion,C.dark);
    pdf.text(day.date.slice(-2),x+1,729,8,true,C.muted);
  });
  pdf.text('Coverage: counted item-days / available inventory item-days. Match rate: matched / verified.',M,761,8,false,C.muted);
  // Full date coverage and actionable discrepancies are on subsequent pages.
  subPage('Daily performance','COMPLETE DATE RANGE');
  let y=126;
  function need(h,title){
    if(y+h<=762)return;
    subPage(title||'Report details','CONTINUED');y=126;
  }
  function dailyHead(){
    pdf.rect(M,y,W-2*M,27,C.light);
    pdf.text('DATE',M+9,y+8,8,true,C.ink);
    pdf.textRight('COUNTED',M+164,y+8,8,true,C.ink);
    pdf.textRight('VERIFIED',M+244,y+8,8,true,C.ink);
    pdf.textRight('MATCH',M+320,y+8,8,true,C.ink);
    pdf.textRight('VARIANCE',M+407,y+8,8,true,C.ink);
    pdf.textRight('PENDING',M+481,y+8,8,true,C.ink);
    pdf.textRight('COVER',RIGHT-6,y+8,8,true,C.ink);
    y+=27;
  }
  pdf.text('Daily counting and verification totals',M,y,14,true,C.ink);y+=25;
  dailyHead();
  s.daily.forEach((d,i)=>{
    need(21,'Daily performance');
    if(y===126){pdf.text('Daily counting and verification totals (cont.)',M,y,12,true,C.ink);y+=23;dailyHead();}
    pdf.rect(M,y,W-2*M,19,i%2?C.white:C.light);
    pdf.text(d.date,M+9,y+4,9,false,C.ink);
    pdf.textRight(d.counted,M+164,y+4,9,false,C.ink);
    pdf.textRight(d.verified,M+244,y+4,9,false,C.ink);
    pdf.textRight(d.matched,M+320,y+4,9,false,C.green);
    pdf.textRight(d.variances,M+407,y+4,9,d.variances>0,d.variances?C.red:C.ink);
    pdf.textRight(d.pending,M+481,y+4,9,false,C.ink);
    pdf.textRight(percent(d.total?d.counted/d.total:0),RIGHT-6,y+4,9,false,C.ink);
    y+=19;
  });
  y+=28;
  need(86,'Exception watchlist');
  pdf.text('PRIORITY VARIANCES',M,y,9,true,C.muted);y+=24;
  if(!s.exceptions.length){
    pdf.rect(M,y,W-2*M,48,C.light);
    pdf.text(s.activeDays===0?'No saved activity for the selected period.':
      'No verified stock variances were found in this period.',M+14,y+16,10,false,C.muted);
    y+=65;
  }else{
    const subset=s.exceptions.slice(0,15);
    function exceptionHead(){
      pdf.rect(M,y,W-2*M,25,C.light);
      pdf.text('DATE',M+9,y+7,8,true,C.ink);
      pdf.text('ITEM / NOTE',M+101,y+7,8,true,C.ink);
      pdf.textRight('ACTUAL',M+370,y+7,8,true,C.ink);
      pdf.textRight('SYSTEM',M+431,y+7,8,true,C.ink);
      pdf.textRight('DELTA',RIGHT-9,y+7,8,true,C.ink);
      y+=25;
    }
    exceptionHead();
    subset.forEach((e,i)=>{
      need(39,'Exception watchlist');
      if(y===126){pdf.text('Priority variances (cont.)',M,y,12,true,C.ink);y+=24;exceptionHead();}
      pdf.rect(M,y,W-2*M,37,i%2?C.white:C.light);
      pdf.text(e.date.slice(5),M+9,y+6,9,false,C.ink);
      pdf.text(ellipsis(e.item,33),M+101,y+4,10,true,C.ink);
      pdf.text(ellipsis((e.remarks||'No remark')+(e.uom?'  |  '+e.uom:''),43),M+101,y+20,8,false,C.muted);
      pdf.textRight(fmtNum(e.actual),M+370,y+7,9,false,C.ink);
      pdf.textRight(fmtNum(e.system),M+431,y+7,9,false,C.ink);
      pdf.textRight(fmtNum(e.diff),RIGHT-9,y+7,9,true,C.red);
      y+=37;
    });
    if(s.exceptions.length>subset.length){
      need(25,'Exception watchlist');
      pdf.text('Showing '+subset.length+' recent discrepancies of '+s.exceptions.length+
        '. Download CSV for the full item-level audit trail.',M,y+8,9,false,C.muted);
    }
  }

  // Full Verifier item table, printed after the executive summary. Every item
  // with a saved-count date is included, not only mismatched items.
  const detailGroups=buildItemDetails(payload,s);
  // Fixed A4 column rectangles (points). Never let text extend beyond its cell.
  const DETAIL_COLUMNS={
    no:{x:M+5,w:20},
    item:{x:M+29,w:148},
    uom:{x:M+180,w:28},
    actual:{x:M+212,w:52},
    system:{x:M+266,w:52},
    diff:{x:M+320,w:49},
    remarks:{x:M+372,w:84},
    status:{x:M+461,w:55}
  };
  const cell=(key,text,top,size=7.7,bold=false,tint=C.ink,align='left')=>{
    const col=DETAIL_COLUMNS[key];
    pdf.boxText(text,col.x,top,col.w,size,bold,tint,align);
  };
  let detailPages=0,detailRowCount=0,detailY=0;
  function detailPage(group,continued){
    subPage('Item-level stocktake',continued?'COUNT DATE - CONTINUED':'COMPLETE ITEM TABLE');
    detailPages++;
    pdf.text('COUNT DATE: '+formatCoverDate(group.date)+(continued?'  /  CONTINUED':''),M,124,12,true,C.ink);
    pdf.textRight(group.rows.length+' items  |  '+group.recordCount+' saved rows',
      RIGHT,129,9,false,C.muted);
    pdf.line(M,149,RIGHT,149,C.line,.7);
    pdf.rect(M,159,W-2*M,26,C.light);
    cell('no','NO',167,7.3,true);
    cell('item','ITEM NAME',167,7.3,true);
    cell('uom','UOM',167,7.3,true);
    cell('actual','ACTUAL',167,7.3,true,C.ink,'right');
    cell('system','SYSTEM',167,7.3,true,C.ink,'right');
    cell('diff','DIFF',167,7.3,true,C.ink,'right');
    cell('remarks','REMARKS',167,7.3,true);
    cell('status','STATUS',167,7.3,true);
    detailY=185;
  }
  if(!detailGroups.length){
    subPage('Item-level stocktake','NO SAVED COUNT DATES');
    detailPages++;
    pdf.rect(M,126,W-2*M,92,C.light);
    pdf.text('No item-level records were saved for this reporting period.',M+15,145,11,true,C.ink);
    pdf.text('The daily summaries above still show all calendar dates.',M+15,169,9,false,C.muted);
    pdf.text('For a full inventory list on an empty date, select a Daily report.',M+15,188,9,false,C.muted);
  }
  detailGroups.forEach(group=>{
    detailPage(group,false);
    group.rows.forEach((item,index)=>{
      const name=wrapPdfCell(item.name,DETAIL_COLUMNS.item.w,7.7);
      const uom=wrapPdfCell(item.uom,DETAIL_COLUMNS.uom.w,7);
      const remarks=wrapPdfCell(item.remarks,DETAIL_COLUMNS.remarks.w,7.2);
      const status=wrapPdfCell(item.status,DETAIL_COLUMNS.status.w,6.8);
      const lines=Math.max(name.length,uom.length,remarks.length,status.length,1);
      const lineHeight=10.5,padding=14;
      let offset=0;
      while(offset<lines){
        const available=Math.floor((767-detailY-padding)/lineHeight);
        if(available<1){detailPage(group,true);continue;}
        const count=Math.min(available,lines-offset);
        const height=Math.max(29,padding+count*lineHeight);
        if(detailY+height>767){detailPage(group,true);continue;}
        const yTop=detailY;
        if(index%2===0)pdf.rect(M,yTop,W-2*M,height,C.light);
        pdf.line(M,yTop+height,RIGHT,yTop+height,C.line,.35);
        if(offset===0){
          cell('no',String(item.number),yTop+7,7.6,false,C.muted);
          const numeric=(key,value,tint=C.ink,bold=false)=>{
            const displayed=fmtNum(value);
            const maxWidth=DETAIL_COLUMNS[key].w-4;
            const scale=helveticaTextWidth(displayed,7.8,bold);
            const size=scale>maxWidth?Math.max(5.5,7.8*maxWidth/scale):7.8;
            cell(key,displayed,yTop+7,size,bold,tint,'right');
          };
          numeric('actual',item.actual);
          numeric('system',item.system);
          numeric('diff',item.difference,
            item.status==='VARIANCE'?C.red:C.ink,item.status==='VARIANCE');
        }
        for(let i=0;i<count;i++){
          const lineNumber=offset+i,at=yTop+7+i*lineHeight;
          if(lineNumber<name.length)cell('item',name[lineNumber],at,7.7,false,C.ink);
          if(lineNumber<uom.length)cell('uom',uom[lineNumber],at,7,false,C.muted);
          if(lineNumber<remarks.length)cell('remarks',remarks[lineNumber],at,7.2,false,C.ink);
          if(lineNumber<status.length)cell('status',status[lineNumber],at,6.8,
            lineNumber===0,item.status==='MATCH'?C.green:
              item.status==='VARIANCE'?C.red:item.status==='PENDING'?C.amber:C.muted);
        }
        detailY+=height;
        offset+=count;
      }
      detailRowCount++;
    });
  });

  // Every page has a stable bottom footer and page count.
  const total=pdf.pages.length;
  pdf.pages.forEach((p,i)=>{
    const page=i+1;
    const drawCmds=p.commands;
    // The footer must be drawn on the page it belongs to, not only on the current page.
    const at=pdf.pages.length;
    p.commands=[];
    // Add footer in a temporary selected page by directly creating commands.
    const temp=pdf.pages[i],saved=pdf.pages;
    // Page-level footer commands, in PDF user-space, with escaped ASCII literals.
    temp.commands.push(color(C.line)+' RG .8 w '+f(M)+' '+f(H-792)+' m '+f(RIGHT)+' '+f(H-792)+' l S\n');
    function footerText(t,x,top,size,bold,shade){
      temp.commands.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+color(shade)+' rg 1 0 0 1 '+
        f(x)+' '+f(H-top-size)+' Tm ('+esc(t)+') Tj ET\n');
    }
    footerText('CGV STOCKTAKE / EXECUTIVE REPORT',M,802,8,true,C.muted);
    footerText('PAGE '+page+' / '+total,RIGHT-68,802,8,true,C.muted);
    temp.commands=drawCmds.concat(temp.commands);
  });
  const out=pdf.finish();
  return {filename:'CGV-StockTake-Executive-'+kind+'-'+s.range.start+
    (s.range.start===s.range.end?'':'-to-'+s.range.end)+'.pdf',
    bytes:out.bytes, pages:out.pages,kind,start:s.range.start,end:s.range.end,
    activeDays:s.activeDays,variances:s.variances,verified:s.verified,format:'A4 portrait',coverType,coverDate,
    detailPages,detailDays:detailGroups.length,detailRows:detailRowCount};
}
function downloadExecutivePdf(report){
  if(typeof document==='undefined'||typeof URL==='undefined'||typeof Blob==='undefined')
    throw Error('PDF download is not supported in this environment.');
  const url=URL.createObjectURL(new Blob([report.bytes],{type:'application/pdf'}));
  const link=document.createElement('a');
  link.href=url;link.download=report.filename;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
}
const api={makeExecutivePdf,downloadExecutivePdf,summarize,buildItemDetails,wrapPdfCell,helveticaTextWidth};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.StockTakeExecutivePdf=api;
})(typeof window!=='undefined'?window:null);
