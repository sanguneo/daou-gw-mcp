import { promises as fs } from 'node:fs';
import path from 'node:path';

const files = ['dist/index.js', 'dist/mcp.js'];
const shebang = '#!/usr/bin/env node\n';

for (const file of files) {
  const p = path.resolve(file);
  const text = await fs.readFile(p, 'utf8');
  if (!text.startsWith(shebang)) {
    await fs.writeFile(p, shebang + text, 'utf8');
  }
}
