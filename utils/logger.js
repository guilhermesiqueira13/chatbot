const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

function format(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

function write(line) {
  fs.appendFileSync(path.join(logsDir, 'servidor.log'), line + '\n');
}

function baseLog(level, message) {
  const line = format(level, message);
  if (process.env.NODE_ENV !== 'production') {
    console.log(line);
  }
  write(line);
}

function user(id, msg) {
  baseLog('USER', `${id}: ${msg}`);
}

function bot(id, msg) {
  baseLog('BOT', `Resposta enviada: ${msg}`);
}

function dialogflow(intent, params) {
  const paramsStr = JSON.stringify(params);
  baseLog('DIALOGFLOW', `Intent detectada: ${intent} | Parâmetros: ${paramsStr}`);
}

function error(userId, err) {
  const desc = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? ` | ${err.stack}` : '';
  const idPart = userId ? `${userId} - ` : '';
  baseLog('ERROR', `${idPart}${desc}${stack}`);
}

function info(...msgs) {
  baseLog('INFO', msgs.join(' '));
}

function db(action, details) {
  let detailStr;
  try {
    detailStr = typeof details === 'string' ? details : JSON.stringify(details);
  } catch (e) {
    detailStr = String(details);
  }
  baseLog('DB', `${action} | ${detailStr}`);
}

module.exports = { user, bot, dialogflow, error, info, db };
