const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeExecutivePdf,summarize,buildItemDetails,wrapPdfCell,helveticaTextWidth}=require('../executive-pdf.js');
const items=[
 {id:'stock-001',name:'Coke',uom:'g'},
 {id:'stock-002',name:'Mango Syrup',uom:'ml'},
 {id:'stock-003',name:'Straws',uom:'EA'}
];
const stamp=new Date('2026-10-19T10:30:00Z');
function pdfText(doc){return Buffer.from(doc.bytes).toString('latin1')}
function validatePdf(doc){
 const text=pdfText(doc);
 assert.match(text,/^%PDF-1\.4\n/);
 assert.match(text,/%%EOF\s*$/);
 const match=/startxref\n(\d+)\n%%EOF/.exec(text);
 assert.ok(match,'PDF trailer must contain startxref');
 const before=Buffer.from(doc.bytes).subarray(0,Number(match[1])).toString('latin1');
 assert.ok(before.endsWith('\n'),'xref offset should point to a new line');
 const at=Buffer.from(doc.bytes).subarray(Number(match[1])).toString('latin1');
 assert.ok(at.startsWith('xref\n'),'xref must begin at byte offset');
 assert.equal((text.match(/\/Type \/Page \/Parent/g)||[]).length,doc.pages);
 assert.ok(doc.bytes.length>4000,'PDF should contain page content');
}
test('Executive PDF summarizes daily saved stock correctly including counted zero',()=>{
 const payload={
  start:'2026-10-14',end:'2026-10-14',items,
  rows:[
   {date:'2026-10-14',item_id:'stock-001',actual:0,system:0,remarks:'checked'},
   {date:'2026-10-14',item_id:'stock-002',actual:12,system:10,remarks:'Diff (2)'}
  ]
 };
 const stats=summarize(payload,'daily','2026-10-14');
 assert.equal(stats.counted,2);
 assert.equal(stats.verified,2);
 assert.equal(stats.matched,1);
 assert.equal(stats.variances,1);
 assert.equal(stats.uncounted,1);
 assert.equal(stats.pending,0);
 assert.equal(stats.activeDays,1);
 const pdf=makeExecutivePdf(payload,'daily','2026-10-14',stamp);
 assert.equal(pdf.filename,'CGV-StockTake-Executive-daily-2026-10-14.pdf');
 assert.equal(pdf.variances,1);
 validatePdf(pdf);
 assert.match(pdfText(pdf),/Stocktake executive summary/);
 assert.match(pdfText(pdf),/Daily Stocktake/);
 assert.match(pdfText(pdf),/Executive Report/);
 assert.match(pdfText(pdf),/PRIORITY VARIANCES/);
 assert.match(pdfText(pdf),/Daily counting and verification totals/);
 assert.match(pdfText(pdf),/PAGE 1 \/ /);
});
test('Weekly and monthly Executive PDF covers the full requested calendar range',()=>{
 const weekly={
  start:'2026-10-12',end:'2026-10-18',items,
  rows:[
   {date:'2026-10-12',item_id:'stock-001',actual:5,system:null},
   {date:'2026-10-14',item_id:'stock-002',actual:8,system:8}
  ]
 };
 const sums=summarize(weekly,'weekly','2026-10-14');
 assert.equal(sums.days,7);
 assert.equal(sums.pending,1);
 assert.equal(sums.matched,1);
 assert.equal(sums.activeDays,2);
 const pdf=makeExecutivePdf(weekly,'weekly','2026-10-14',stamp);
 validatePdf(pdf);
 assert.match(pdf.filename,/weekly-2026-10-12-to-2026-10-18/);
 assert.match(pdfText(pdf),/2026-10-18/);
 const monthly=makeExecutivePdf({start:'2026-02-01',end:'2026-02-28',items,rows:[]},'monthly','2026-02-14',stamp);
 validatePdf(monthly);
 assert.equal(monthly.variances,0);
 assert.match(pdfText(monthly),/No saved stocktake records were found/);
 assert.match(pdfText(monthly),/2026-02-28/);
});
test('Monthly exception watchlist paginates and escapes unsafe PDF text',()=>{
 const rows=[];
 for(let i=1;i<=22;i++){
  const date='2026-10-'+String(i).padStart(2,'0');
  rows.push({date,item_id:'stock-001',actual:i+3,system:i,remarks:'Investigate (test) \\ shift'});
 }
 const payload={start:'2026-10-01',end:'2026-10-31',items,rows};
 const pdf=makeExecutivePdf(payload,'monthly','2026-10-19',stamp);
 validatePdf(pdf);
 assert.equal(pdf.variances,22);
 assert.ok(pdf.pages>=2);
 assert.match(pdfText(pdf),/Showing 15 recent discrepancies of 22/);
 assert.ok(pdfText(pdf).includes(String.raw`Investigate \(test\) \\ shift`), 'PDF must escape parentheses and slashes in notes');
 assert.match(pdfText(pdf),/PAGE 1 \/ /);
 assert.doesNotMatch(pdfText(pdf),/\bNaN\b/);
});
test('Executive PDF rejects invalid data and does not silently mix periods',()=>{
 const wrong={start:'2026-10-13',end:'2026-10-13',items,rows:[]};
 assert.throws(()=>makeExecutivePdf(wrong,'daily','2026-10-14',stamp),/Incomplete data/);
 assert.throws(()=>makeExecutivePdf({},'weekly','2026-10-14',stamp),/Incomplete data/);
});

