import { describe, expect, it } from 'vitest';
import { renderCommandHelp, renderRootHelp } from './cli.js';

describe('help rendering', () => {
  it('prints copy-pasteable root usage without hidden attend command', () => {
    const help = renderRootHelp();
    expect(help).toContain('usage: daou-gw-cli <command>');
    expect(help).not.toContain('attend');
  });

  it('shows attend command when enabled', () => {
    const help = renderRootHelp(true);
    expect(help).toContain('attend      check/in/out attendance');
  });

  it('shows attend usage when command help is requested', () => {
    const help = renderCommandHelp('attend');
    expect(help).toContain('usage: daou-gw-cli attend <status|in|out>');
    expect(help).toContain('status [--json]');
    expect(help).toContain('in     [--json]');
    expect(help).toContain('out    [--json]');
  });
});
