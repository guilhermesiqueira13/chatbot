
function formatMessage(level, messages) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${messages.join(' ')}`;
}

function log(level, ...messages) {
  const formatted = formatMessage(level, messages.map(m => (typeof m === 'string' ? m : JSON.stringify(m))));
  console.log(formatted);
}

module.exports = {
  info: (...messages) => log('INFO', ...messages),
  warn: (...messages) => log('WARN', ...messages),
  error: (...messages) => log('ERROR', ...messages),
};

