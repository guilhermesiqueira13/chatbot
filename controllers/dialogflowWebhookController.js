require('dotenv').config();
const dialogflow = require('@google-cloud/dialogflow');
const {
  formatarDataHorarioBr,
  listarDiasDisponiveis,
  listarTodosHorariosDisponiveis,
  formatarDiaBr,
} = require('../utils/dataHelpers');
const { normalizarServico } = require('../utils/stringHelpers');
const {
  encontrarOuCriarCliente,
  atualizarNomeCliente,
} = require('./clienteController');
const {
  agendarServico,
} = require('./agendamentoController');
const {
  listarAgendamentosAtivos,
  cancelarAgendamento,
  reagendarAgendamento,
} = require('./gerenciamentoController');
const mensagens = require('../utils/mensagensUsuario');
const logger = require('../utils/logger');
const { createResponse } = require('../utils/apiResponse');
const { parseEscolhaDia } = require('../utils/respostaParser');
const { validateRequiredParams } = require('../utils/validation');

const sessionClient = new dialogflow.SessionsClient({
  keyFilename: process.env.DIALOGFLOW_KEYFILE,
});
const projectId = process.env.DIALOGFLOW_PROJECT_ID;

const agendamentosPendentes = new Map();

const SERVICOS_VALIDOS = {
  corte: { id: 1, nome: 'Corte' },
  barba: { id: 2, nome: 'Barba' },
  'barba+corte': { id: 3, nome: 'Corte + Barba' },
};

async function detectIntent(from, text) {
  const sessionPath = sessionClient.projectAgentSessionPath(projectId, from);
  const request = {
    session: sessionPath,
    queryInput: { text: { text, languageCode: 'pt-BR' } },
  };
  const [response] = await sessionClient.detectIntent(request);
  return {
    intent: response.queryResult.intent?.displayName || 'default',
    parameters: response.queryResult.parameters?.fields || {},
    fulfillment: response.queryResult.fulfillmentText,
  };
}

// Lista os primeiros dias disponíveis no formato amigável
function listarPrimeirosDias(diasMap, start = 0, count = 6) {
  const dias = Object.keys(diasMap).slice(start, start + count);
  return dias.map((d) => `- ${formatarDiaBr(d)}`).join('\n');
}

/** Envia saudação inicial e reseta o estado do usuário */
async function handleWelcome({ from }) {
  agendamentosPendentes.delete(from);
  return mensagens.BEM_VINDO;
}

/** Registra o serviço escolhido e mostra os dias disponíveis */
async function handleEscolhaServico({ from, parametros }) {
  const servicoNome = parametros?.servico?.stringValue;
  if (!servicoNome) return mensagens.SERVICO_NAO_ENTENDIDO;

  const servicoKey = normalizarServico(servicoNome);
  const servico = SERVICOS_VALIDOS[servicoKey];
  if (!servico) return mensagens.servicoNaoReconhecido(servicoNome);

  const diasDisponiveis = await listarDiasDisponiveis(14);
  const diasKeys = Object.keys(diasDisponiveis);
  if (!diasKeys.length) return mensagens.SEM_HORARIOS_DISPONIVEIS;

  agendamentosPendentes.set(from, {
    servico: servico.nome,
    servicoId: servico.id,
    diasDisponiveis,
    diaIndex: 0,
    confirmationStep: 'awaiting_day',
  });

  const listaDias = listarPrimeirosDias(diasDisponiveis);
  return `Perfeito! Escolha um dia (segunda a sábado).\n${listaDias}`;
}

/** Processa a escolha do dia e horário evitando domingos */
async function handleEscolhaDataHora({ from, msg }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_day')
    return mensagens.ESCOLHA_SERVICO_PRIMEIRO;

  const diasDisp = estado.diasDisponiveis;
  const diasKeys = Object.keys(diasDisp);
  const parsed = parseEscolhaDia(msg.toLowerCase());

  if (parsed.type === 'verMais') {
    estado.diaIndex += 6;
    const listaDias = listarPrimeirosDias(diasDisp, estado.diaIndex);
    agendamentosPendentes.set(from, estado);
    return `Mais opções:\n${listaDias}`;
  }

  let escolhido;
  if (parsed.type === 'weekday') {
    if (parsed.value === 0) return mensagens.DOMINGO_NAO_PERMITIDO;
    escolhido = diasKeys.find((d) => new Date(d).getDay() === parsed.value);
  } else if (parsed.type === 'date') {
    const d = new Date(parsed.value);
    if (d.getDay() === 0) return mensagens.DOMINGO_NAO_PERMITIDO;
    if (diasKeys.includes(parsed.value)) escolhido = parsed.value;
  }

  if (!escolhido) {
    const listaDias = listarPrimeirosDias(diasDisp, estado.diaIndex);
    return `Não encontrei esse dia disponível. Escolha uma das opções:\n${listaDias}`;
  }

  estado.diaEscolhido = escolhido;
  estado.confirmationStep = 'awaiting_time';
  agendamentosPendentes.set(from, estado);

  const horarios = diasDisp[escolhido].map((h, i) => `${i + 1}. ${h}`).join('\n');
  return `Ótimo! Horários disponíveis para ${formatarDiaBr(escolhido)}:\n${horarios}`;
}