test('Executive PDF embeds the uploaded CGV StockTake logo as an image on each page', () => {
  const logo=require('../brand/cgv-stocktake-report-logo.js');
  const bytes=Buffer.from(logo.jpegBase64,'base64');
  assert.equal(bytes.length,6112);
  assert.equal(logo.width,520);
  assert.equal(logo.height,106);
  const pdf=makeExecutivePdf({start:'2026-10-14',end:'2026-10-14',items,rows:[]},
    'daily','2026-10-14',stamp);
  const source=pdfText(pdf);
  assert.match(source,/\/Subtype \/Image \/Width 520 \/Height 106/);
  assert.match(source,/\/ReportLogo Do Q/);
  assert.match(source,/\/XObject << \/ReportLogo/);
  validatePdf(pdf);
});


test('Executive reports use print-ready A4 portrait pages and a dedicated white cover', () => {
  const periods=[
    {kind:'daily',anchor:'2026-10-14',start:'2026-10-14',end:'2026-10-14',date:'14 October 2026',heading:'Daily Stocktake'},
    {kind:'weekly',anchor:'2026-10-14',start:'2026-10-12',end:'2026-10-18',date:'12 - 18 October 2026',heading:'Weekly Stocktake'},
    {kind:'monthly',anchor:'2026-10-14',start:'2026-10-01',end:'2026-10-31',date:'October 2026',heading:'Monthly Stocktake'}
  ];
  for(const p of periods){
    const result=makeExecutivePdf({start:p.start,end:p.end,items,rows:[]},p.kind,p.anchor,stamp);
    const text=pdfText(result);
    validatePdf(result);
    assert.ok(result.pages>=3,'PDF should include a dedicated cover, summary, and daily detail');
    assert.equal(result.format,'A4 portrait');
    assert.equal(result.coverType,p.kind.charAt(0).toUpperCase()+p.kind.slice(1));
    assert.equal(result.coverDate,p.date);
    assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/);
    assert.match(text, new RegExp('\\('+p.heading+'\\) Tj ET'));
    assert.ok(text.includes('('+p.date+') Tj ET'),'Cover must show the report date or period');
    assert.ok(text.includes('(REPORTING PERIOD) Tj ET')||text.includes('(REPORT DATE) Tj ET'));
    assert.match(text,/\(Executive Report\) Tj ET/);
    assert.match(text,/\(Stocktake executive summary\) Tj ET/);
    assert.match(text,/\(CGV STOCKTAKE \/ EXECUTIVE REPORT\) Tj ET/);
    assert.doesNotMatch(text,/0 675\.89 595\.28 166 re f/,'No black full-width top stripe on summary');
    assert.doesNotMatch(text,/0 745\.89 595\.28 96 re f/,'No black full-width top stripe on detail');
    assert.equal((text.match(/\/ReportLogo Do Q/g)||[]).length,result.pages,'Logo should appear on every A4 page');
  }
});


