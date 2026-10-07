// Runs the real planner (planner/src, TypeScript via Node's type stripping) on data/demo/munich.json:
// prints both days and checks that the prepared plan is clean while the planned demo moves produce the
// expected sourced conflicts. Usage: node data/scripts/plan-check.mjs
// Requires Node >= 22.18 / 23.6 (built-in TypeScript type stripping).

import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// Resolve extensionless relative imports inside planner/ and shared/ to .ts files.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[cm]?[jt]s$/.test(spec)) {
      try { return await next(spec + '.ts', ctx); } catch {}
    }
    return next(spec, ctx);
  }`));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const planner = await import(pathToFileURL(join(ROOT, 'planner', 'src', 'index.ts')).href);
const bundle = JSON.parse(readFileSync(join(ROOT, 'data', 'demo', 'munich.json'), 'utf8'));
const { scheduleDay, checkPlacement, dayOrder } = planner;

const byKey = Object.fromEntries(bundle.cards.map((c) => [c.metadata.key, c]));
const titleOf = (id) => bundle.cards.find((c) => c.id === id)?.title ?? id;
const SAT = '2027-10-02';
const SUN = '2027-10-03';

function print(day) {
  const s = scheduleDay(bundle, day);
  console.log(`\n=== ${day} ===`);
  for (const it of s.items) {
    const tb = it.travel_before ? ` (walk ${it.travel_before.min_minutes}–${it.travel_before.max_minutes})` : '';
    console.log(`${it.start}–${it.end}  ${titleOf(it.card_id)}${tb}`);
    for (const x of it.issues) console.log(`      [${x.severity}] ${x.code}: ${x.message}`);
  }
  return s;
}

const sat = print(SAT);
const sun = print(SUN);

// 1. Prepared plan: no blockers. Expected needs_checking: unconfirmed hotel booking, luggage storage,
//    Viktualienmarkt hours conflict, holiday hours on 3 Oct for venues without documented special hours.
const blockers = [...sat.issues, ...sun.issues].filter((x) => x.severity === 'blocker');
assert.deepEqual(blockers, [], 'prepared plan must have no blockers');
const codes = (s, key) => s.issues.filter((x) => x.card_id === byKey[key].id).map((x) => x.code);
assert.ok(codes(sat, 'checkin').includes('unconfirmed_booking'));
assert.ok(codes(sat, 'vm').includes('conflicting_facts'));
assert.ok(codes(sun, 'checkout').includes('unconfirmed_booking'));
assert.ok(!codes(sun, 'ap').includes('holiday_hours_unconfirmed'), 'AP has documented 3 Oct hours');
assert.ok(!codes(sun, 'wiesn').includes('holiday_hours_unconfirmed'), 'Wiesn has documented 3 Oct hours');

// 2. Demo moves.
const show = (label, issues) => {
  console.log(`\n--- ${label}`);
  for (const x of issues) console.log(`  [${x.severity}] ${x.code} on ${titleOf(x.card_id)}: ${x.message}`);
  return issues;
};
const indexOf = (day, key) => dayOrder(bundle, day).filter((id) => id !== byKey[key].id);

// A: Residenz after the hotel check-in (later in the afternoon) -> visit ends after closing at 18:00.
{
  const base = indexOf(SAT, 'res');
  const pos = base.indexOf(byKey.checkin.id) + 1;
  const issues = show('A: Residenz moved after hotel check-in', checkPlacement(bundle, byKey.res.id, SAT, pos));
  assert.ok(issues.some((x) => x.card_id === byKey.res.id && ['outside_opening_hours', 'after_last_entry'].includes(x.code)));
}
// B: Residenz after dinner -> after last entry / closed.
{
  const base = indexOf(SAT, 'res');
  const issues = show('B: Residenz moved after dinner', checkPlacement(bundle, byKey.res.id, SAT, base.length));
  assert.ok(issues.some((x) => x.card_id === byKey.res.id && x.severity === 'blocker'));
}
// C: Frauenkirche before the Glockenspiel -> can't reach the 11:00 show.
{
  const base = indexOf(SAT, 'frauen');
  const pos = base.indexOf(byKey.glock.id);
  const issues = show('C: Frauenkirche moved before the Glockenspiel', checkPlacement(bundle, byKey.frauen.id, SAT, pos));
  assert.ok(issues.some((x) => x.code === 'fixed_overlap'));
}
// D: Viktualienmarkt after the Residenz -> stalls close at 15:00 on Saturdays.
{
  const base = indexOf(SAT, 'vm');
  const pos = base.indexOf(byKey.res.id) + 1;
  const issues = show('D: Viktualienmarkt moved after the Residenz', checkPlacement(bundle, byKey.vm.id, SAT, pos));
  assert.ok(issues.some((x) => x.card_id === byKey.vm.id && x.code === 'outside_opening_hours'));
}
// E: Viktualienmarkt onto Sunday 3 Oct -> documented holiday closure.
{
  const base = dayOrder(bundle, SUN);
  const pos = base.indexOf(byKey.ap.id);
  const issues = show('E: Viktualienmarkt moved to Sunday 3 Oct', checkPlacement(bundle, byKey.vm.id, SUN, pos));
  assert.ok(issues.some((x) => x.card_id === byKey.vm.id && x.code === 'closed'));
}
// F: Frauenkirche tower on Sunday morning before the Wiesn -> opens 11:30 on Sundays/holidays,
//    pushes the day so the 12:00 Böllerschießen becomes unreachable.
{
  const base = dayOrder(bundle, SUN);
  const pos = base.indexOf(byKey.wiesn.id);
  const issues = show('F: Frauenkirche moved to Sunday morning', checkPlacement(bundle, byKey.frauen.id, SUN, pos));
  assert.ok(issues.some((x) => x.code === 'fixed_overlap'));
}
// G: Deutsches Museum from the drawer into Saturday after the Residenz -> after last admission 16:30.
{
  const base = dayOrder(bundle, SAT);
  const pos = base.indexOf(byKey.res.id) + 1;
  const issues = show('G: Deutsches Museum dropped after the Residenz', checkPlacement(bundle, byKey.dm.id, SAT, pos));
  assert.ok(issues.some((x) => x.card_id === byKey.dm.id && x.severity === 'blocker'));
}
// H: Schumann's after dinner on Saturday -> sources disagree / Saturday hours unknown.
{
  const base = dayOrder(bundle, SAT);
  const issues = show("H: Schumann's after dinner (Saturday)", checkPlacement(bundle, byKey.sch.id, SAT, base.length));
  assert.ok(issues.some((x) => x.card_id === byKey.sch.id && ['unknown_hours', 'conflicting_facts'].includes(x.code)));
}

// I: Deutsches Museum onto Sunday 3 Oct (instead of the Alte Pinakothek) -> holiday hours not published.
{
  const base = dayOrder(bundle, SUN);
  const pos = base.indexOf(byKey.ap.id);
  const issues = show('I: Deutsches Museum dropped on Sunday 3 Oct', checkPlacement(bundle, byKey.dm.id, SUN, pos));
  assert.ok(issues.some((x) => x.card_id === byKey.dm.id && x.code === 'holiday_hours_unconfirmed'));
}

console.log('\nplan-check ok');
