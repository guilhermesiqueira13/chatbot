const allowedAgents = [/Twilio/i, /Dialogflow/i];
const { createResponse } = require("../utils/apiResponse");

module.exports = function originValidator(req, res, next) {
  const userAgent = req.get("user-agent") || "";
  if (allowedAgents.some((pattern) => pattern.test(userAgent))) {
    return next();
  }
  return res
    .status(403)
    .json(createResponse(false, null, "Origem nao autorizada"));
};
