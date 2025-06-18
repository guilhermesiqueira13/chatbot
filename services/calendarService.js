require("dotenv").config();
const { google } = require("googleapis");
const path = require("path");
const { DateTime } = require("../utils/luxonShim");

// ID fixo do calendário utilizado pelo bot
const CALENDAR_ID =
  "99435b27c68a7a48eca3aa3ab9770b8d0207851464d88c89e55c763bfca69c0a@group.calendar.google.com";
const TIME_ZONE = "America/Sao_Paulo";

// Configura autenticação usando a conta de serviço
const keyFile =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, "..", "barbearia-calendar.json");

const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({ version: "v3", auth });

/**
 * Lista horários disponíveis das 09h às 18h em intervalos de 30min
 * consultando os eventos do calendário.
 * @param {string} data Formato YYYY-MM-DD
 * @returns {Promise<string[]>} horários disponíveis no formato HH:mm
 */
async function listarHorariosDisponiveis(data) {
  const [ano, mes, dia] = data.split("-");
  const inicioDia = DateTime.fromObject({ year: +ano, month: +mes, day: +dia }, { zone: TIME_ZONE }).startOf('day');
  const fimDia = inicioDia.endOf('day');

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: inicioDia.toISO(),
    timeMax: fimDia.toISO(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const eventos = res.data.items || [];
  const horariosOcupados = eventos.map((e) => {
    const dt = e.start.dateTime || e.start.date;
    return DateTime.fromISO(dt, { zone: TIME_ZONE }).toFormat("HH:mm");
  });

  const disponiveis = [];
  let t = inicioDia.set({ hour: 9, minute: 0 });
  const limite = inicioDia.set({ hour: 18, minute: 0 });
  while (t < limite) {
    const horario = t.toFormat("HH:mm");
    if (!horariosOcupados.includes(horario)) {
      disponiveis.push(horario);
    }
    t = t.plus({ minutes: 30 });
  }

  // Remove quaisquer horários que caiam em domingo
  const filtrados = disponiveis.filter((h) => {
    const dt = DateTime.fromISO(`${ano}-${mes}-${dia}T${h}:00`, { zone: TIME_ZONE });
    return dt.weekday !== 7;
  });

  return filtrados;
}

/**
 * Cria um evento de agendamento no Google Calendar
 * @param {{cliente: string, servicos: string[], horario: string}} dados
 * @returns {Promise<object>} Dados do evento criado
 */
async function criarAgendamento({ cliente, servicos, horario }) {
  const inicio = DateTime.fromISO(horario, { zone: TIME_ZONE });
  const fim = inicio.plus({ minutes: 30 });

  const evento = {
    summary: `${servicos.join(", ")} - ${cliente}`,
    description: `Cliente: ${cliente}\nServiços: ${servicos.join(", ")}`,
    start: { dateTime: inicio.toISO(), timeZone: TIME_ZONE },
    end: { dateTime: fim.toISO(), timeZone: TIME_ZONE },
  };

  const { data } = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: evento,
  });
  return data;
}

/**
 * Cancela (remove) um agendamento do Google Calendar
 * @param {string} eventId ID do evento a ser removido
 * @returns {Promise<void>}
 */
async function cancelarAgendamento(eventId) {
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
}

module.exports = {
  listarHorariosDisponiveis,
  criarAgendamento,
  cancelarAgendamento,
};
