const allowedAgents = [/Twilio/i, /Dialogflow/i];

module.exports = function originValidator(req, res, next) {
  const userAgent = req.get('user-agent') || '';
  if (allowedAgents.some(pattern => pattern.test(userAgent))) {
    return next();
  }
  return res.status(403).json({ error: 'Origem nao autorizada' });
};
