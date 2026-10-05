// Fallow gate for the packages on the new architecture (tools/new-architecture.json).
// Runs Fallow's full dead-code, health and duplication analyses over the whole
// project and fails only on findings inside those packages, so legacy code
// awaiting its rewrite does not block, and new code gets no exemptions.
//
// Full analyses rather than `fallow audit`, which only judges what a branch
// changed against its base: new-architecture packages must be clean as a whole.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { packages } = JSON.parse(readFileSync(new URL('../tools/new-architecture.json', import.meta.url), 'utf8'));
const inScope = path => packages.some(dir => path === dir || path.startsWith(`${dir}/`));

function analyse(command) {
  try {
    return JSON.parse(execFileSync('npx', ['fallow', command, '--format', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    // Findings exit 1 but still print the report.
    if (error.stdout) return JSON.parse(error.stdout);

    throw error;
  }
}

// Every finding object that names a path (`path` or `file`), wherever it sits in the report.
function findings(node, section, out) {
  if (Array.isArray(node)) {
    for (const item of node) findings(item, section, out);
    return out;
  }

  if (node === null || typeof node !== 'object') return out;

  const path = node.path ?? node.file;

  if (typeof path === 'string' && inScope(path)) out.push({ section, path, line: node.line, what: node.export_name ?? node.package_name ?? node.name ?? node.kind ?? node.rule ?? '' });

  for (const [key, value] of Object.entries(node)) findings(value, section ?? key, out);

  return out;
}

// Only the finding lists: health's file scores, hotspots and targets are advisory
// statistics, and diagnostics and next steps are not findings. Warnings count.
const { workspace_diagnostics: _diagnostics, next_steps: _nextSteps, ...deadCode } = analyse('dead-code');
const reports = { dead_code: deadCode, health: analyse('health').findings, duplication: analyse('dupes').clone_groups };
const problems = findings(reports, undefined, []);

if (problems.length) {
  for (const { section, path, line, what } of problems) console.error(`${section}: ${path}${line ? `:${line}` : ''} ${what}`);
  console.error(`fallow: ${problems.length} finding(s) in ${packages.join(', ')}`);
  process.exit(1);
}

console.log(`fallow: no findings in ${packages.join(', ')}`);
