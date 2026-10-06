import type { RichTextDoc } from '@venda/richtext';
import { Result } from 'effect';
import { describe, expect, it } from 'vitest';
import { docToMarkdown, markdownToDoc } from '../src';

function read(source: string): RichTextDoc {
  const result = markdownToDoc(source);

  if (Result.isFailure(result))
    throw new Error(`could not read: ${result.failure.message}`);

  return result.success;
}

/** Markdown in, then out and back in: the document and the output are both stable. */
function roundTrip(source: string) {
  const doc = read(source);
  const written = docToMarkdown(doc);

  expect(read(written)).toEqual(doc);
  expect(docToMarkdown(read(written))).toBe(written);

  return { doc, written };
}

const EVERYTHING = `# Grace and truth

A paragraph with **bold**, _italic_, ~~struck~~, \`code\`, a [link](https://example.com "Example"),
H<sub>2</sub>O and x<sup>2</sup>, and an <u>underline</u>. Soft
breaks become spaces.\\
A hard break, then **bold _and italic_** text.

![A hill](/media/hill.jpg "Morning")

> Quoted, with a [reference][ref].

- one
- two
  - nested

3. three
4. four

- [x] done
- [ ] todo

\`\`\`ts
const answer = 42;
\`\`\`

---

| Name | Count |
| :--- | ----: |
| Ann  | 3     |

A note.[^1]

<Callout tone="warn" open count={3} meta={{ "a": [1, 2] }}>
  Watch **out**.
</Callout>

<Video src="/media/clip.mp4" />

Inline <Badge color="blue">new</Badge> tag.

[^1]: The footnote.

[ref]: https://example.com/ref
`;

describe('markdownToDoc and docToMarkdown: round trip', () => {
  it('round-trips every construct', () => {
    const { doc, written } = roundTrip(EVERYTHING);
    const types = doc.content.map(node => node.type);

    expect(written).toMatchInlineSnapshot(`
      "# Grace and truth

      A paragraph with **bold**, _italic_, ~~struck~~, \`code\`, a [link](https://example.com "Example"), H<sub>2</sub>O and x<sup>2</sup>, and an <u>underline</u>. Soft breaks become spaces.\\
      A hard break, then **bold _and italic_** text.

      ![A hill](/media/hill.jpg "Morning")

      > Quoted, with a [reference](https://example.com/ref).

      - one
      - two
        - nested

      3. three
      4. four

      - [x] done
      - [ ] todo

      \`\`\`ts
      const answer = 42;
      \`\`\`

      ---

      | Name | Count |
      | :--- | ----: |
      | Ann  |     3 |

      A note.[^1]

      <Callout tone="warn" open count={3} meta={{"a":[1,2]}}>
        Watch **out**.
      </Callout>

      <Video src="/media/clip.mp4" />

      Inline <Badge color="blue">new</Badge> tag.

      [^1]: The footnote.
      "
    `);

    expect(types).toEqual([
      'heading',
      'paragraph',
      'image',
      'blockquote',
      'bulletList',
      'orderedList',
      'taskList',
      'codeBlock',
      'horizontalRule',
      'table',
      'paragraph',
      'block',
      'block',
      'paragraph',
      'footnoteDefinition'
    ]);
  });
});

describe('markdownToDoc and docToMarkdown: reading constructs', () => {
  it('reads marks, including sup and sub tags', () => {
    const [, paragraph] = read(EVERYTHING).content;
    const marked = (paragraph?.content ?? [])
      .filter(node => node.marks?.length)
      .map(node => [node.text, node.marks?.map(mark => mark.type).join('+')]);

    expect(marked).toEqual(
      expect.arrayContaining([
        ['bold', 'bold'],
        ['italic', 'italic'],
        ['struck', 'strike'],
        ['code', 'code'],
        ['link', 'link'],
        ['2', 'subscript'],
        ['2', 'superscript'],
        ['underline', 'underline'],
        ['and italic', 'bold+italic']
      ])
    );
    expect(paragraph?.content?.some(node => node.type === 'hardBreak')).toBe(
      true
    );
    expect(
      paragraph?.content?.some(node => node.text?.includes('Soft breaks'))
    ).toBe(true);
  });

  it('reads block tags with their attributes as data', () => {
    const blocks = read(EVERYTHING).content.filter(
      node => node.type === 'block'
    );

    expect(blocks[0]?.attrs).toEqual({
      name: 'Callout',
      props: { tone: 'warn', open: true, count: 3, meta: { a: [1, 2] } }
    });
    expect(blocks[0]?.content?.[0]?.type).toBe('paragraph');
    expect(blocks[1]).toEqual({
      type: 'block',
      attrs: { name: 'Video', props: { src: '/media/clip.mp4' } }
    });
  });

  it('resolves reference links and keeps lists, tasks and tables', () => {
    const doc = read(EVERYTHING);
    const find = (type: string) => doc.content.find(node => node.type === type);

    expect(JSON.stringify(find('blockquote'))).toContain(
      'https://example.com/ref'
    );
    expect(find('orderedList')?.attrs).toEqual({ start: 3 });
    expect(find('taskList')?.content?.map(item => item.attrs?.checked)).toEqual(
      [true, false]
    );
    expect(find('table')?.attrs).toEqual({ align: ['left', 'right'] });
    expect(find('table')?.content?.[0]?.content?.[0]?.type).toBe('tableHeader');
  });
});

describe('edge cases', () => {
  it('drops a trailing line break, which Markdown cannot spell', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Yours,' }, { type: 'hardBreak' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Ann', marks: [{ type: 'bold' }] }]
        }
      ]
    };

    expect(docToMarkdown(doc)).toBe('Yours,\n\n**Ann**\n');
  });

  it.each([
    ['nested marks', 'Some **bold _both_ and** plain _italic **both**_.\n'],
    ['adjacent marks', '**a**_b_ and `x` **`y`**\n'],
    [
      'escapes',
      'Stars \\* and \\_ underscores, \\<not a tag>, and {braces}.\n'
    ],
    ['a linked image', '[![Alt](/a.png)](https://example.com)\n'],
    ['empty document', '']
  ])('round-trips %s', (_name, source) => {
    roundTrip(source);
  });

  it.each([
    [
      'an expression attribute',
      '<Chart data={load()} />',
      /CallExpression is not plain data/,
      1
    ],
    ['a spread attribute', 'Text\n\n<Chart {...props} />', /cannot spread/, 3],
    ['a fragment', '<>hi</>', /Fragments/, 1],
    [
      'an unclosed tag',
      'Hello\n\n<Callout>\n\nNo end',
      /Callout|closing/i,
      undefined
    ]
  ])('rejects %s', (_name, source, message, line) => {
    const result = markdownToDoc(source);

    expect(Result.isFailure(result)).toBe(true);

    if (Result.isSuccess(result)) return;

    expect(result.failure.message).toMatch(message);

    if (line !== undefined) expect(result.failure.line).toBe(line);
  });
});
