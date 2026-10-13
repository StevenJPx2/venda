import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { RELOAD_CLIENT, reloadHub } from './try-reload.mjs';

test('reload events retain the latest version for reconnecting clients', () => {
  const hub = reloadHub('test');
  const lines = [];
  const response = new EventEmitter();

  response.writeHead = (_status, headers) => {
    assert.equal(headers['content-type'], 'text/event-stream');
    assert.equal(
      headers['access-control-allow-origin'],
      'http://127.0.0.1:8805'
    );
  };

  response.write = text => lines.push(text);
  response.end = () => response.emit('close');

  hub.changed();
  hub.events({ headers: { origin: 'http://127.0.0.1:8805' } }, response);
  hub.changed();
  hub.changed();
  assert.deepEqual(lines, [
    'data: test:1\n\n',
    'data: test:2\n\n',
    'data: test:3\n\n'
  ]);
  hub.close();
  hub.changed();
  assert.equal(lines.length, 3);
});

test('reloads untouched pages, but asks before discarding entered text', () => {
  let source;
  let reloads = 0;
  let allowed = false;
  const listeners = new Map();
  const buttons = [];

  runInNewContext(RELOAD_CLIENT, {
    EventSource: class {
      constructor(url) {
        assert.equal(url, 'http://localhost:8794/__try/events');
        source = this;
      }
    },
    document: {
      addEventListener: (name, handler) => listeners.set(name, handler),
      createElement: () => ({ style: {} }),
      body: { append: element => buttons.push(element) }
    },
    location: {
      reload: () => {
        reloads++;
      }
    },
    confirm: () => allowed
  });

  source.onmessage({ data: '1' });
  source.onmessage({ data: '1' });
  assert.equal(reloads, 0);
  source.onmessage({ data: '2' });
  assert.equal(reloads, 1);
  listeners.get('input')();
  source.onmessage({ data: '3' });
  source.onmessage({ data: '4' });
  assert.equal(reloads, 1);
  assert.equal(buttons.length, 1);
  buttons[0].onclick();
  assert.equal(reloads, 1);
  allowed = true;
  buttons[0].onclick();
  assert.equal(reloads, 2);
});
