const twilio = require('twilio');
const logger = require('../utils/logger');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886

if (!accountSid || !authToken || !from) {
  logger.error(null, new Error('Twilio credentials or from number not configured'));
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

async function sendWhatsApp(to, body) {
  if (!client) {
    throw new Error('Twilio client not initialized');
  }
  const params = { from, to, body }; 
  logger.info('Enviando mensagem via Twilio', JSON.stringify(params));
  try {
    const message = await client.messages.create(params);
    logger.info('Twilio resposta', message.sid, message.status);
    return message;
  } catch (err) {
    logger.error(null, err);
    throw err;
  }
}

async function waitForDelivery(messageSid, timeoutMs = 15000) {
  if (!client) throw new Error('Twilio client not initialized');
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const msg = await client.messages(messageSid).fetch();
    if (msg.status === 'delivered' || msg.status === 'failed' || msg.status === 'undelivered') {
      logger.info('Status final', messageSid, msg.status);
      return msg.status;
    }
    await new Promise(res => setTimeout(res, 2000));
  }
  logger.info('Timeout aguardando status de entrega', messageSid);
  return null;
}

module.exports = { sendWhatsApp, waitForDelivery };
