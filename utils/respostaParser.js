const DEFAULT_ERROR_MSG = "Desculpe, não entendi. Por favor, responda com o nome do dia, a data (ex: 20/06) ou digite 'Ver mais dias' para mais opções.";
const { DateTime } = require('./luxonShim');
const TIME_ZONE = 'America/Sao_Paulo';

function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseOrdinal(text) {
  if (!text) return NaN;
  const norm = removeAccents(String(text).trim().toLowerCase());
  const numMatch = norm.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  const map = {
    primeiro: 1,
    primeira: 1,
    segundo: 2,
    segunda: 2,
    terceiro: 3,
    terceira: 3,
    quarto: 4,
    quarta: 4,
    quinto: 5,
    quinta: 5,
    sexto: 6,
    sexta: 6,
    setimo: 7,
    setima: 7,
    oitavo: 8,
    oitava: 8,
    nono: 9,
    nona: 9,
    decimo: 10,
    decima: 10,
  };
  const first = norm.split(/\s+/)[0];
  return map[first] || NaN;
}

const { DateTime } = require('./luxonShim');
const TIME_ZONE = 'America/Sao_Paulo';

function parseEscolhaDia(input) {
  if (!input || typeof input !== 'string') {
    return { type: 'invalid', error: DEFAULT_ERROR_MSG };
  }
  const text = input.trim().toLowerCase();
  const normText = removeAccents(text);
  const numMatch = normText.match(/^\d+$/);
  if (numMatch) {
    const idx = parseInt(numMatch[0], 10);
    if (idx > 0) return { type: 'index', value: idx - 1 };
  }
  if (text === 'ver mais dias') {
    return { type: 'verMais' };
  }

  if (text === 'hoje') {
    const hoje = DateTime.now().setZone(TIME_ZONE).toISODate();
    return { type: 'date', value: hoje };
  }

  if (/^amanh[ãa]$/.test(normText)) {
    const amanha = DateTime.now().setZone(TIME_ZONE).plus({ days: 1 }).toISODate();
    return { type: 'date', value: amanha };
  }

  const proxMatch = normText.match(/^proxim[oa]?\s+(\w+)/);
  if (proxMatch) {
    const palavra = proxMatch[1];
    const dias = [
      'domingo',
      'segunda',
      'terça',
      'quarta',
      'quinta',
      'sexta',
      'sábado',
    ];
    for (let i = 0; i < dias.length; i++) {
      if (removeAccents(dias[i]).startsWith(removeAccents(palavra))) {
        return { type: 'weekday', value: i, next: true };
      }
    }
  }

  const dataMatch = normText.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (dataMatch) {
    let [, d, m, a] = dataMatch;
    const year = a || String(DateTime.now().setZone(TIME_ZONE).year);
    d = d.padStart(2, '0');
    m = m.padStart(2, '0');
    return { type: 'date', value: `${year}-${m}-${d}` };
  }

  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const normalized = normText.replace(/[-]/g, ' ').replace(/\s+feira$/, '');
  for (let i = 0; i < dias.length; i++) {
    const diaNorm = removeAccents(dias[i]);
    const inputNorm = removeAccents(normalized);
    if (inputNorm === diaNorm || diaNorm.startsWith(inputNorm) || inputNorm.startsWith(diaNorm)) {
      return { type: 'weekday', value: i };
    }
  }

  return { type: 'invalid', error: DEFAULT_ERROR_MSG };
}

const { formatarDataHorarioBr } = require('./dataHelpers');

function parseEscolhaAgendamento(input, agendamentos) {
  if (!input || !Array.isArray(agendamentos)) return null;
  const texto = removeAccents(String(input).trim().toLowerCase());

  let numero = parseInt(texto, 10);

  if (isNaN(numero)) {
    const ordinals = {
      primeira: 1,
      primeiro: 1,
      segunda: 2,
      segundo: 2,
      terceira: 3,
      terceiro: 3,
      quarta: 4,
      quarto: 4,
      quinta: 5,
      quinto: 5,
      sexta: 6,
      sexto: 6,
      setima: 7,
      setimo: 7,
      oitava: 8,
      oitavo: 8,
      nona: 9,
      nono: 9,
      decima: 10,
      decimo: 10,
    };

    const match = Object.keys(ordinals).find((w) => texto.includes(w));
    if (match) numero = ordinals[match];
  }

  if (!isNaN(numero)) return agendamentos[numero - 1] || null;

  const ord = parseOrdinal(texto);
  if (!isNaN(ord)) return agendamentos[ord - 1] || null;

  return (
    agendamentos.find((a) => {
      const desc = removeAccents(
        `${a.servico} ${formatarDataHorarioBr(a.horario)}`.toLowerCase(),
      );
      const descEm = removeAccents(
        `${a.servico} em ${formatarDataHorarioBr(a.horario)}`.toLowerCase(),
      );
      return texto === desc || texto === descEm;
    }) || null
  );
}

module.exports = {
  parseEscolhaDia,
  DEFAULT_ERROR_MSG,
  removeAccents,
  parseOrdinal,
  parseEscolhaAgendamento,
};
