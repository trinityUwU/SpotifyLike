require('dotenv').config();

const { createApp } = require('../src/app');
const config = require('../src/config');

const app = createApp({ config });

if (!app || typeof app.listen !== 'function') {
  process.exitCode = 1;
} else {
  process.stdout.write('backend-smoke-ok\n');
}
