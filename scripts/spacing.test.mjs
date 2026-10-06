// Formatting contracts: Prettier owns layout, ESLint the blank-line rhythm.
// These checks run the actual Prettier options and shared Vue ESLint config.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';

const filePath = resolve('apps/admin/app/components/SpacingProbe.vue');
const config = resolve('apps/admin/eslint.config.mjs');

const format = async source =>
  prettier.format(source, {
    ...(await prettier.resolveConfig(filePath)),
    filepath: filePath
  });

// What `pnpm lint:fix` does to a file: Prettier, ESLint's fixes, then Prettier
// again, because a blank line ESLint adds can let Prettier unwrap a tag.
async function fix(source) {
  const formatted = await format(source);
  const eslint = new ESLint({ overrideConfigFile: config, fix: true });
  const [result] = await eslint.lintText(formatted, { filePath });

  return format(result?.output ?? formatted);
}

const problems = async source =>
  (
    await new ESLint({ overrideConfigFile: config }).lintText(source, {
      filePath
    })
  )[0]?.messages ?? [];

test('sibling sections gain a blank line, and Prettier keeps it', async () => {
  const fixed = await fix(
    '<template>\n  <main>\n    <section>\n      <h1>Title</h1>\n    </section>\n    <form>\n      <Field />\n    </form>\n  </main>\n</template>\n'
  );

  assert(fixed.includes('</section>\n\n    <form>'));
  assert.equal(await format(fixed), fixed);
  assert.equal((await problems(fixed)).length, 0);
});

// Each sample once broke a single Prettier-then-ESLint pass: a wrapped attribute
// list, and an inline span Prettier hugs across lines beside an icon.
const wrapping = [
  '<template>\n  <main>\n    <UInput v-model="search" type="search" aria-label="Search entries" placeholder="Search entries" />\n    <UButton label="Search" />\n  </main>\n</template>\n',
  '<template>\n  <NuxtLink :to="back.to" class="back-link">\n    <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" /><span :class="{ invisible: back.pending }">{{ back.label }}</span>\n  </NuxtLink>\n</template>\n'
];

for (const [index, source] of wrapping.entries()) {
  test(`the fix pipeline settles when Prettier wraps a tag (sample ${index + 1})`, async () => {
    const fixed = await fix(source);

    assert.equal(await format(fixed), fixed);
    assert.equal((await problems(fixed)).length, 0);
  });
}

test('consecutive declarations remain a paragraph', async () => {
  const messages = await problems(
    '<script setup>\nconst first = 1;\nconst second = 2;\n</script>\n\n<template>\n  <p>{{ first + second }}</p>\n</template>\n'
  );

  assert.equal(
    messages.filter(message => message.ruleId?.includes('padding')).length,
    0
  );
});
