const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const {name: slug, version} = require(path.join(root, 'package.json'));
const source = path.join(root, 'materials/source');
const output = path.join(root, 'materials', version);
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
module.exports = {root, slug, version, source, output, executablePath};
