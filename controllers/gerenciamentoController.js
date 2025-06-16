// gerenciamentoController.js
const pool = require("../db");
const {
  cancelarAgendamento: cancelarEvento,
  criarAgendamento,
} = require("../services/calendarService");
const { isValidDataHora } = require("../utils/validation");
const { ValidationError } = require("../utils/errors");
const logger = require("../utils/logger");

async function cancelarAgendamento(agendamentoId, googleEventId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let eventId = googleEventId;
    if (!eventId) {
      const [agendamento] = await connection.query(
        'SELECT google_event_id FROM agendamentos WHERE id = ? AND status = "ativo"',
        [agendamentoId]
      );

      if (!agendamento || agendamento.length === 0) {
        await connection.release();
        return {
          success: false,
          message: "Agendamento não encontrado ou já cancelado.",
        };
      }

      eventId = agendamento[0].google_event_id;
    }

    try {
      await cancelarEvento(eventId);
  } catch (e) {
    console.error('Erro:', e, e && e.stack, JSON.stringify(e));
    logger.error("Erro ao cancelar evento no Google Calendar:", e);
  }

    await connection.query('UPDATE agendamentos SET status = "cancelado" WHERE id = ?', [agendamentoId]);

    await connection.commit();
    await connection.release();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    await connection.release();
    console.error('Erro:', error, error && error.stack, JSON.stringify(error));
    logger.error("Erro em cancelarAgendamento:", error);
    return {
      success: false,
      message: "Erro interno ao cancelar o agendamento.",
    };
  }
}

// Resto do arquivo permanece igual
async function listarAgendamentosAtivos(clienteId) {
  if (!clienteId || isNaN(parseInt(clienteId))) {
    throw new ValidationError("ID do cliente inválido");
  }
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.google_event_id, a.horario, s.nome AS servico
       FROM agendamentos a
       JOIN agendamentos_servicos asv ON a.id = asv.agendamento_id
       JOIN servicos s ON asv.servico_id = s.id
       WHERE a.cliente_id = ? AND a.status = 'ativo'`,
      [clienteId]
    );
    return rows;
  } catch (error) {
    console.error('Erro:', error, error && error.stack, JSON.stringify(error));
    logger.error("Erro ao listar agendamentos ativos:", error);
    throw new Error("Erro ao listar agendamentos ativos.");
  }
}

async function reagendarAgendamento(agendamentoId, novoHorario, googleEventId) {
  if (!isValidDataHora(novoHorario)) {
    return { success: false, message: "Data e hora inválidas." };
  }
  try {
    await pool.query("START TRANSACTION");

    let eventId = googleEventId;
    if (!eventId) {
      const [agendamento] = await pool.query(
        'SELECT google_event_id FROM agendamentos WHERE id = ? AND status = "ativo"',
        [agendamentoId]
      );
      if (!agendamento.length) {
        await pool.query("ROLLBACK");
        return {
          success: false,
          message: "Agendamento não encontrado ou já cancelado.",
        };
      }
      eventId = agendamento[0].google_event_id;
    }

    try {
      await cancelarEvento(eventId);
  } catch (e) {
    console.error('Erro:', e, e && e.stack, JSON.stringify(e));
    logger.error("Erro ao cancelar evento antigo no Google Calendar:", e);
  }

    const evento = await criarAgendamento({ cliente: "", servico: "", horario: novoHorario });

    await pool.query(
      "UPDATE agendamentos SET google_event_id = ?, horario = ? WHERE id = ?",
      [evento.id, novoHorario, agendamentoId]
    );

    await pool.query("COMMIT");
    return { success: true };
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error('Erro:', error, error && error.stack, JSON.stringify(error));
    logger.error("Erro ao reagendar:", error);
    return {
      success: false,
      message: "Ops, algo deu errado ao reagendar. Tente novamente.",
    };
  }
}

module.exports = {
  listarAgendamentosAtivos,
  cancelarAgendamento,
  reagendarAgendamento,
};
