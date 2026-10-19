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
