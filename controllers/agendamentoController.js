const pool = require("../db");
const {
  listarHorariosDisponiveis,
  criarAgendamento,
} = require("../services/calendarService");
const {
  isValidServico,
  isValidDataHora,
  isValidNome,
  isDentroHorarioAtendimento,
} = require("../utils/validation");
const { ValidationError } = require("../utils/errors");
const mensagens = require("../utils/mensagensUsuario");
const logger = require("../utils/logger");

const { DateTime } = require("luxon");
const TIME_ZONE = "America/Sao_Paulo";

// Garante que a coluna google_event_id exista na tabela de agendamentos
async function ensureGoogleEventIdColumn() {
  const [rows] = await pool.query(
    "SHOW COLUMNS FROM agendamentos LIKE 'google_event_id'"
  );
  if (rows.length === 0) {
    await pool.query(
      "ALTER TABLE agendamentos ADD COLUMN google_event_id VARCHAR(255)"
    );
  }
}

// Garante que a coluna 'horario' exista
async function ensureHorarioColumn() {
  const [rows] = await pool.query(
    "SHOW COLUMNS FROM agendamentos LIKE 'horario'"
  );
  if (rows.length === 0) {
    await pool.query("ALTER TABLE agendamentos ADD COLUMN horario DATETIME");
  }
}

async function buscarHorariosDisponiveis(data) {
  if (isNaN(new Date(data).getTime())) {
    throw new ValidationError("Data inválida");
  }
  try {
    const horarios = await listarHorariosDisponiveis(data);
    const hoje = DateTime.now().setZone(TIME_ZONE).toISODate();
    if (data === hoje) {
      const agora = DateTime.now().setZone(TIME_ZONE).toFormat("HH:mm");
      return horarios.filter((h) => h >= agora);
    }
    return horarios;
  } catch (error) {
    logger.error(null, error);
    throw new Error("Erro ao buscar horários disponíveis.");
  }
}

async function agendarServico({
  clienteId,
  clienteNome,
  servicoNome,
  servicosNomes,
  horario,
}) {
  if (!clienteId || isNaN(parseInt(clienteId))) {
    return { success: false, message: "ID do cliente inválido." };
  }
  if (clienteNome && !isValidNome(clienteNome)) {
    return {
      success: false,
      message:
        "O nome deve possuir ao menos 3 letras e conter apenas caracteres alfabéticos.",
    };
  }

  let servicos = [];
  if (Array.isArray(servicosNomes)) {
    servicos = servicosNomes;
  } else if (Array.isArray(servicoNome)) {
    servicos = servicoNome;
  } else if (typeof servicoNome === "string") {
    servicos = servicoNome.split(/,\s*/);
  }
  servicos = servicos.map((s) => s.trim()).filter((s) => s);
  if (!servicos.length || !servicos.every(isValidServico)) {
    return {
      success: false,
      message:
        "O serviço selecionado é inválido. Escolha entre 'Corte', 'Barba' ou 'Corte + Barba'.",
    };
  }
  if (!isValidDataHora(horario)) {
    return { success: false, message: mensagens.HORARIO_INVALIDO };
  }

  const horarioDate = new Date(horario);
  if (!isDentroHorarioAtendimento(horarioDate)) {
    return { success: false, message: mensagens.HORARIO_INVALIDO };
  }

  try {
    const dataStr = horarioDate.toISOString().slice(0, 10);
    const disponiveis = await listarHorariosDisponiveis(dataStr);
    let horaStr = horarioDate.toTimeString().slice(0, 5);
    const match =
      typeof horario === "string" && horario.match(/T(\d{2}:\d{2})/);
    if (match) horaStr = match[1];
    if (!disponiveis.includes(horaStr)) {
      return { success: false, message: mensagens.HORARIO_INVALIDO };
    }

    await ensureGoogleEventIdColumn();
    await ensureHorarioColumn();

    const evento = await criarAgendamento({
      cliente: clienteNome,
      servicos,
      horario,
    });

    await pool.query("START TRANSACTION");

    const [result] = await pool.query(
      `INSERT INTO agendamentos (cliente_id, google_event_id, horario, status, data_agendamento)
       VALUES (?, ?, ?, 'ativo', NOW())`,
      [clienteId, evento.id, horario]
    );
    const agendamentoId = result.insertId;

    const placeholders = servicos.map(() => "?").join(",");
    const [servRows] = await pool.query(
      `SELECT id, nome FROM servicos WHERE nome IN (${placeholders})`,
      servicos
    );
    if (servRows.length !== servicos.length) {
      await pool.query("ROLLBACK");
      return {
        success: false,
        message: mensagens.SERVICO_INVALIDO,
      };
    }

    for (const { id: servicoId } of servRows) {
      await pool.query(
        "INSERT INTO agendamentos_servicos (agendamento_id, servico_id) VALUES (?, ?)",
        [agendamentoId, servicoId]
      );
    }

    // Atualiza o horário para indisponível
    const [updateResult] = await pool.query(
      "UPDATE horarios_disponiveis SET disponivel = FALSE WHERE dia_horario = ? AND disponivel = TRUE",
      [horario]
    );
    if (updateResult.affectedRows === 0) {
      await pool.query("ROLLBACK");
      return {
        success: false,
        message: "Horário já não está mais disponível.",
      };
    }

    await pool.query("COMMIT");

    return { success: true, agendamentoId, eventId: evento.id };
  } catch (error) {
    logger.error(null, error);
    try {
      await pool.query("ROLLBACK");
    } catch (e) {
      logger.error(null, e);
    }
    return {
      success: false,
      message: mensagens.ERRO_AGENDAR,
    };
  }
}

module.exports = { buscarHorariosDisponiveis, agendarServico };
