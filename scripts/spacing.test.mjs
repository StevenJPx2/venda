// Formatting contracts: DOM paragraphs, a permitted gap after the prop block,
// and grouped variables. These checks run the actual shared Vue ESLint config.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';

const lint = new ESLint({ overrideConfigFile: resolve('apps/admin/eslint.config.mjs') });

const check = async source => (await lint.lintText(source, { filePath: resolve('apps/admin/app/components/SpacingProbe.vue') }))[0]?.messages ?? [];

test('DOM paragraphs and a gap after props are accepted', async () => {
  const messages = await check(`<template>
  <Panel
    title="Content"
  >

    <section>
      <h1>Writing</h1>
    </section>

    <Rows />
  </Panel>
</template>\n`);

  assert.equal(messages.filter(message => message.ruleId?.includes('newline') || message.ruleId?.includes('padding')).length, 0);
});

test('unseparated sibling sections and compressed custom-component content are fixed', async () => {
  const source = '<template>\n  <main>\n    <section>\n      <h1>Title</h1>\n    </section>\n    <form><Field /></form>\n  </main>\n</template>\n';
  const messages = await check(source);

  assert(messages.some(message => message.ruleId === 'vue/padding-line-between-tags'));
  assert(messages.some(message => message.ruleId === 'vue/singleline-html-element-content-newline'));

  const fix = new ESLint({ overrideConfigFile: resolve('apps/admin/eslint.config.mjs'), fix: true });
  const [result] = await fix.lintText(source, { filePath: resolve('apps/admin/app/components/SpacingProbe.vue') });

  assert(result?.output?.includes('</section>\n\n    <form>'));
  assert(result?.output?.includes('<form>\n      <Field />\n    </form>'));
});

test('consecutive declarations remain a paragraph', async () => {
  const messages = await check('<script setup>\nconst first = 1;\nconst second = 2;\n</script>\n\n<template>\n  <p>{{ first + second }}</p>\n</template>\n');

  assert.equal(messages.filter(message => message.ruleId?.includes('padding')).length, 0);
});
