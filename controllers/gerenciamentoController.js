// gerenciamentoController.js
const pool = require("../db");
const {
  cancelarAgendamento: cancelarEvento,
  criarAgendamento,
} = require("../services/calendarService");
const { isValidDataHora } = require("../utils/validation");
const { ValidationError } = require("../utils/errors");
const logger = require("../utils/logger");

async function cancelarAgendamento(agendamentoId, googleEventId, clienteId = null) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let eventId = googleEventId;
    if (!eventId) {
      let query =
        `SELECT a.google_event_id FROM agendamentos a
         JOIN agendamentos_servicos asv ON a.id = asv.agendamento_id
         WHERE a.id = ? AND a.status = "ativo"`;
      const params = [agendamentoId];
      if (clienteId) {
        query += ' AND a.cliente_id = ?';
        params.push(clienteId);
      }
      const [agendamento] = await connection.query(query, params);

      if (!agendamento || agendamento.length === 0) {
        await connection.release();
        return {
          success: false,
          message: "Agendamento não encontrado ou sem serviço vinculado.",
        };
      }

      eventId = agendamento[0].google_event_id;
    }

    try {
      await cancelarEvento(eventId);
  } catch (e) {
    logger.error(null, { message: 'Erro ao cancelar evento no Google Calendar: ' + (e.message || e), stack: e.stack });
  }

    if (clienteId) {
      await connection.query(
        'UPDATE agendamentos SET status = "cancelado" WHERE id = ? AND cliente_id = ?',
        [agendamentoId, clienteId]
      );
    } else {
      await connection.query(
        'UPDATE agendamentos SET status = "cancelado" WHERE id = ?',
        [agendamentoId]
      );
    }

    await connection.commit();
    await connection.release();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    await connection.release();
    logger.error(null, { message: 'Erro em cancelarAgendamento: ' + (error.message || error), stack: error.stack });
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
      `SELECT a.id, a.google_event_id, a.horario,
              GROUP_CONCAT(s.nome ORDER BY s.nome SEPARATOR ', ') AS servico
       FROM agendamentos a
       JOIN agendamentos_servicos asv ON a.id = asv.agendamento_id
       JOIN servicos s ON asv.servico_id = s.id
       WHERE a.cliente_id = ? AND a.status = 'ativo'
       GROUP BY a.id`,
      [clienteId]
    );
    return rows;
  } catch (error) {
    logger.error(null, { message: 'Erro ao listar agendamentos ativos: ' + (error.message || error), stack: error.stack });
    throw new Error("Erro ao listar agendamentos ativos.");
  }
}

async function reagendarAgendamento(agendamentoId, novoHorario, googleEventId, clienteId = null) {
  if (!isValidDataHora(novoHorario)) {
    return {
      success: false,
      message:
        "Data e hora inválidas. Use o formato DD/MM/YYYY HH:mm e escolha um horário futuro.",
    };
  }
  try {
    await pool.query("START TRANSACTION");

    let eventId = googleEventId;
    let clienteNome;
    let servicos = [];
    {
      let query =
        `SELECT a.google_event_id, c.nome AS cliente_nome,
                GROUP_CONCAT(s.nome ORDER BY s.nome SEPARATOR ', ') AS servicos
         FROM agendamentos a
         JOIN clientes c ON a.cliente_id = c.id
         JOIN agendamentos_servicos asv ON a.id = asv.agendamento_id
         JOIN servicos s ON asv.servico_id = s.id
         WHERE a.id = ? AND a.status = "ativo"`;
      const params = [agendamentoId];
      if (clienteId) {
        query += ' AND a.cliente_id = ?';
        params.push(clienteId);
      }
      query += ' GROUP BY a.id';
      const [agendamento] = await pool.query(query, params);
      if (!agendamento.length) {
        await pool.query("ROLLBACK");
        return {
          success: false,
          message: "Agendamento não encontrado ou sem serviço vinculado.",
        };
      }
      eventId = eventId || agendamento[0].google_event_id;
      clienteNome = agendamento[0].cliente_nome;
      servicos = (agendamento[0].servicos || '').split(/,\s*/).filter(Boolean);
    }

    try {
      await cancelarEvento(eventId);
  } catch (e) {
    logger.error(null, { message: 'Erro ao cancelar evento antigo no Google Calendar: ' + (e.message || e), stack: e.stack });
  }

    const evento = await criarAgendamento({
      cliente: clienteNome || "",
      servicos,
      horario: novoHorario,
    });

    if (clienteId) {
      await pool.query(
        "UPDATE agendamentos SET google_event_id = ?, horario = ? WHERE id = ? AND cliente_id = ?",
        [evento.id, novoHorario, agendamentoId, clienteId]
      );
    } else {
      await pool.query(
        "UPDATE agendamentos SET google_event_id = ?, horario = ? WHERE id = ?",
        [evento.id, novoHorario, agendamentoId]
      );
    }

    await pool.query("COMMIT");
    return { success: true };
  } catch (error) {
    await pool.query("ROLLBACK");
    logger.error(null, { message: 'Erro ao reagendar: ' + (error.message || error), stack: error.stack });
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
