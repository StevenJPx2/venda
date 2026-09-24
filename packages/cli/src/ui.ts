import * as p from '@clack/prompts';

export { p };

export class UsageError extends Error {
  override name = 'UsageError';
}

/** Unwraps a clack prompt result, exiting cleanly on Ctrl+C. */
export function answer<T>(value: T | typeof p.CANCEL_SYMBOL): T {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    return process.exit(130);
  }
  return value as T;
}

/**
 * Uses a flag if given; otherwise prompts, unless --no-prompt is set, in which
 * case a missing required value is a usage error instead of a hang.
 */
export async function textOption(opts: {
  flag: string | undefined;
  flagName: string;
  noPrompt: boolean;
  message: string;
  initialValue?: string;
  placeholder?: string;
  optional?: boolean;
  validate?: (value: string) => string | undefined;
}): Promise<string> {
  if (opts.flag !== undefined) {
    const problem = opts.flag === '' && opts.optional ? undefined : opts.validate?.(opts.flag);
    if (problem) throw new UsageError(`--${opts.flagName}: ${problem}`);
    return opts.flag;
  }
  if (opts.noPrompt) {
    if (opts.optional) return '';
    if (opts.initialValue !== undefined && !opts.validate?.(opts.initialValue)) return opts.initialValue;
    throw new UsageError(`--${opts.flagName} is required with --no-prompt.`);
  }

  return answer(await p.text({
    message: opts.message,
    ...(opts.initialValue !== undefined ? { initialValue: opts.initialValue } : {}),
    ...(opts.placeholder !== undefined ? { placeholder: opts.placeholder } : {}),
    validate: value => {
      const text = value ?? '';
      if (opts.optional && !text) return undefined;
      return opts.validate?.(text);
    }
  })).trim();
}

export async function confirmOption(opts: { flag: boolean | undefined; noPrompt: boolean; message: string; initialValue: boolean }): Promise<boolean> {
  if (opts.flag !== undefined) return opts.flag;
  if (opts.noPrompt) return opts.initialValue;
  return answer(await p.confirm({ message: opts.message, initialValue: opts.initialValue }));
}

/** Runs a step under a spinner, surfacing sub-step messages as it goes. */
export async function step<T>(title: string, work: (update: (message: string) => void) => Promise<T>, done?: (result: T) => string): Promise<T> {
  const spinner = p.spinner();
  spinner.start(title);
  try {
    const result = await work(message => spinner.message(message));
    spinner.stop(done ? done(result) : title);
    return result;
  } catch (error) {
    spinner.error(`${title} — failed`);
    throw error;
  }
}
