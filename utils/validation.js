// Utility validation functions for controller inputs

/**
 * Validate Brazilian phone number. Accepts digits with optional leading '+'.
 * @param {string} telefone
 * @returns {boolean}
 */
function isValidTelefone(telefone) {
  if (typeof telefone !== "string") return false;
  // Remove caracteres opcionais como espacos, hifens e parenteses
  const normalized = telefone.replace(/[\s()-]/g, "");
  // Deve comecar com +55 seguido de 2 digitos de DDD e 9 digitos do numero
  return /^\+55\d{11}$/.test(normalized);
}

/**
 * Validate that name is a non-empty string
 * @param {string} nome
 * @returns {boolean}
 */
function isValidNome(nome) {
  if (typeof nome !== "string") return false;
  const trimmed = nome.trim();
  return (
    trimmed.length >= 3 && /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/.test(trimmed)
  );
}

/**
 * Validate that service is a non-empty string
 * @param {string} servico
 * @returns {boolean}
 */
const SERVICOS_VALIDOS = ["Corte", "Barba", "Corte + Barba"];
function isValidServico(servico) {
  if (typeof servico !== "string") return false;
  const normalized = servico.trim().toLowerCase();
  return SERVICOS_VALIDOS.some((s) => s.toLowerCase() === normalized);
}

/**
 * Validate date/time string in ISO format
 * @param {string} dataHora
 * @returns {boolean}
 */
function isValidFutureDate(dataStr, horaStr) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) return false;
  if (!/^\d{2}:\d{2}$/.test(horaStr)) return false;
  const [dia, mes, ano] = dataStr.split("/");
  const [h, m] = horaStr.split(":");
  const dt = new Date(`${ano}-${mes}-${dia}T${h}:${m}:00`);
  return !isNaN(dt.getTime()) && dt > new Date();
}

function isValidDataHora(dataHora) {
  if (typeof dataHora === "string") {
    if (/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}$/.test(dataHora)) {
      const [data, hora] = dataHora.split(" ");
      return isValidFutureDate(data, hora);
    }
    const date = new Date(dataHora);
    return !isNaN(date.getTime()) && date > new Date();
  }

  if (
    dataHora &&
    typeof dataHora === "object" &&
    typeof dataHora.data === "string" &&
    typeof dataHora.hora === "string"
  ) {
    return isValidFutureDate(dataHora.data, dataHora.hora);
  }

  return false;
}

function isDentroHorarioAtendimento(dataHora) {
  const date = new Date(dataHora);
  if (isNaN(date.getTime())) return false;
  const h = date.getHours();
  return h >= 9 && h < 18;
}

module.exports = {
  isValidTelefone,
  isValidNome,
  isValidServico,
  isValidDataHora,
  isDentroHorarioAtendimento,
};