/** Recebe o nome do cliente para atualização */
async function handleInformarNovoNome({ from, msg }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_name') {
    agendamentosPendentes.delete(from);
    return mensagens.NAO_ESPERANDO_NOME;
  }
  const nome = msg.trim();
  if (nome.length < 2) return mensagens.NOME_INVALIDO;
  const clienteAtualizado = await atualizarNomeCliente(estado.clienteId, nome);
  if (clienteAtualizado) {
    estado.nome = clienteAtualizado.nome;
    estado.confirmationStep = 'awaiting_confirm';
    agendamentosPendentes.set(from, estado);
    return `Nome atualizado para *${nome}*. Confirma o agendamento?`;
  }
  return mensagens.ERRO_ATUALIZAR_NOME;
}

/** Confirma o agendamento após validar dados obrigatórios */
async function handleConfirmarAgendamento({ from }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_confirm')
    return mensagens.AGENDAMENTO_NAO_CONFIRMADO;

  const validation = validateRequiredParams({
    nome: estado.nome,
    telefone: from,
    servico: estado.servico,
    dataHora: `${estado.diaEscolhido}T${estado.horarioEscolhido}:00`,
  });

  if (!validation.ok) return validation.message;

  const result = await agendarServico({
    clienteId: estado.clienteId,
    clienteNome: estado.nome,
    servicoNome: estado.servico,
    horario: `${estado.diaEscolhido}T${estado.horarioEscolhido}:00`,
  });

  agendamentosPendentes.delete(from);

  if (!result.success) return mensagens.ERRO_AGENDAR;
  return `✅ Agendamento confirmado para *${estado.servico}* em *${formatarDataHorarioBr(`${estado.diaEscolhido}T${estado.horarioEscolhido}:00`)}*`;
}

/** Lista agendamentos ativos para cancelamento */
async function handleCancelamento({ from }) {
  const agendamentos = await listarAgendamentosAtivos(from);
  if (!agendamentos.length) return mensagens.SEM_AGENDAMENTOS_CANCELAR;
  const lista = agendamentos
    .map((a, i) => `${i + 1}. ${a.servico} em ${formatarDataHorarioBr(a.horario)}`)
    .join('\n');
  agendamentosPendentes.set(from, {
    confirmationStep: 'awaiting_cancelar',
    agendamentos,
  });
  return `Qual agendamento deseja cancelar?\n${lista}`;
}

/** Seleciona qual agendamento será cancelado */
async function handleSelecionarCancelamento({ from, msg }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_cancelar')
    return mensagens.NENHUM_CANCELAMENTO;
  const idx = parseInt(msg) - 1;
  const ag = estado.agendamentos[idx];
  if (!ag) return mensagens.NENHUM_CANCELAMENTO;
  estado.agendamentoId = ag.id;
  estado.eventId = ag.google_event_id;
  estado.servico = ag.servico;
  estado.confirmationStep = 'awaiting_cancel_confirm';
  agendamentosPendentes.set(from, estado);
  return `Confirma o cancelamento de ${ag.servico} em ${formatarDataHorarioBr(ag.horario)}?`;
}

/** Confirma ou aborta o cancelamento escolhido */
async function handleConfirmarCancelamento({ from, msg }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_cancel_confirm')
    return mensagens.NENHUM_CANCELAMENTO;
  if (!/^sim/i.test(msg)) {
    agendamentosPendentes.delete(from);
    return mensagens.CANCELAMENTO_NAO_CONFIRMADO;
  }
  const result = await cancelarAgendamento(estado.agendamentoId, estado.eventId);
  agendamentosPendentes.delete(from);
  if (!result.success) return mensagens.ERRO_PROCESSAR_CANCELAMENTO;
  return `✅ Agendamento cancelado com sucesso!`;
}

// Placeholders for reagendamento handlers to keep structure clear
/** Inicia o fluxo de reagendamento */
async function handleReagendar({ from }) {
  const agendamentos = await listarAgendamentosAtivos(from);
  if (!agendamentos.length) return mensagens.SEM_AGENDAMENTOS_REAGENDAR;
  const lista = agendamentos
    .map((a, i) => `${i + 1}. ${a.servico} em ${formatarDataHorarioBr(a.horario)}`)
    .join('\n');
  agendamentosPendentes.set(from, {
    confirmationStep: 'awaiting_reagendamento',
    agendamentos,
  });
  return `Qual deseja reagendar?\n${lista}`;
}

/** Confirma o agendamento a ser reagendado */
async function handleConfirmarInicioReagendamento({ from, msg }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_reagendamento')
    return mensagens.NENHUM_REAGENDAMENTO;
  const idx = parseInt(msg) - 1;
  const ag = estado.agendamentos[idx];
  if (!ag) return mensagens.NENHUM_REAGENDAMENTO;
  estado.agendamentoId = ag.id;
  estado.eventId = ag.google_event_id;
  estado.servico = ag.servico;
  estado.confirmationStep = 'awaiting_reagendamento_data';
  agendamentosPendentes.set(from, estado);
  const horarios = await listarTodosHorariosDisponiveis();
  const lista = horarios
    .map((h, i) => `${i + 1}. ${formatarDataHorarioBr(h.dia_horario)}`)
    .join('\n');
  return `Escolha um novo horário:\n${lista}`;
}

