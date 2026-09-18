import type { Runtime } from "./types";

export type Scenario = {
  id: string;
  title: string;
  /** One line explaining what the snippet is there to prove. */
  blurb: string;
  code: string;
};

/**
 * The presets. Each one exists to settle a specific argument, and the comments
 * inside the code are part of the lesson — they stay in the editor where the
 * reader is already looking.
 */
export const SCENARIOS: Record<Runtime, Scenario[]> = {
  node: [
    {
      id: "ordering",
      title: "The whole ordering, at once",
      blurb: "Sync first, then nextTick, then microtasks, then the loop's phases.",
      code: `console.log('1 — synchronous');

setTimeout(() => console.log('2 — timers phase'), 0);
setImmediate(() => console.log('3 — check phase'));

process.nextTick(() => console.log('4 — nextTick queue'));
Promise.resolve().then(() => console.log('5 — microtask queue'));

console.log('6 — still synchronous');

// Step through and watch the call stack drain completely
// before a single queued callback is allowed to run.
//
// One honest caveat: at the top level of a script, real Node's
// ordering of 2 and 3 depends on how long the process took to
// start, so it genuinely varies run to run. Inside an I/O
// callback it is fixed — see the "I/O latency" preset.`,
    },
    {
      id: "nexttick-vs-micro",
      title: "nextTick vs microtask",
      blurb: "The folklore says nextTick is checked between every microtask. It isn't.",
      code: `process.nextTick(() => console.log('tick 1'));
process.nextTick(() => console.log('tick 2'));

Promise.resolve().then(() => {
  console.log('micro 1');
  // Queued from inside a microtask. Does it jump ahead of 'micro 2'?
  process.nextTick(() => console.log('tick from micro'));
});

Promise.resolve().then(() => console.log('micro 2'));

// Node drains the WHOLE nextTick queue, then hands V8 the WHOLE
// microtask queue, and only then comes back for new nextTicks.
// So 'tick from micro' runs last, not second.`,
    },
    {
      id: "io-latency",
      title: "I/O latency and the poll phase",
      blurb: "A slow read does not block anything — its callback just lands later.",
      code: `console.log('start');

// latency is a playground extra: it sets how long the fake disk takes.
fs.readFile('data.txt', { latency: 80 }, (err, data) => {
  console.log('read finished:', data);

  // Queued from *inside* an I/O callback. Here the ordering is no
  // longer ambiguous: check always comes after poll in the same turn.
  setImmediate(() => console.log('immediate, from inside I/O'));
  setTimeout(() => console.log('timeout, from inside I/O'), 0);
});

setTimeout(() => console.log('timer at 20ms'), 20);
setTimeout(() => console.log('timer at 120ms'), 120);

console.log('end — the read has not even started arriving yet');`,
    },
    {
      id: "await-stack",
      title: "await takes frames off the stack",
      blurb: "Watch the call stack empty at the await and refill when it resumes.",
      code: `async function fetchUser(id) {
  console.log('fetchUser start');
  const raw = await fs.promises.readFile('users.json', { latency: 40 });
  console.log('fetchUser resumed');
  return JSON.parse(raw)[id];
}

async function main() {
  console.log('main start');
  const user = await fetchUser(0);
  console.log('got', user.name);
}

main();

// main() returns a *pending promise* immediately. Everything below
// this line runs while both functions are suspended.
console.log('bottom of the script');`,
    },
    {
      id: "starvation",
      title: "Starving the event loop",
      blurb: "nextTick can postpone every timer indefinitely. That is a real outage.",
      code: `setTimeout(() => console.log('I am a timer, waiting my turn'), 0);

let n = 0;
function greedy() {
  n++;
  console.log('nextTick', n);
  // Re-queueing onto the same queue that is currently draining.
  if (n < 6) process.nextTick(greedy);
}

process.nextTick(greedy);

console.log('script done');

// The timer cannot run until the nextTick queue is completely empty.
// Change 6 to 100000 in real Node and the timer never fires at all.`,
    },
  ],

  browser: [
    {
      id: "sync-micro-macro",
      title: "Sync, microtask, task",
      blurb: "Three tiers of priority, and the call stack must be empty for any of them.",
      code: `console.log('1 — synchronous');

setTimeout(() => console.log('2 — task queue'), 0);

Promise.resolve().then(() => console.log('3 — microtask queue'));
queueMicrotask(() => console.log('4 — also a microtask'));

console.log('5 — still synchronous');

// Microtasks drain COMPLETELY after the stack empties.
// Only then does the loop take one task from the task queue.`,
    },
    {
      id: "let-vs-var",
      title: "let vs var in a loop",
      blurb: "The most-asked interview question, answered by watching the closures.",
      code: `for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log('var  ->', i), 0);
}

for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log('let  ->', j), 0);
}

// 'var' has ONE binding shared by all three callbacks, and by the
// time any of them runs the loop has finished: i is 3.
// 'let' gets a FRESH binding per iteration, so each closure keeps
// the value it actually saw.`,
    },
    {
      id: "await-is-then",
      title: "await is .then in disguise",
      blurb: "Every await costs exactly one microtask tick. Count them.",
      code: `async function go() {
  console.log('a1');
  await null;          // not a promise — still costs one tick
  console.log('a2');
  await null;
  console.log('a3');
}

console.log('s1');
go();
console.log('s2');

Promise.resolve()
  .then(() => console.log('p1'))
  .then(() => console.log('p2'));

console.log('s3');

// a2 lands between p-nothing and p1 because go() got its microtask
// in first. Each .then in a chain also costs one tick.`,
    },
    {
      id: "fetch-task",
      title: "A network response is a task",
      blurb: "The response arrives as a task; reading the body is another promise.",
      code: `console.log('sending request');

fetch('/api/profile', { latency: 150 })
  .then((res) => {
    console.log('headers arrived');
    return res.json();
  })
  .then((body) => console.log('body parsed:', body.url));

setTimeout(() => console.log('a 60ms timer fires first'), 60);

console.log('request sent — nothing is blocked');`,
    },
    {
      id: "parallel-vs-serial",
      title: "Promise.all vs awaiting in sequence",
      blurb: "Three 50ms requests: 150ms one after another, 50ms all at once.",
      code: `const get = (name, ms) =>
  new Promise((resolve) =>
    setTimeout(() => {
      console.log('  <-', name, 'at', Date.now() + 'ms');
      resolve(name);
    }, ms),
  );

async function serial() {
  console.log('serial: starting');
  await get('a', 50);
  await get('b', 50);
  await get('c', 50);
  console.log('serial: done at', Date.now() + 'ms');
}

async function parallel() {
  console.log('parallel: starting');
  await Promise.all([get('x', 50), get('y', 50), get('z', 50)]);
  console.log('parallel: done at', Date.now() + 'ms');
}

async function main() {
  await serial();
  await parallel();
}

main();

// Date.now() reports the playground's virtual clock, so the
// difference is exact rather than approximate.`,
    },
  ],
};

export function defaultScenario(runtime: Runtime): Scenario {
  return SCENARIOS[runtime][0];
}
