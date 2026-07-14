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

  it('shows mail send usage when mail help is requested', () => {
    const help = renderCommandHelp('mail');
    expect(help).toContain('usage: daou-gw-cli mail <list|search|delete|send>');
    expect(help).toContain('send   --to <email[,email...]> --subject <text>');
  });

  it('shows board usage when command help is requested', () => {
    const help = renderCommandHelp('board');
    expect(help).toContain('usage: daou-gw-cli board <create|update>');
    expect(help).toContain('create    --board-id <id> --subject <text> --content <html>');
    expect(help).toContain('update    --board-id <id> --post-id <id> --subject <text> --content <html>');
  });
});
