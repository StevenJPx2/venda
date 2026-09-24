import { describe, expect, it } from 'vitest';
import { domainProblem, emailProblem, nameProblem, parseProject, resourceNames, suggestName } from '../src/project.js';

describe('project validation', () => {
  it('validates install names, email addresses and hostnames', () => {
    expect(nameProblem('my-venda')).toBeUndefined();
    expect(nameProblem('Venda')).toBeDefined();
    expect(emailProblem('admin@example.com')).toBeUndefined();
    expect(emailProblem('not-an-email')).toBeDefined();
    expect(domainProblem('cms.example.com')).toBeUndefined();
    expect(domainProblem('https://cms.example.com')).toBeDefined();
  });

  it('suggests a legal install name and derives resource names', () => {
    expect(suggestName('My CMS!')).toBe('my-cms');
    expect(suggestName('x')).toBe('venda');
    expect(resourceNames('my-cms')).toEqual({ d1: 'my-cms-content', kv: 'my-cms-cache', r2: 'my-cms-media' });
  });

  it('parses a project config and rejects incomplete resources', () => {
    expect(parseProject({ name: 'my-cms', accountId: 'account', adminEmail: 'admin@example.com' })).toEqual({
      name: 'my-cms', accountId: 'account', adminEmail: 'admin@example.com'
    });
    expect(() => parseProject({ name: 'my-cms', accountId: 'account', adminEmail: 'admin@example.com', resources: { d1: { name: 'db' } } })).toThrow(/resources.*incomplete/i);
  });
});
