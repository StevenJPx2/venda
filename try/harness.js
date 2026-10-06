// The try pages' check runner: one card per check, showing pass or fail and
// every request and response it made.
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calls the Venda server (paths under `/api/` and `/admin/`, through the try
 * proxy) or the try page server itself (anything else). `as` picks whose cookie jar the
 * proxy uses; `origin` plays a request from another site; `bearer` sends an
 * API token.
 */
export async function call(method, path, { body, as, origin, bearer } = {}) {
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

  const response = await fetch(path, init);
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

  card.className = 'check';
  card.innerHTML = `
    <div class="check-head">
      <div><h2>${check.title}</h2><p>${check.description}</p></div>
      <div class="actions"><button data-act="run">Run</button></div>
    </div>
    <div class="extra" ${check.extra ? '' : 'hidden'}>${check.extra ?? ''}</div>
    <div class="run">
      <div class="run-label">Result <span class="verdict"></span></div>
      <div class="note">Not run yet.</div>
      <pre hidden></pre>
    </div>`;
  document.getElementById('checks').append(card);
  card
    .querySelector('[data-act="run"]')
    .addEventListener('click', () => execute(check, card));
  check.setup?.(card);

  return card;
}

async function execute(check, card) {
  const verdict = card.querySelector('.verdict');
  const noteEl = card.querySelector('.run .note');
  const pre = card.querySelector('.run pre');
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
    const result = await check.run(tools);

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

    for (const [check, card] of cards) await execute(check, card);

    runAll.disabled = false;
  });
}
