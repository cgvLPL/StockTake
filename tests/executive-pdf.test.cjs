const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeExecutivePdf,summarize}=require('../executive-pdf.js');
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
 assert.match(pdfText(pdf),/Stock count executive report/);
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
