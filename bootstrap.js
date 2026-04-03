// When loaded via Electron, start the desktop app
// When loaded via require('openrune'), export the Node.js API
try {
  require('electron')
  require('./dist/main.js')
} catch {
  module.exports = require('./lib/index.js')
}
