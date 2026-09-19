/**
 * Ordering tests for the playground interpreter.
 *
 * The whole point of the page is that the ordering it shows is the ordering a
 * real runtime produces. Every case marked `verifiedAgainstNode` was run in
 * real Node and its output pasted in here unchanged, so a regression in the
 * queue logic fails loudly instead of quietly teaching people the wrong thing.
 *
 * Run with `npm run test:engine`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { buildTrace } from "./interpreter";
import { SAMPLES } from "./samples";
import type { Runtime } from "./types";

function outputOf(code: string, runtime: Runtime): string[] {
  const trace = buildTrace(code, runtime);
  assert.equal(trace.error, null, `unexpected error: ${trace.error}`);
  return trace.logs.map((entry) => entry.text);
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

test("node: sync, then nextTick, then microtasks, then the phases", () => {
  assert.deepEqual(
    outputOf(
      `console.log('1 sync');
       setTimeout(() => console.log('2 timeout'), 0);
       setImmediate(() => console.log('3 immediate'));
       process.nextTick(() => console.log('4 nextTick'));
       Promise.resolve().then(() => console.log('5 promise'));
       console.log('6 sync end');`,
      "node",
    ),
    // 2 vs 3 is genuinely non-deterministic in real Node at the top level of a
    // script; this engine commits to check-before-timers and the UI says so.
    ["1 sync", "6 sync end", "4 nextTick", "5 promise", "3 immediate", "2 timeout"],
  );
});

test("node: the whole microtask queue drains before nextTick gets another turn", () => {
  // verifiedAgainstNode: v22
  assert.deepEqual(
    outputOf(
      `Promise.resolve().then(() => {
         console.log('micro 1');
         process.nextTick(() => console.log('tick from micro'));
       });
       process.nextTick(() => console.log('tick 1'));
       Promise.resolve().then(() => console.log('micro 2'));
       process.nextTick(() => console.log('tick 2'));`,
      "node",
    ),
    ["tick 1", "tick 2", "micro 1", "micro 2", "tick from micro"],
  );
});

test("node: nested async functions resume in microtask order", () => {
  // verifiedAgainstNode: v22
  assert.deepEqual(
    outputOf(
      `async function outer() {
         console.log('outer start');
         const v = await inner();
         console.log('outer got', v);
       }
       async function inner() {
         console.log('inner start');
         await null;
         console.log('inner resumed');
         return 42;
       }
       outer();
       Promise.resolve().then(() => console.log('p1'));
       Promise.resolve().then(() => console.log('p2'));
       console.log('sync end');`,
      "node",
    ),
    ["outer start", "inner start", "sync end", "inner resumed", "p1", "p2", "outer got 42"],
  );
});

test("node: a rejected await is caught, and finally still runs", () => {
  // verifiedAgainstNode: v22
  assert.deepEqual(
    outputOf(
      `async function risky() { throw new Error('boom'); }
       async function main() {
         try { await risky(); }
         catch (err) { console.log('caught', err.message); }
         finally { console.log('cleanup'); }
       }
       main();
       console.log('after main()');`,
      "node",
    ),
    ["after main()", "caught boom", "cleanup"],
  );
});

test("node: an I/O callback runs in poll, and its setImmediate beats its setTimeout", () => {
  assert.deepEqual(
    outputOf(
      `console.log('start');
       fs.readFile('data.txt', { latency: 50 }, (err, data) => {
         console.log('file:', data);
         setImmediate(() => console.log('immediate inside io'));
         setTimeout(() => console.log('timeout inside io'), 0);
       });
       setTimeout(() => console.log('timer at 10ms'), 10);
       console.log('end');`,
      "node",
    ),
    [
      "start",
      "end",
      "timer at 10ms",
      "file: the quick brown fox",
      "immediate inside io",
      "timeout inside io",
    ],
  );
});

test("node: nextTick can starve a timer", () => {
  const output = outputOf(
    `setTimeout(() => console.log('timer'), 0);
     let n = 0;
     function greedy() { n++; console.log('tick', n); if (n < 4) process.nextTick(greedy); }
     process.nextTick(greedy);`,
    "node",
  );
  assert.deepEqual(output, ["tick 1", "tick 2", "tick 3", "tick 4", "timer"]);
});

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

test("browser: await interleaves with a promise chain one tick at a time", () => {
  // verifiedAgainstNode: v22 (identical semantics in a browser)
  assert.deepEqual(
    outputOf(
      `async function go() {
         console.log('a1');
         await null;
         console.log('a2');
         await null;
         console.log('a3');
       }
       console.log('s1');
       go();
       console.log('s2');
       Promise.resolve().then(() => console.log('p1')).then(() => console.log('p2'));
       console.log('s3');`,
      "browser",
    ),
    ["s1", "a1", "s2", "s3", "a2", "p1", "a3", "p2"],
  );
});

test("browser: let gets a binding per iteration, var does not", () => {
  // verifiedAgainstNode: v22
  assert.deepEqual(
    outputOf(
      `for (let i = 0; i < 3; i++) setTimeout(() => console.log('let', i), 0);
       for (var j = 0; j < 3; j++) setTimeout(() => console.log('var', j), 0);`,
      "browser",
    ),
    ["let 0", "let 1", "let 2", "var 3", "var 3", "var 3"],
  );
});

test("browser: Promise.all settles only once the slowest member has", () => {
  assert.deepEqual(
    outputOf(
      `const wait = (ms, label) =>
         new Promise((resolve) => setTimeout(() => { console.log('done', label); resolve(label); }, ms));
       Promise.all([wait(30, 'a'), wait(10, 'b'), wait(20, 'c')])
         .then((all) => console.log('all', all.join('+')));`,
      "browser",
    ),
    ["done b", "done c", "done a", "all a+b+c"],
  );
});

test("browser: setInterval repeats until cleared", () => {
  assert.deepEqual(
    outputOf(
      `let n = 0;
       const id = setInterval(() => {
         n++;
         console.log('tick', n);
         if (n === 3) clearInterval(id);
       }, 100);`,
      "browser",
    ),
    ["tick 1", "tick 2", "tick 3"],
  );
});

test("browser: fetch resolves as a task, then the body as a promise", () => {
  assert.deepEqual(
    outputOf(
      `console.log('requesting');
       fetch('/api/thing', { latency: 120 })
         .then((res) => res.json())
         .then((body) => console.log('got', body.url));
       setTimeout(() => console.log('timer 50ms'), 50);
       console.log('sent');`,
      "browser",
    ),
    ["requesting", "sent", "timer 50ms", "got /api/thing"],
  );
});

// ---------------------------------------------------------------------------
// Language surface and guard rails
// ---------------------------------------------------------------------------

test("destructuring, template literals and array methods behave", () => {
  assert.deepEqual(
    outputOf(
      `const users = [{ name: 'ada', age: 36 }, { name: 'grace', age: 45 }];
       const [{ name: first }, ...rest] = users;
       console.log(\`first=\${first} rest=\${rest.length}\`);
       console.log(users.map(({ name }) => name.toUpperCase()).join(', '));
       console.log('total', users.reduce((sum, u) => sum + u.age, 0));`,
      "node",
    ),
    ["first=ada rest=1", "ADA, GRACE", "total 81"],
  );
});

test("an infinite loop is stopped rather than hanging the page", () => {
  const trace = buildTrace("while (true) {}", "browser");
  assert.match(trace.error ?? "", /infinite loop/i);
});

test("a re-arming setImmediate is stopped rather than looping forever", () => {
  const trace = buildTrace("function again() { setImmediate(again); } again();", "node");
  assert.notEqual(trace.error, null);
});

test("unsupported syntax fails with a clear message instead of running wrong", () => {
  const trace = buildTrace("class Foo {}", "node");
  assert.match(trace.error ?? "", /class.*not supported/i);
});

test("a parse error reports its line", () => {
  const trace = buildTrace("const x = ;", "node");
  assert.match(trace.error ?? "", /^Line 1:/);
});

test("top-level await is refused with an actionable message", () => {
  const trace = buildTrace("await null;", "node");
  assert.match(trace.error ?? "", /Top-level await/i);
});

// ---------------------------------------------------------------------------
// The sample each editor opens with must run clean
// ---------------------------------------------------------------------------

for (const runtime of ["browser", "node"] as Runtime[]) {
  test(`sample runs clean: ${runtime}`, () => {
    const trace = buildTrace(SAMPLES[runtime], runtime);
    assert.equal(trace.error, null, `${runtime}: ${trace.error}`);
    assert.ok(trace.snapshots.length > 3, `${runtime} produced almost no steps`);
    assert.ok(trace.logs.length > 0, `${runtime} printed nothing`);
    assert.equal(trace.truncated, false, `${runtime} hit a budget limit`);
  });
}

test("browser sample: sync, then microtasks, then tasks", () => {
  assert.deepEqual(outputOf(SAMPLES.browser, "browser"), [
    "start",
    "end",
    "promise",
    "timeout",
    "fetched 200",
  ]);
});

test("node sample: sync, nextTick, microtasks, then the phases", () => {
  assert.deepEqual(outputOf(SAMPLES.node, "node"), [
    "start",
    "end",
    "nextTick",
    "promise",
    "immediate",
    "timeout",
    "file: the quick brown fox",
  ]);
});
