/** Why a command stopped: a stable tag for scripts, and what to do next for people. */
export class CliFailure extends Error {
  constructor(
    readonly tag: string,
    message: string,
    readonly path: string | null = null
  ) {
    super(message);
  }
}
