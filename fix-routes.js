const fs = require('fs');
const path = require('path');

const routesConfig = {
  version: 1,
  include: ["/api/*"],
  exclude: ["/*"]
};

const distPath = path.join(__dirname, 'dist');
const routesFilePath = path.join(distPath, '_routes.json');

// distフォルダが存在するか確認
if (!fs.existsSync(distPath)) {
  console.error('❌ dist/ folder not found');
  process.exit(1);
}

// _routes.jsonを書き込み
fs.writeFileSync(routesFilePath, JSON.stringify(routesConfig, null, 0));
console.log('✓ _routes.json configured for static file serving');
