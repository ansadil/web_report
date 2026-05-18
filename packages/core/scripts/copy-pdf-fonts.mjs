import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src', 'exporters', 'fonts');
const destDir = join(root, 'dist', 'exporters', 'fonts');

mkdirSync(destDir, { recursive: true });
for (const name of readdirSync(srcDir)) {
  if (!name.endsWith('.ttf')) continue;
  copyFileSync(join(srcDir, name), join(destDir, name));
}
