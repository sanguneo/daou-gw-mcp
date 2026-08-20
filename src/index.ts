#!/usr/bin/env node
import { runCli } from './surfaces/cli.js';

async function main(): Promise<void> {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

void main();
