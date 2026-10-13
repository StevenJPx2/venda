// Types for scripts/github-simulator.mjs, for the server package's tests.
import type { KeyObject } from 'node:crypto';

export interface SimulatedCommit {
  readonly path: string;
  readonly sha: string;
  readonly message: string;
  readonly author: { readonly name: string; readonly email: string };
}

export interface GitHubSimulator {
  readonly url: string;
  readonly state: {
    head: string;
    truncate: boolean;
    tokensIssued: number;
    readonly commits: SimulatedCommit[];
    readonly requests: string[];
  };
  push(path: string, text: string | null, message?: string): void;
  fail(...statuses: number[]): void;
  failWrites(...statuses: number[]): void;
  file(path: string): string | undefined;
  stop(): Promise<void>;
}

export function simulateRepository(options: {
  folder: string;
  port?: number;
  authorEmail: string;
}): Promise<{
  github: GitHubSimulator;
  env: Readonly<Record<`VENDA_GITHUB_${string}`, string>>;
}>;

export function startGitHubSimulator(options: {
  port?: number;
  publicKey: string | KeyObject;
  clientId: string;
  installationId: number;
  name: string;
  repositoryId: number;
  branch?: string;
  dir?: string;
  files?: ReadonlyMap<string, string>;
  tokenTtlMs?: number;
}): Promise<GitHubSimulator>;
