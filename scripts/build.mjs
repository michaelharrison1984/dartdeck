import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = process.argv[2];
if (!['web','mobile'].includes(target)) {
  console.error('Usage: node scripts/build.mjs <web|mobile>');
  process.exit(1);
}
const src = path.join(root, 'src');
const out = path.join(root, 'dist', target);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['app.js','styles.css','store.js','index.html','manifest.webmanifest','service-worker.js']) {
  await cp(path.join(src, file), path.join(out, file));
}
await cp(path.join(src, 'icons'), path.join(out, 'icons'), { recursive: true });
const native = target === 'mobile';
await writeFile(path.join(out,'platform.js'), `window.DARTDECK_NATIVE=${native};\nwindow.DARTDECK_PLATFORM='${native?'android':'web'}';\n`, 'utf8');

// Native builds do not register the service worker, but retaining the manifest/assets keeps
// the shared index identical and makes the output easy to inspect in a normal browser.
console.log(`Built DartDeck 0.9.0 for ${target}: ${out}`);
