const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const file = name => fs.readFileSync(path.join(root,name),'utf8');

test('Verifier dashboard has accessible progress and preserved business controls', () => {
  const html=file('index.html');
  const app=file('app.js');
  assert.match(html,/id="dashboardProgressTrack"[^>]+role="progressbar"|role="progressbar"[^>]+id="dashboardProgressTrack"/);
  assert.match(html,/id="verifiedPercent"/);
  assert.match(html,/id="verifiedFraction"/);
  assert.match(html,/id="reportPanel"/);
  assert.match(html,/id="verifierStaffPanel"/);
  assert.match(html,/id="rows"/);
  assert.match(html,/data-report-period="weekly"/);
  assert.match(html,/data-report-period="monthly"/);
  assert.match(html,/href="\.\/ui-refresh\.css/);
  assert.match(app,/const verifiedPercent=n\?Math\.round\(c\/n\*100\)/);
  assert.match(app,/dashboardProgressTrack/);
});

test('Mobile refresh preserves safe-area dock and count entry layout', () => {
  const css=file('ui-refresh.css');
  const roles=file('roles.css');
  assert.match(css,/\.frame \.rail\s*\{/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/body:has\(#roleItems\)/);
  assert.match(css,/dashboard-progress-track/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(roles,/\.role-item\[hidden\]\s*\{display:none!important\}/);
});

test('Deployment includes the visual refresh for online and offline users', () => {
  const workflow=file('.github/workflows/pages.yml');
  const worker=file('sw.js');
  assert.match(workflow,/cp index\.html styles\.css roles\.css ui-refresh\.css/);
  assert.match(worker,/'\.\/ui-refresh\.css'/);
});


test('Executive report date selector remains 48px high and contained on iPhone', () => {
  const css=file('ui-refresh.css');
  const html=file('index.html');
  assert.match(html, /<input type="date" id="reportDate" required>/);
  assert.match(css, /#reportPanel input#reportDate\s*\{[^}]*height:48px;[^}]*max-height:48px;/s);
  assert.match(css, /#reportPanel input#reportDate\s*\{[^}]*box-sizing:border-box;[^}]*width:100%;[^}]*min-width:0;/s);
  assert.match(css, /#reportPanel \.report-date-field\s*\{[^}]*max-width:100%;/s);
  assert.match(html, /ui-refresh\.css\?v=20261020-datebox/);
});
