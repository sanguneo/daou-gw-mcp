import { describe, expect, it } from 'vitest';
import { operationJsonSchema } from '../core/registry.js';
import { OPERATIONS } from '../ops/index.js';

function schemaFor(tool: string): Record<string, any> {
  const op = OPERATIONS.find((candidate) => candidate.tool === tool);
  if (!op) throw new Error(`missing operation: ${tool}`);
  return operationJsonSchema(op);
}

describe('operation registry', () => {
  it('keeps tool names, ids and cli paths unique', () => {
    const tools = OPERATIONS.map((op) => op.tool);
    const ids = OPERATIONS.map((op) => op.id);
    const paths = OPERATIONS.map((op) => op.cli.join(' '));
    expect(new Set(tools).size).toBe(tools.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('closes every generated schema against unknown arguments', () => {
    for (const op of OPERATIONS) {
      expect(operationJsonSchema(op).additionalProperties, op.tool).toBe(false);
    }
  });

  it('derives required arguments from the zod schema', () => {
    expect(schemaFor('login').required).toEqual(expect.arrayContaining(['username', 'password']));
    expect(schemaFor('mail_search').required).toEqual(['query']);
    expect(schemaFor('approval_leave_count').required).toEqual([]);
    expect(schemaFor('approval_leave_count').properties.form_id.default).toBeUndefined();
    expect(schemaFor('approval_leave_count').properties.dept_id.default).toBeUndefined();
    expect(schemaFor('board_post_create').required).toEqual(
      expect.arrayContaining(['board_id', 'subject', 'content']),
    );
  });

  it('carries either/or constraints that zod cannot express', () => {
    const del = schemaFor('mail_delete');
    expect(del.anyOf).toEqual([{ required: ['ids'] }, { required: ['id'] }]);
    expect(del.properties.folder).toBeTruthy();

    const send = schemaFor('mail_send');
    expect(send.required).toEqual(expect.arrayContaining(['to', 'subject']));
    expect(send.anyOf).toEqual([{ required: ['content'] }, { required: ['image_path'] }]);
  });

  it('publishes defaults and drops safe-integer noise', () => {
    const list = schemaFor('mail_list');
    expect(list.properties.page).toMatchObject({ type: 'integer', default: 1, minimum: 1 });
    expect(list.properties.page.maximum).toBeUndefined();
    expect(list.properties.size).toMatchObject({ default: 20 });
  });

  it('describes every argument so clients can render help', () => {
    for (const op of OPERATIONS) {
      const properties = (operationJsonSchema(op).properties ?? {}) as Record<string, { description?: string }>;
      for (const [key, prop] of Object.entries(properties)) {
        expect(prop.description, `${op.tool}.${key}`).toBeTruthy();
      }
    }
  });
});
