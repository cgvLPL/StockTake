/* CSV report generator for StockTake cloud data (browser and Node test compatible). */
(function (root) {
  'use strict';

  function isoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function dayISO(date) {
    return date.toISOString().slice(0, 10);
  }
  function periodRange(kind, anchor) {
    if (!isoDate(anchor)) throw Error('Choose a valid report date.');
    const d = new Date(anchor + 'T00:00:00Z');
    if (kind === 'daily') return { start: anchor, end: anchor };
    if (kind === 'weekly') {
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      return { start: dayISO(monday), end: dayISO(sunday) };
    }
    if (kind === 'monthly') {
      return {
        start: dayISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))),
        end: dayISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
      };
    }
    throw Error('Unknown report period.');
  }
  function csvCell(value) {
    if (value == null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    let result = String(value).replace(/\u0000/g, '');
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(result)) result = "'" + result;
    return /[,"\r\n]/.test(result) ? '"' + result.replace(/"/g, '""') + '"' : result;
  }
  function asQuantity(value) {
    if (value === null || value === undefined || value === '') return null;
    const v = Number(value);
    return Number.isFinite(v) ? v : null;
  }
  function daySequence(start, end) {
    if (!isoDate(start) || !isoDate(end)) throw Error('Invalid report date range.');
    let d = new Date(start + 'T00:00:00Z');
    const limit = new Date(end + 'T00:00:00Z');
    const result = [];
    while (d <= limit && result.length <= 31) {
      result.push(dayISO(d));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    if (!result.length || result.length > 31 || d <= limit) throw Error('Report range must be 1 to 31 days.');
    return result;
  }
  function makeReport(payload, kind, anchor, generatedAt) {
    const expected = periodRange(kind, anchor);
    if (!payload || payload.start !== expected.start || payload.end !== expected.end ||
      !Array.isArray(payload.items) || !Array.isArray(payload.rows)) {
      throw Error('Report data is incomplete or does not match the selected period.');
    }
    const dates = daySequence(expected.start, expected.end);
    const catalog = payload.items.map((item, i) => ({
      id: String(item.id), name: String(item.name || item.id),
      uom: String(item.uom || ''), number: i + 1
    }));
    const knownIds = new Set(catalog.map(item => item.id));
    const byDate = new Map();
    payload.rows.forEach(record => {
      if (!record || !dates.includes(record.date) || !record.item_id) return;
      if (!byDate.has(record.date)) byDate.set(record.date, new Map());
      byDate.get(record.date).set(String(record.item_id), record);
    });
    const lines = [];
    const add = row => lines.push(row.map(csvCell).join(','));
    const title = kind.charAt(0).toUpperCase() + kind.slice(1);
    add(['CGV StockTake - ' + title + ' Report']);
    add(['Period', expected.start + ' to ' + expected.end]);
    const timestamp = generatedAt || new Date();
    add(['Generated (UTC)', timestamp.toISOString()]);
    add(['Data source', 'Google Sheets (saved cloud records)']);
    add([]);
    add(['DAILY SUMMARY']);
    add(['Date', 'Items', 'Actual counted', 'Verified', 'Match', 'Do not match',
      'Pending verification', 'Not counted', 'Completion (%)']);
    const details = [];
    let activeDays = 0;
    let countedTotal = 0;
    let mismatchesTotal = 0;
    dates.forEach(date => {
      const recs = byDate.get(date) || new Map();
      if (recs.size) activeDays++;
      const unknown = [...recs.keys()].filter(id => !knownIds.has(id))
        .map((id, n) => ({ id, name: 'Archived item ' + id, uom: '', number: catalog.length + n + 1 }));
      const items = catalog.concat(unknown);
      let counted = 0, verified = 0, matched = 0, mismatched = 0, pending = 0;
      const dateDetails = [];
      items.forEach(item => {
        const row = recs.get(item.id) || {};
        const a = asQuantity(row.actual);
        const s = asQuantity(row.system);
        if (a !== null) counted++;
        let diff = '', status = 'Not counted';
        if (a !== null && s !== null) {
          verified++;
          diff = Math.round((a - s) * 10000) / 10000;
          if (diff === 0) { matched++; status = 'MATCH'; }
          else { mismatched++; status = 'DO NOT MATCH'; }
        } else if (a !== null) { pending++; status = 'Pending verification'; }
        else if (s !== null) status = 'Awaiting physical count';
        dateDetails.push([date, item.number, item.id, item.name, item.uom,
          a === null ? '' : a, s === null ? '' : s, diff, row.remarks || '', status]);
      });
      countedTotal += counted;
      mismatchesTotal += mismatched;
      add([date, items.length, counted, verified, matched, mismatched, pending,
        items.length - counted, items.length ? Number((counted * 100 / items.length).toFixed(1)) : 0]);
      if (kind === 'daily' || recs.size) details.push(...dateDetails);
    });
    add([]);
    add(['ITEM DETAILS']);
    add(['Date', 'No', 'Item ID', 'Item Name', 'UOM', 'Actual', 'System',
      'Difference', 'Remarks', 'Status']);
    details.forEach(add);
    if (!details.length) add(['No stock records were saved during this period.']);
    const filename = 'CGV-StockTake-' + kind + '-' + expected.start +
      (expected.start === expected.end ? '' : '-to-' + expected.end) + '.csv';
    return {
      filename,
      csv: '\uFEFF' + lines.join('\r\n') + '\r\n',
      start: expected.start,
      end: expected.end,
      days: dates.length,
      activeDays,
      counted: countedTotal,
      variances: mismatchesTotal
    };
  }
  function download(report) {
    if (typeof document === 'undefined' || typeof URL === 'undefined') throw Error('Browser download is unavailable.');
    const blob = new Blob([report.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = report.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  const api = { periodRange, makeReport, download, csvCell };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StockTakeReports = api;
})(typeof window !== 'undefined' ? window : null);
