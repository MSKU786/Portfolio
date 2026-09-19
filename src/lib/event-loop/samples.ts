import type { Runtime } from "./types";

/**
 * The code each editor opens with. Deliberately short: it only has to show
 * every queue doing something once, then get out of the way of the visitor's
 * own code.
 */
export const SAMPLES: Record<Runtime, string> = {
  browser: `console.log('start');

setTimeout(() => console.log('timeout'), 0);

Promise.resolve().then(() => console.log('promise'));

async function load() {
  // fetch accepts { latency } here to simulate the network
  const res = await fetch('/api/user', { latency: 100 });
  console.log('fetched', res.status);
}
load();

console.log('end');
`,

  node: `console.log('start');

setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));

process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise'));

// fs.readFile accepts { latency } here to simulate the disk
fs.readFile('data.txt', { latency: 40 }, (err, data) => {
  console.log('file:', data);
});

console.log('end');
`,
};
