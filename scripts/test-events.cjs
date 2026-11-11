// Event schedule checks. No browser needed: node scripts/test-events.cjs
// Validates the <script id="events"> list in index.html and the start/end logic in app.js.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// 1. The schedule in index.html is valid.
const match = read('index.html').match(/<script type="application\/json" id="events">([\s\S]*?)<\/script>/);
assert(match, 'index.html has <script type="application/json" id="events">');
let events;
try { events = JSON.parse(match[1]); } catch (e) { assert.fail(`Event schedule is not valid JSON: ${e.message}`); }
assert(Array.isArray(events), 'Event schedule is a list');

const make = () => ({innerHTML:'',textContent:'',value:'',hidden:false,style:{},dataset:{},classList:{contains:()=>false,toggle:()=>false},querySelectorAll:()=>[],setAttribute(){},insertAdjacentHTML(){},focus(){},setSelectionRange(){}});
const elements = new Map();
const document = {querySelector(s) { if (!elements.has(s)) elements.set(s, make()); return elements.get(s); }};
const ctx = vm.createContext({document, location:{search:'', hash:'#/', hostname:'clash.test'}, localStorage:{getItem:()=>null, setItem(){}}, URLSearchParams, console, Date, window:{addEventListener(){}, scrollTo(){}}, fetch: async () => ({ok:false})});
vm.runInContext(read('app.js').replace(/render\(\);\s*$/, ''), ctx);
const time = (value, end) => vm.runInContext(`eventTime(${JSON.stringify(value)}, ${end})`, ctx);
const active = (list, now) => vm.runInContext(`activeEvents(${JSON.stringify(list)}, ${now}).map((e) => e.name)`, ctx).join(',');

for (const e of events) {
  const label = `Event "${e.name}"`;
  assert(typeof e.name === 'string' && e.name.trim(), 'Every event has a name');
  for (const key of ['start', 'end']) assert(Number.isFinite(time(e[key], key === 'end')), `${label}: ${key} "${e[key]}" must be YYYY-MM-DD or an ISO date-time`);
  assert(time(e.end, true) >= time(e.start, false), `${label}: end is before start`);
  assert(typeof e.banner === 'string' && e.banner.trim(), `${label}: needs banner text`);
  assert(e.banner.length <= 160, `${label}: banner text is long (${e.banner.length} chars); keep it to about two lines on a phone`);
  assert(!/[<>]|&\w+;/.test(e.banner), `${label}: banner is plain text, not HTML (write & and –, not &amp; or &#8211;)`);
  for (const key of ['costMultiplier', 'timeMultiplier']) {
    if (key in e) assert(typeof e[key] === 'number' && e[key] > 0 && e[key] <= 1, `${label}: ${key} must be a number above 0 and at most 1 (0.5 = 50% off)`);
  }
  const unknown = Object.keys(e).filter((k) => !['name', 'start', 'end', 'banner', 'costMultiplier', 'timeMultiplier'].includes(k));
  assert.deepEqual(unknown, [], `${label}: unknown field(s) ${unknown}`);
}

// 2. Start and end are inclusive, in the visitor's local day for date-only values.
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const jam = {name: 'Jam', start: '2026-11-01', end: '2026-11-15', banner: 'x', costMultiplier: 0.5, timeMultiplier: 0.5};
assert.equal(active([jam], at(2026, 10, 31, 23, 59)), '', 'Not shown before the start day');
assert.equal(active([jam], at(2026, 11, 1, 0, 0)), 'Jam', 'Shown from the start of the start day');
assert.equal(active([jam], at(2026, 11, 15, 23, 59)), 'Jam', 'Shown through the end day');
assert.equal(active([jam], at(2026, 11, 16, 0, 0)), '', 'Gone the day after it ends');
const exact = {...jam, end: '2026-11-15T08:00:00Z'};
assert.equal(active([exact], Date.parse('2026-11-15T07:59:00Z')), 'Jam', 'Exact end time: still shown just before');
assert.equal(active([exact], Date.parse('2026-11-15T08:01:00Z')), '', 'Exact end time: gone just after');
assert.equal(active([{...jam, end: 'soon'}], at(2026, 11, 5)), '', 'Bad dates never show');
assert.equal(active([jam, {...jam, name: 'Later', start: '2026-12-01', end: '2026-12-07'}], at(2026, 12, 3)), 'Later', 'Scheduled events start on their own');

// 3. The "To max" note follows the running event's discount.
const note = (event) => vm.runInContext(`discountNote(1000000, 1440, "Elixir", ${JSON.stringify(event)})`, ctx);
assert.equal(note(null), "Normal values. Gold Pass and other boosts aren't included.");
assert.equal(note(jam), "Normal values. With Jam's 50% off it would be about 500K Elixir and 12h. Gold Pass and other boosts aren't included.");
assert.equal(note({name: 'Sale', costMultiplier: 0.7}), "Normal values. With Sale's discount it would be about 700K Elixir. Gold Pass and other boosts aren't included.");

const now = Date.now();
const running = events.filter((e) => time(e.start, false) <= now && now <= time(e.end, true)).map((e) => e.name);
const upcoming = events.filter((e) => time(e.start, false) > now).map((e) => e.name);
const ended = events.filter((e) => time(e.end, true) < now).map((e) => e.name);
console.log(`Event schedule OK: ${events.length} event(s). Running now: ${running.join(', ') || 'none'}. Upcoming: ${upcoming.join(', ') || 'none'}. Ended: ${ended.join(', ') || 'none'}.`);
