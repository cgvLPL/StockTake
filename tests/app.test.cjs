const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function fixture() {
  const elements = new Map(), storage = new Map();
  function element(key) {
    if (!elements.has(key)) {
      const classes = new Set();
      elements.set(key, { hidden: false, textContent: '', innerHTML: '', value: '', dataset: {},
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle(x,on) { on ? classes.add(x) : classes.delete(x); } },
        handlers: {}, addEventListener(n,f) { this.handlers[n] = f; }, setAttribute() {}, focus() {}, scrollIntoView() {},
        querySelectorAll() { return []; }, appendChild() {} });
    }
    return elements.get(key);
  }
  const context = vm.createContext({ console, Intl, Date, Map, Set, Object, Number, String, Math, JSON,
    document: { querySelector: element, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    navigator: {}, location: { protocol: 'http:' }, window: { addEventListener() {} },
    setTimeout: () => 1, clearTimeout() {}, matchMedia: () => ({ matches: true }) });
  vm.runInContext(source, context);
  return { context, elements, storage, element, run: code => vm.runInContext(code, context) };
}
test('strict locale-aware quantities and invalid entries', () => {
  const f = fixture();
  for (const [value, expected] of [['1.000,50',1000.5],['1000.50',1000.5],['0',0],['-2,25',-2.25],['.25',.25],['1.2345',1.2345]])
    assert.equal(f.run(`num(${JSON.stringify(value)})`),expected);
  for (const value of ['12abc','Infinity','1e3','1,2,3','1.000,12345','1.12345','10000000001','1,000.50','   '])
    assert.equal(f.run(`num(${JSON.stringify(value)})`),null);
  assert.equal(f.run("calc({a:'1.000,50',s:'1'}).st"),'DO NOT MATCH');
});
test('display precision agrees with comparison precision', () => {
  const f = fixture();
  assert.equal(f.run("calc({a:'1.001',s:'1'}).diff"),0.001);
  assert.equal(f.run("fmt.format(calc({a:'1.001',s:'1'}).diff)"),'0,001');
  assert.equal(f.run("calc({a:'0.3',s:'0.3000'}).st"),'MATCH');
  assert.equal(f.run("calc({a:'0',s:''}).diff"),null);
});
test('legacy data migrates without losing zero or remarks', () => {
  const f = fixture();
  assert.equal(f.run("normalize({'0':{a:0,s:'1',r:'test'}})['stock-001'].a"),'0');
  assert.equal(f.run("normalize({version:2,records:{'stock-001':{a:'5'}}})['stock-001'].a"),'5');
  assert.throws(() => f.run('normalize(null)'));
  assert.throws(() => f.run('normalize([])'));
  assert.throws(() => f.run("normalize({version:9,records:{}})"));
  assert.equal(f.run('new Set(ITEMS.map(it=>it[2])).size'),103);
});
test('failed saves survive date navigation and can be retried', () => {
  const f = fixture();
  f.run("data={'stock-001':{a:'12',s:'12'}}");
  f.context.localStorage.setItem = () => { throw Error('Quota exceeded'); };
  const day = f.run('date');
  assert.equal(f.run('save()'),false);
  f.run("go('2026-01-01')"); f.run(`go(${JSON.stringify(day)})`);
  assert.equal(f.run("data['stock-001'].a"),'12');
  assert.equal(f.element('#storageStatus').hidden,false);
  f.context.localStorage.setItem = (k,v) => f.storage.set(k,v);
  assert.equal(f.run('save()'),true);
  assert.equal(f.run('dirty.size'),0);
  assert.equal(JSON.parse(f.storage.get('stocktake:'+day)).version,2);
});
test('damaged records are preserved, and read errors cannot cause overwrite', () => {
  const f = fixture();
  f.storage.set('stocktake:2026-01-02','null');
  f.run("go('2026-01-02');data={'stock-001':{a:'2'}}");
  assert.equal(f.run('save()'),false);
  assert.equal(f.storage.get('stocktake:2026-01-02'),'null');
  f.context.localStorage.getItem = () => { throw Error('Read unavailable'); };
  f.run("go('2026-02-03')");
  assert.equal(f.run('save()'),false);
});
test('clear confirmation is bound to a date and failed deletion keeps data', () => {
  const f = fixture(), button = f.element('#clear');
  f.run("data={'stock-001':{a:'8'}};save()");
  const day = f.run('date');
  button.onclick(); assert.equal(f.run('armedDate'),day);
  f.run("go('2026-01-01')"); assert.equal(f.run('armedDate'),null);
  button.onclick(); assert.equal(f.run('armedDate'),'2026-01-01');
  assert.ok(f.storage.has('stocktake:'+day));
  f.run(`go(${JSON.stringify(day)})`);
  f.context.localStorage.removeItem = () => { throw Error('Blocked'); };
  button.onclick(); button.onclick();
  assert.equal(f.run("data['stock-001'].a"),'8');
});
test('spreadsheet text cannot become formulas or extra columns', () => {
  const f = fixture();
  assert.equal(f.run("excelText('=1+1')"),"'=1+1");
  assert.equal(f.run("excelText(' @SUM(A1)')"),"' @SUM(A1)");
  assert.equal(f.run("excelText('hello\\tworld\\nnext')"),'hello world next');
  assert.equal(f.run("excelNumber('1.000,50')"),'1000,5');
  assert.equal(f.run("excelNumber('-2')"),'-2');
});
test('filters hide rows using stable catalog IDs', () => {
  const f = fixture();
  const rows = [{dataset:{i:'stock-001',st:'MATCH'}},{dataset:{i:'stock-002',st:'DO NOT MATCH'}}];
  f.context.document.querySelectorAll = selector => selector === '#rows .row' ? rows : [];
  f.run("filter='bad';filt()");
  assert.equal(rows[0].hidden,true);assert.equal(rows[1].hidden,false);
  f.run("filter='all';query='zzzz';filt()");
  assert.ok(rows.every(r=>r.hidden));assert.equal(f.element('#empty').hidden,false);
  const css = fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert.match(css,/\[hidden\]\s*\{\s*display:none!important\s*\}/);
  assert.match(source,/save\(\);paint\(r\);stats\(\);month\(\);filt\(true\)/);
});
