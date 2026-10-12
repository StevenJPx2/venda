import { expect, it } from 'vitest';
import { collectionField } from '../src/content/fields';

it('gives each field its label, help and the rules its input enforces', () => {
  expect(
    collectionField('title', {
      type: 'text',
      label: 'Title',
      required: true,
      max: 80
    })
  ).toMatchObject({
    key: 'title',
    label: 'Title',
    help: null,
    required: true,
    min: null,
    max: 80
  });
  expect(
    collectionField('rating', {
      type: 'number',
      min: 1,
      max: 5,
      help: '1 to 5'
    })
  ).toMatchObject({ min: 1, max: 5, help: '1 to 5', required: false });
  expect(
    collectionField('tone', { type: 'select', options: ['calm', 'loud'] })
  ).toMatchObject({ options: ['calm', 'loud'], min: null, max: null });
  expect(collectionField('on', { type: 'boolean' })).toMatchObject({
    options: null,
    min: null,
    max: null,
    label: null
  });
});
