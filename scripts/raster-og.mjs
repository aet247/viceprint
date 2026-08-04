import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'public', 'og-image.svg');
const pngPath = path.join(root, 'public', 'og-image.png');

let svg = readFileSync(svgPath, 'utf8');

const fonts = [
  ['Unbounded', 'unbounded-latin-700-normal.woff2'],
  ['Unbounded', 'unbounded-latin-800-normal.woff2'],
  ['Manrope', 'manrope-latin-400-normal.woff2'],
];
const fontFaces = [];
for (const [family, file] of fonts) {
  const pkg = family.toLowerCase();
  const fontPath = path.join(root, 'node_modules', '@fontsource', pkg, 'files', file);
  try {
    const b64 = readFileSync(fontPath).toString('base64');
    fontFaces.push(`@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2');}`);
  } catch {
    console.log(`font not found, skipping: ${family}/${file}`);
  }
}
if (fontFaces.length > 0) {
  svg = svg.replace('</defs>', `<style>${fontFaces.join('')}</style></defs>`);
}

await sharp(Buffer.from(svg)).resize(1200, 630, { fit: 'fill' }).png().toFile(pngPath);
console.log(`wrote ${pngPath}`);
