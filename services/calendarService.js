require("dotenv").config();
const { google } = require("googleapis");
const path = require("path");

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
  const inicioDia = `${ano}-${mes}-${dia}T00:00:00-03:00`;
  const fimDia = `${ano}-${mes}-${dia}T23:59:59-03:00`;

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: inicioDia,
    timeMax: fimDia,
    singleEvents: true,
    orderBy: "startTime",
  });

  const eventos = res.data.items || [];
  const horariosOcupados = eventos.map((e) => {
    const dt = e.start.dateTime || e.start.date;
    return new Date(dt).toTimeString().slice(0, 5);
  });

  const disponiveis = [];
  const base = new Date(`${ano}-${mes}-${dia}T09:00:00-03:00`);
  const limite = new Date(`${ano}-${mes}-${dia}T18:00:00-03:00`);
  for (let t = new Date(base); t < limite; t.setMinutes(t.getMinutes() + 30)) {
    const horario = t.toTimeString().slice(0, 5);
    if (!horariosOcupados.includes(horario)) {
      disponiveis.push(horario);
    }
  }

  // Remove quaisquer horários que caiam em domingo
  const filtrados = disponiveis.filter((h) => {
    const dt = new Date(`${ano}-${mes}-${dia}T${h}:00-03:00`);
    const day = dt.getDay();
    return day > 1 && day <= 6;
  });

  return filtrados;
}

/**
 * Cria um evento de agendamento no Google Calendar
 * @param {{cliente: string, servicos: string[], horario: string}} dados
 * @returns {Promise<object>} Dados do evento criado
 */
async function criarAgendamento({ cliente, servicos, horario }) {
  const inicio = new Date(horario);
  const fim = new Date(inicio.getTime() + 30 * 60000);

  const evento = {
    summary: `${servicos.join(", ")} - ${cliente}`,
    description: `Cliente: ${cliente}\nServiços: ${servicos.join(", ")}`,
    start: { dateTime: inicio.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: fim.toISOString(), timeZone: TIME_ZONE },
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
