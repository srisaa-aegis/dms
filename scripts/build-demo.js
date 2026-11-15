// Builds the demo: compiles demo/main.ts + the library (src/) with the Angular builder, then bundles the
// result into ONE classic script, demo/dms.js (+ dms.css, media/). Open demo/index.html afterwards;
// it works straight from disk (file://), no web server needed.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const built = path.join(root, 'dist-demo', 'browser');
const demo = path.join(root, 'demo');

fs.rmSync(path.join(root, 'dist-demo'), { recursive: true, force: true });
execSync('npx ng build', { cwd: root, stdio: 'inherit' });

esbuild.buildSync({
  stdin: { contents: "import './polyfills.js';\nimport './main.js';\n", resolveDir: built, loader: 'js' },
  bundle: true,
  format: 'iife',
  minify: true,
  ignoreAnnotations: true, // the package.json sideEffects:false flag must not drop the built app's side-effect imports
  target: 'es2022',
  outfile: path.join(demo, 'dms.js'),
  logLevel: 'warning',
});
fs.copyFileSync(path.join(built, 'styles.css'), path.join(demo, 'dms.css'));
fs.rmSync(path.join(demo, 'media'), { recursive: true, force: true });
if (fs.existsSync(path.join(built, 'media'))) fs.cpSync(path.join(built, 'media'), path.join(demo, 'media'), { recursive: true });

console.log('demo/dms.js built - open demo/index.html');
