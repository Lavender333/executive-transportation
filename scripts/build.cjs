const fs = require('node:fs');
const esbuild = require('esbuild');
(async () => {
  await esbuild.build({ entryPoints: ['src/dashboard.js', 'src/booking.js'], outdir: 'public', bundle: true, minify: true, target: 'es2022' });
  fs.mkdirSync('_site/public', { recursive: true });
  for (const name of ['index.html', 'dashboard.html']) fs.copyFileSync(name, '_site/' + name);
  for (const name of ['dashboard.css', 'dashboard.js', 'booking.js', 'backend-config.js']) fs.copyFileSync('public/' + name, '_site/public/' + name);
})();
