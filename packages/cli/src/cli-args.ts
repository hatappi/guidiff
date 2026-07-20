import { parseArgs } from 'node:util';

export interface CliOptions {
  positionals: string[];
  guidePath?: string;
  port: number;
  timeoutMin?: number;
  open: boolean;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      guide: { type: 'string' },
      port: { type: 'string' },
      timeout: { type: 'string' },
      'no-open': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    throw new HelpRequested();
  }
  return {
    positionals,
    ...(values.guide ? { guidePath: values.guide } : {}),
    port: values.port ? Number(values.port) : 0,
    ...(values.timeout ? { timeoutMin: Number(values.timeout) } : {}),
    open: !values['no-open'],
  };
}

export class HelpRequested extends Error {}

export const USAGE = `Usage: guidiff [target] [compare-with] [options]

Examples:
  guidiff                     Review uncommitted changes (working tree vs HEAD)
  guidiff .                   Same as above
  guidiff main feature        Review diff between two refs
  guidiff main..HEAD          Range syntax also works

Options:
  --guide <file>    Guide JSON to display alongside the diff
  --port <n>        Fixed port (default: auto-pick a free port)
  --timeout <min>   Give up waiting for Submit after N minutes (default: wait forever)
  --no-open         Do not open the browser automatically
  -h, --help        Show this help
`;