test('Daily PDF prints every stock table row, including missing values, zero, notes and statuses',()=>{
 const payload={start:'2026-10-14',end:'2026-10-14',items,rows:[
  {date:'2026-10-14',item_id:'stock-001',actual:0,system:0,remarks:'Checked (0)'},
  {date:'2026-10-14',item_id:'stock-002',actual:1200.5,system:1201.75,remarks:'Physical mismatch'},
  {date:'2026-10-14',item_id:'stock-003',actual:null,system:10,remarks:'Awaiting count'}
 ]};
 const groups=buildItemDetails(payload,summarize(payload,'daily','2026-10-14'));
 assert.equal(groups.length,1);
 assert.equal(groups[0].rows.length,3);
 assert.deepEqual(groups[0].rows.map(r=>r.status),['MATCH','VARIANCE','AWAIT COUNT']);
 assert.equal(groups[0].rows[0].actual,0);
 assert.equal(groups[0].rows[1].difference,-1.25);
 assert.equal(groups[0].rows[2].actual,null);
 const pdf=makeExecutivePdf(payload,'daily','2026-10-14',stamp);
 validatePdf(pdf);
 assert.equal(pdf.detailDays,1);
 assert.equal(pdf.detailRows,3);
 assert.ok(pdf.detailPages>=1);
 const source=pdfText(pdf);
 for(const phrase of ['Item-level stocktake','ITEM NAME','ACTUAL','SYSTEM','DIFF','REMARKS',
   'STATUS','Coke','Mango Syrup','Straws','Physical mismatch','Checked',
   '1200.5','1201.75','-1.25','VARIANCE','AWAIT COUNT']){
   assert.ok(source.includes(phrase),'Missing printable item data: '+phrase);
 }
 assert.equal(groups[0].rows[0].remarks,'Checked (0)');
});
test('An empty Daily report lists the full catalog as NOT COUNTED without inventing quantities',()=>{
 const payload={start:'2026-10-14',end:'2026-10-14',items,rows:[]};
 const groups=buildItemDetails(payload,summarize(payload,'daily','2026-10-14'));
 assert.equal(groups.length,1);
 assert.equal(groups[0].rows.length,items.length);
 assert.ok(groups[0].rows.every(r=>r.actual===null&&r.system===null&&r.difference===null&&r.status==='NOT COUNTED'));
 const pdf=makeExecutivePdf(payload,'daily','2026-10-14',stamp);
 assert.equal(pdf.detailRows,items.length);
 validatePdf(pdf);
 assert.ok(pdfText(pdf).includes('(NOT) Tj ET'));
 assert.ok(pdfText(pdf).includes('(COUNTED) Tj ET'));
});
test('Weekly and monthly item tables include only dates with saved records and preserve archived IDs',()=>{
 const rows=[
   {date:'2026-10-12',item_id:'stock-001',actual:4,system:4,remarks:'Day 12'},
   {date:'2026-10-14',item_id:'stock-002',actual:5,system:2,remarks:'Day 14'},
   {date:'2026-10-14',item_id:'archived-678',actual:6,system:1,remarks:'Discontinued'}
 ];
 for(const kind of ['weekly','monthly']){
  const range=kind==='weekly'?{start:'2026-10-12',end:'2026-10-18'}:
    {start:'2026-10-01',end:'2026-10-31'};
  const payload={...range,items,rows};
  const groups=buildItemDetails(payload,summarize(payload,kind,'2026-10-14'));
  assert.deepEqual(groups.map(g=>g.date),['2026-10-12','2026-10-14']);
  assert.equal(groups[0].rows.length,3);
  assert.equal(groups[1].rows.length,4);
  assert.ok(groups[1].rows.some(r=>r.name==='Archived item archived-678'));
  const pdf=makeExecutivePdf(payload,kind,'2026-10-14',stamp);
  assert.equal(pdf.detailDays,2);
  assert.equal(pdf.detailRows,7);
  validatePdf(pdf);
  assert.ok(pdfText(pdf).includes('Day'));
  assert.equal(groups[0].rows[0].remarks,'Day 12');
  assert.equal(groups[1].rows[1].remarks,'Day 14');
  assert.match(pdfText(pdf),/Discontinued/);
 }
});
test('Large item catalogs and long multi-line remarks continue on A4 pages with repeated column headers',()=>{
 const inventory=Array.from({length:160},(_,i)=>({
   id:'stock-'+String(i+1).padStart(3,'0'),
   name:'Item number '+String(i+1)+' with multiword descriptive title for wrapping',
   uom:'pack'
 }));
 const lengthyNote='Long remark with detailed counting observations and supporting context. '.repeat(80);
 const payload={start:'2026-10-14',end:'2026-10-14',items:inventory,rows:[
   {date:'2026-10-14',item_id:'stock-001',actual:0,system:1,remarks:lengthyNote},
   {date:'2026-10-14',item_id:'stock-160',actual:5,system:5,remarks:'Last item verified'}
 ]};
 const pdf=makeExecutivePdf(payload,'daily','2026-10-14',stamp);
 validatePdf(pdf);
 assert.equal(pdf.detailRows,160);
 assert.ok(pdf.detailPages>=5,'Expected multiple continuing item table pages');
 const source=pdfText(pdf);
 assert.equal((source.match(/\(ITEM NAME\) Tj ET/g)||[]).length,pdf.detailPages);
 assert.equal((source.match(/\(COUNT DATE: 14 October 2026/g)||[]).length,pdf.detailPages);
 assert.ok(source.includes('(Last item)')||source.includes('(Last)'));
 assert.equal(payload.rows[1].remarks,'Last item verified');
 assert.ok(source.includes('(VERIFIED) Tj ET')||source.includes('(MATCH) Tj ET'));
 // First long note has repeated words; ensure the content continues across pages.
 assert.ok((source.match(/supporting/g)||[]).length>=25);
});
test('Monthly periods without activity do not fabricate date-specific detail tables',()=>{
 const payload={start:'2026-10-01',end:'2026-10-31',items,rows:[]};
 const details=buildItemDetails(payload,summarize(payload,'monthly','2026-10-14'));
 assert.equal(details.length,0);
 const pdf=makeExecutivePdf(payload,'monthly','2026-10-14',stamp);
 validatePdf(pdf);
 assert.equal(pdf.detailRows,0);
 assert.equal(pdf.detailDays,0);
 assert.ok(pdfText(pdf).includes('No item-level records were saved for this reporting period.'));
});


test('A4 table wraps long product names by measured width and keeps each line inside its cell',()=>{
 const samples=[
   {name:'CON HOT LID LOGO CINECAFE 12OZ EA [PR]',width:148,size:7.7},
   {name:'CON HOT CUP LOGO CINECAFE 12OZEA [PR]',width:148,size:7.7},
   {name:'CON BENTO 3 COMPARTMENT [PR]',width:148,size:7.7},
   {name:'EXTREMELYLONGUNBROKENSERIALNUMBER1234567890',width:148,size:7.7},
   {name:'NOT COUNTED',width:55,size:6.8},
   {name:'Staff counted twice; recount needed',width:84,size:7.2}
 ];
 for(const item of samples){
   const lines=wrapPdfCell(item.name,item.width,item.size);
   assert.ok(lines.length>=1);
   for(const line of lines){
     assert.ok(helveticaTextWidth(line,item.size)<=item.width-1,
       'Line overflows '+item.width+'pt cell: '+line);
   }
   assert.equal(lines.join(' ').replace(/\s+/g,''),item.name.replace(/\s+/g,''),
     'No item label characters may be lost when wrapping');
 }
 const payload={start:'2026-10-21',end:'2026-10-21',
  items:samples.map((x,i)=>({id:'stock-'+i,name:x.name,uom:'EA'})),
  rows:[]};
 const report=makeExecutivePdf(payload,'daily','2026-10-21',stamp);
 validatePdf(report);
 const source=pdfText(report);
 const clipCount=(source.match(/ re W n/g)||[]).length;
 assert.ok(clipCount>report.detailRows*4,'Expected PDF clip bounds around each rendered stock cell');
 assert.equal(report.detailRows,samples.length);
});
