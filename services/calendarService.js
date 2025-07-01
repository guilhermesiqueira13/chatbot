const pool = require("../db");
const { google } = require("googleapis");
const path = require("path");
const { DateTime } = require("../utils/luxonShim");

const CALENDAR_ID =
  "99435b27c68a7a48eca3aa3ab9770b8d0207851464d88c89e55c763bfca69c0a@group.calendar.google.com";
const TIME_ZONE = "America/Sao_Paulo";

const keyFile =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, "..", "barbearia-calendar.json");

const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({ version: "v3", auth });

async function listarHorariosDisponiveis(data) {
  try {
    const [rows] = await pool.query(
      `SELECT dia_horario 
       FROM horarios_disponiveis 
       WHERE DATE(dia_horario) = ? AND disponivel = TRUE
       ORDER BY dia_horario ASC`,
      [data]
    );

    const horariosBanco = rows.map((row) =>
      DateTime.fromJSDate(row.dia_horario).setZone(TIME_ZONE).toFormat("HH:mm")
    );

    const [ano, mes, dia] = data.split("-");
    const inicioDia = DateTime.fromObject(
      { year: +ano, month: +mes, day: +dia },
      { zone: TIME_ZONE }
    ).startOf("day");
    const fimDia = inicioDia.endOf("day");

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

    let disponiveis = horariosBanco.filter(
      (h) => !horariosOcupados.includes(h)
    );

    disponiveis = disponiveis.filter((h) => {
      const dt = DateTime.fromISO(`${ano}-${mes}-${dia}T${h}:00`, {
        zone: TIME_ZONE,
      });
      return dt.weekday !== 7;
    });

    const hoje = DateTime.now().setZone(TIME_ZONE).toISODate();
    if (data === hoje) {
      const agora = DateTime.now().setZone(TIME_ZONE).toFormat("HH:mm");
      disponiveis = disponiveis.filter((h) => h > agora);
    }

    return disponiveis;
  } catch (error) {
    console.error("Erro ao listar horários disponíveis:", error);
    throw new Error("Erro ao buscar horários disponíveis.");
  }
}

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

async function cancelarAgendamento(eventId) {
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
}

module.exports = {
  listarHorariosDisponiveis,
  criarAgendamento,
  cancelarAgendamento,
};
