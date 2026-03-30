try {
  const e = require('electron')
  console.log('process.type:', process.type)
  console.log('typeof app:', typeof e.app)
} catch(err) {
  console.log('ERROR:', err.message)
}
process.exit(0)
