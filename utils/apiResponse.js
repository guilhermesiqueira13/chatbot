function createResponse(success, data = null, message = null) {
  return { success, data, message };
}

module.exports = { createResponse };
