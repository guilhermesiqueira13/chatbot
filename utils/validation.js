// Utility validation functions for controller inputs

/**
 * Validate Brazilian phone number. Accepts digits with optional leading '+'.
 * @param {string} telefone
 * @returns {boolean}
 */
function isValidTelefone(telefone) {
  if (typeof telefone !== 'string') return false;
  // remove spaces and symbols
  const digits = telefone.replace(/\D/g, '');
  // typically 10 to 13 digits including country code
  return /^\d{10,13}$/.test(digits);
}

/**
 * Validate that name is a non-empty string
 * @param {string} nome
 * @returns {boolean}
 */
function isValidNome(nome) {
  return typeof nome === 'string' && nome.trim().length > 0;
}

/**
 * Validate that service is a non-empty string
 * @param {string} servico
 * @returns {boolean}
 */
function isValidServico(servico) {
  return typeof servico === 'string' && servico.trim().length > 0;
}

/**
 * Validate date/time string in ISO format
 * @param {string} dataHora
 * @returns {boolean}
 */
function isValidDataHora(dataHora) {
  if (typeof dataHora !== 'string') return false;
  const date = new Date(dataHora);
  return !isNaN(date.getTime());
}

module.exports = {
  isValidTelefone,
  isValidNome,
  isValidServico,
  isValidDataHora,
};