/** Recebe a nova data e hora para o reagendamento */
async function handleEscolhaDataHoraReagendamento({ from, msg }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_reagendamento_data')
    return mensagens.NENHUM_REAGENDAMENTO;
  const horarios = await listarTodosHorariosDisponiveis();
  const idx = parseInt(msg) - 1;
  const h = horarios[idx];
  if (!h) return mensagens.HORARIO_INVALIDO;
  estado.novoHorario = h.dia_horario;
  estado.confirmationStep = 'awaiting_reagendamento_confirm';
  agendamentosPendentes.set(from, estado);
  return `Confirma reagendar para ${formatarDataHorarioBr(h.dia_horario)}?`;
}

/** Finaliza o reagendamento se confirmado */
async function handleConfirmarReagendamento({ from, msg }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_reagendamento_confirm')
    return mensagens.NENHUM_REAGENDAMENTO;
  if (!/^sim/i.test(msg)) {
    agendamentosPendentes.delete(from);
    return mensagens.REAGENDAMENTO_CANCELADO;
  }
  const result = await reagendarAgendamento(
    estado.agendamentoId,
    estado.novoHorario,
    estado.eventId,
  );
  agendamentosPendentes.delete(from);
  if (!result.success) return mensagens.ERRO_REAGENDAR;
  return `✅ Agendamento reagendado com sucesso!`;
}

/** Fallback para intents não mapeadas */
async function handleDefault({ fulfillment }) {
  return fulfillment || mensagens.NAO_ENTENDI;
}

// Mapeamento das intents para facilitar futuras expansões
const intentHandlers = {
  welcome_intent: handleWelcome,
  escolha_servico: handleEscolhaServico,
  escolha_datahora: handleEscolhaDataHora,
  informar_novo_nome: handleInformarNovoNome,
  confirmar_agendamento: handleConfirmarAgendamento,
  cancelar_agendamento: handleCancelamento,
  selecionar_cancelamento: handleSelecionarCancelamento,
  confirmar_cancelamento: handleConfirmarCancelamento,
  reagendar_agendamento: handleReagendar,
  confirmar_inicio_reagendamento: handleConfirmarInicioReagendamento,
  escolha_datahora_reagendamento: handleEscolhaDataHoraReagendamento,
  confirmar_reagendamento: handleConfirmarReagendamento,
};

/** Controller principal do webhook do Dialogflow */
async function handleWebhook(req, res) {
  const msg = req.body.Body || req.body.text;
  const from = req.body.From || req.body.sessionId;
  const profileName = req.body.ProfileName || 'Cliente';

  if (!msg || !from) return res.status(400).send('Requisição inválida.');

  let cliente;
  try {
    cliente = await encontrarOuCriarCliente(from, profileName);
  } catch (e) {
    logger.error('Erro ao buscar/criar cliente:', e);
    return res.json(createResponse(false, null, mensagens.ERRO_GERAL));
  }

  const { intent, parameters, fulfillment } = await detectIntent(from, msg);
  const estado = agendamentosPendentes.get(from) || {};
  estado.clienteId = cliente.id;
  estado.nome = cliente.nome;
  agendamentosPendentes.set(from, estado);

  let resposta;
  try {
    switch (intent) {
      case 'welcome_intent':
        resposta = await handleWelcome({ from, parametros: parameters });
        break;
      case 'escolha_servico':
        resposta = await handleEscolhaServico({ from, parametros: parameters });
        break;
      case 'escolha_datahora':
        resposta = await handleEscolhaDataHora({ from, msg });
        break;
      case 'informar_novo_nome':
        resposta = await handleInformarNovoNome({ from, msg });
        break;
      case 'confirmar_agendamento':
        resposta = await handleConfirmarAgendamento({ from });
        break;
      case 'cancelar_agendamento':
        resposta = await handleCancelamento({ from });
        break;
      case 'selecionar_cancelamento':
        resposta = await handleSelecionarCancelamento({ from, msg });
        break;
      case 'confirmar_cancelamento':
        resposta = await handleConfirmarCancelamento({ from, msg });
        break;
      case 'reagendar_agendamento':
        resposta = await handleReagendar({ from });
        break;
      case 'confirmar_inicio_reagendamento':
        resposta = await handleConfirmarInicioReagendamento({ from, msg });
        break;
      case 'escolha_datahora_reagendamento':
        resposta = await handleEscolhaDataHoraReagendamento({ from, msg });
        break;
      case 'confirmar_reagendamento':
        resposta = await handleConfirmarReagendamento({ from, msg });
        break;
      default:
        resposta = await handleDefault({ fulfillment });
    }
    res.json(createResponse(true, { reply: resposta }, null));
  } catch (error) {
    logger.error('Erro no handler:', error);
    res.json(createResponse(false, null, mensagens.ERRO_GERAL));
  }
}

module.exports = { handleWebhook };
