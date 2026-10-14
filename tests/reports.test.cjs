const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { periodRange, makeReport, csvCell } = require('../reports.js');

test('daily, Monday-Sunday weekly and calendar-month periods handle year/leap boundaries', () => {
  assert.deepEqual(periodRange('daily', '2026-10-14'),
    {start: '2026-10-14', end: '2026-10-14'});
  assert.deepEqual(periodRange('weekly', '2026-10-14'),
    {start: '2026-10-12', end: '2026-10-18'});
  assert.deepEqual(periodRange('weekly', '2027-01-01'),
    {start: '2026-12-28', end: '2027-01-03'});
  assert.deepEqual(periodRange('monthly', '2024-02-15'),
    {start: '2024-02-01', end: '2024-02-29'});
  assert.throws(() => periodRange('monthly', '2026-02-30'), /valid report date/);
});

const items = [
  {id:'stock-001',name:'COKE',uom:'EA'},
  {id:'stock-002',name:'Syrup, Mango',uom:'ml'},
  {id:'stock-003',name:'Topping',uom:'g'}
];
test('weekly report includes each day summary and all saved item quantities', () => {
  const rows = [
    {date:'2026-10-12',item_id:'stock-001',actual:0,system:0,remarks:'zero counted'},
    {date:'2026-10-13',item_id:'stock-002',actual:12,system:15,remarks:'Stock differs'},
    {date:'2026-10-14',item_id:'stock-003',actual:4,system:null,remarks:'Needs review'}
  ];
  const report = makeReport({
    start:'2026-10-12',end:'2026-10-18',items,rows
  },'weekly','2026-10-14',new Date('2026-10-19T00:00:00Z'));
  assert.equal(report.filename,'CGV-StockTake-weekly-2026-10-12-to-2026-10-18.csv');
  assert.equal(report.days,7);
  assert.equal(report.activeDays,3);
  assert.equal(report.counted,3);
  assert.equal(report.variances,1);
  assert.ok(report.csv.startsWith('\uFEFF'));
  assert.match(report.csv,/2026-10-12,3,1,1,1,0,0,2,33\.3/);
  assert.match(report.csv,/2026-10-13,3,1,1,0,1,0,2,33\.3/);
  assert.match(report.csv,/2026-10-14,3,1,0,0,0,1,2,33\.3/);
  assert.match(report.csv,/2026-10-15,3,0,0,0,0,0,3,0/);
  assert.match(report.csv,/2026-10-12,1,stock-001,COKE,EA,0,0,0,zero counted,MATCH/);
  assert.match(report.csv,/2026-10-13,2,stock-002,"Syrup, Mango",ml,12,15,-3,Stock differs,DO NOT MATCH/);
  assert.match(report.csv,/2026-10-14,3,stock-003,Topping,g,4,,,Needs review,Pending verification/);
});

test('daily report includes the full item catalog, including when no records are saved', () => {
  const report=makeReport({start:'2026-10-14',end:'2026-10-14',items,rows:[]},
    'daily','2026-10-14',new Date('2026-10-14T07:00:00Z'));
  assert.equal(report.activeDays,0);
  assert.equal(report.filename,'CGV-StockTake-daily-2026-10-14.csv');
  assert.match(report.csv,/2026-10-14,1,stock-001,COKE,EA,,,,,Not counted/);
});

test('report keeps historical IDs no longer in current inventory and sanitizes formulas', () => {
  const report=makeReport({
    start:'2026-10-01',end:'2026-10-31',items:[{id:'stock-001',name:'=EVIL()',uom:'EA'}],
    rows:[{date:'2026-10-14',item_id:'stock-999',actual:10,system:9,remarks:'=HYPERLINK("bad")'}]
  },'monthly','2026-10-14',new Date('2026-10-14T00:00:00Z'));
  assert.match(report.csv,/Archived item stock-999/);
  assert.match(report.csv,/'=EVIL\(\)/);
  assert.match(report.csv,/'=HYPERLINK\(""bad""\)/);
  assert.equal(csvCell('a,b'),'"a,b"');
  assert.equal(csvCell('@SUM(A1)'),"'@SUM(A1)");
  assert.equal(csvCell(0),'0');
  assert.equal(csvCell(-3),'-3');
});

test('Google Apps Script range endpoint filters once and restricts counter access', () => {
  const source=fs.readFileSync(path.join(__dirname,'../google-apps-script/Code.gs'),'utf8');
  const context=vm.createContext({console,Date,Number,String,RegExp,Error});
  vm.runInContext(source,context);
  const displayed=[
    ['Date','Item ID','Actual','System','Remarks','Updated At','Updated By'],
    ['2026-10-12','stock-001','0','0','checked','',''],
    ['2026-10-14','stock-003','4','','pending','',''],
    ['2026-11-01','stock-001','2','2','outside','','']
  ];
  const values=displayed.map(r=>r.slice());
  values[1][2]=0;values[1][3]=0;values[2][2]=4;values[2][3]='';
  context.sheet_=()=>({getDataRange(){return {
    getDisplayValues(){return displayed},
    getValues(){return values}
  }}});
  context.catalog_=()=>items.map(({id,name,uom})=>({id,name,uom}));
  let result=context.reportData_('2026-10-12','2026-10-18');
  assert.equal(result.rows.length,2);
  assert.equal(result.rows[0].actual,0);
  assert.equal(result.rows[1].system,null);
  assert.equal(result.items.length,3);
  assert.throws(()=>context.reportData_('2026-10-31','2026-10-01'),/1–31 days/);
  assert.throws(()=>context.reportData_('2026-10-01','2026-11-01'),/1–31 days/);
  context.user_=()=>({role:'counter'});
  assert.throws(()=>context.process_({action:'report',startDate:'2026-10-12',endDate:'2026-10-18'}),/Verifier access required/);
});
