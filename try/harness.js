// The try pages' check runner: one card per check, run against the server
// (Cloudflare Workers on local workerd), showing pass or fail and every request
// and response.
export const RUNTIMES = { workers: 'Workers' };

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calls a runtime through the try proxy (`runtime` null for the page server
 * itself). `as` picks whose cookie jar the proxy uses; `origin` plays a
 * request from another site; `bearer` sends an API token.
 */
export async function call(
  runtime,
  method,
  path,
  { body, as, origin, bearer } = {}
) {
  // Content reads are cacheable for a minute; the page wants every change at once.
  const init = { method, headers: {}, cache: 'no-store' };

  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);

    if (typeof body !== 'string')
      init.headers['content-type'] = 'application/json';
  }

  if (as) init.headers['x-try-as'] = as;
  if (origin) init.headers['x-try-origin'] = origin;
  if (bearer) init.headers.authorization = `Bearer ${bearer}`;

  const response = await fetch(runtime ? `/${runtime}${path}` : path, init);
  const text = await response.text();
  let data = text;

  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }

  const who = as ? ` (as ${as})` : bearer ? ' (with a token)' : '';

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    data,
    line: `${method} ${path}${who} → ${response.status}`
  };
}

/** Polls until `test` passes on a read. */
export async function until(read, test, seconds = 6) {
  let last;

  for (
    const deadline = Date.now() + seconds * 1000;
    Date.now() < deadline;
    await sleep(250)
  ) {
    last = await read();

    if (test(last)) return last;
  }

  return last;
}

function render(check) {
  const card = document.createElement('section');
  const runtimes =
    check.only === 'page'
      ? ['page']
      : check.only
        ? [check.only]
        : Object.keys(RUNTIMES);
  const panes = check.only === 'page' ? { page: 'Result' } : RUNTIMES;

  card.className = 'check';
  card.innerHTML = `
    <div class="check-head">
      <div><h2>${check.title}</h2><p>${check.description}</p></div>
      <div class="actions">${check.only === 'page' ? '<button data-on="page">Run</button>' : runtimes.map(key => `<button data-on="${key}">Run on ${RUNTIMES[key]}</button>`).join('')}${runtimes.length > 1 ? '<button data-on="both">Both</button>' : ''}</div>
    </div>
    <div class="extra" ${check.extra ? '' : 'hidden'}>${check.extra ?? ''}</div>
    <div class="runs ${check.only === 'page' ? 'single' : ''}">${Object.entries(
      panes
    )
      .map(
        ([key, label]) => `
      <div class="run" data-runtime="${key}">
        <div class="run-label">${label} <span class="verdict ${runtimes.includes(key) ? '' : 'skip'}">${runtimes.includes(key) ? '' : 'Not on this runtime'}</span></div>
        <div class="note">${runtimes.includes(key) ? 'Not run yet.' : 'See the description.'}</div>
        <pre hidden></pre>
      </div>`
      )
      .join('')}
    </div>`;
  document.getElementById('checks').append(card);

  for (const button of card.querySelectorAll('[data-on]')) {
    button.addEventListener('click', () => {
      const targets =
        button.dataset.on === 'both' ? runtimes : [button.dataset.on];

      targets.forEach(runtime => execute(check, card, runtime));
    });
  }

  check.setup?.(card);

  return { card, runtimes };
}

async function execute(check, card, runtime) {
  const pane = card.querySelector(`[data-runtime="${runtime}"]`);
  const verdict = pane.querySelector('.verdict');
  const noteEl = pane.querySelector('.note');
  const pre = pane.querySelector('pre');
  const lines = [];

  pre.hidden = false;
  pre.textContent = '';
  verdict.className = 'verdict wait';
  verdict.textContent = 'Running…';
  noteEl.textContent = '';

  const tools = {
    card,
    log(line, data) {
      lines.push(
        data === undefined
          ? line
          : `${line}\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`
      );
      pre.textContent = lines.join('\n\n');
    },
    note(text) {
      noteEl.textContent = text;
    }
  };

  try {
    const result = await check.run(runtime, tools);

    verdict.className = `verdict ${result.pass ? 'pass' : 'fail'}`;
    verdict.textContent = result.pass ? '✓ Pass' : '✕ Fail';
    noteEl.textContent = result.note ?? '';
  } catch (error) {
    verdict.className = 'verdict fail';
    verdict.textContent = '✕ Error';
    noteEl.textContent = String(error.message ?? error);
  }
}

/** Renders the checks and wires the "run every check" button; checks run top to bottom. */
export function mount(checks) {
  const cards = checks.map(check => [check, render(check)]);
  const runAll = document.getElementById('run-all');

  runAll.addEventListener('click', async () => {
    runAll.disabled = true;

    for (const [check, { card, runtimes }] of cards)
      await Promise.all(runtimes.map(runtime => execute(check, card, runtime)));

    runAll.disabled = false;
  });
}
