require('dotenv').config();
const dialogflow = require('@google-cloud/dialogflow');
const {
  formatarDataHorarioBr,
  listarDiasDisponiveis,
  listarTodosHorariosDisponiveis,
  formatarDiaBr,
  gerarMensagemDias,
  gerarMensagemHorarios,
  encontrarHorarioProximo,
} = require('../utils/dataHelpers');
const { normalizarServico } = require('../utils/stringHelpers');
const {
  encontrarOuCriarCliente,
  atualizarNomeCliente,
  buscarClientePorTelefone,
} = require('./clienteController');
const {
  agendarServico,
  buscarHorariosDisponiveis,
} = require('./agendamentoController');
const {
  listarAgendamentosAtivos,
  cancelarAgendamento,
  reagendarAgendamento,
} = require('./gerenciamentoController');
const mensagens = require('../utils/mensagensUsuario');
const logger = require('../utils/logger');
const { createResponse } = require('../utils/apiResponse');
const { parseEscolhaDia, parseEscolhaAgendamento } = require('../utils/respostaParser');
const {
  isValidNome,
  isValidServico,
  isValidDataHora,
} = require('../utils/validation');

const sessionClient = new dialogflow.SessionsClient({
  keyFilename: process.env.DIALOGFLOW_KEYFILE,
});
const projectId = process.env.DIALOGFLOW_PROJECT_ID;

const agendamentosPendentes = new Map();

const FLUXO_INTENTS = {
  reagendamento: new Set([
    'reagendar_agendamento',
    'confirmar_inicio_reagendamento',
    'escolha_datahora_reagendamento',
    'confirmar_reagendamento',
  ]),
  cancelamento: new Set([
    'cancelar_agendamento',
    'selecionar_cancelamento',
    'confirmar_cancelamento',
  ]),
};

function getEstado(from) {
  return agendamentosPendentes.get(from) || {};
}

function setEstado(from, updates) {
  const atual = agendamentosPendentes.get(from) || {};
  const novo = { ...atual, ...updates };
  agendamentosPendentes.set(from, novo);
  return novo;
}

function intentNoFluxo(intent, fluxo) {
  if (!fluxo) return true;
  const intents = FLUXO_INTENTS[fluxo];
  return intents ? intents.has(intent) : true;
}

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
  const contexts = (response.queryResult.outputContexts || []).map((c) =>
    c.name.split('/').pop(),
  );
  return {
    intent: response.queryResult.intent?.displayName || 'default',
    parameters: response.queryResult.parameters?.fields || {},
    fulfillment: response.queryResult.fulfillmentText,
    contexts,
  };
}

// Lista os primeiros dias disponíveis no formato amigável
function listarPrimeirosDias(diasMap, start = 0, count = 6) {
  return gerarMensagemDias(diasMap, start, count);
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

  setEstado(from, {
    servico: servico.nome,
    servicoId: servico.id,
    diasDisponiveis,
    diaIndex: 0,
    confirmationStep: 'awaiting_day',
  });

  logger.info(from, `Servico escolhido: ${servico.nome}`);

  const listaDias = listarPrimeirosDias(diasDisponiveis);
  return `Perfeito! Escolha um dia (segunda a sábado).\n${listaDias}`;
}

/** Processa a escolha do dia e horário evitando domingos */
async function handleEscolhaDataHora({ from, msg, parametros }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || !estado.servico) return mensagens.ESCOLHA_SERVICO_PRIMEIRO;
  logger.info(from, `handleEscolhaDataHora - step ${estado.confirmationStep} servico=${estado.servico}`);
  if (estado.confirmationStep === 'awaiting_reagendamento_time') {
    return handleEscolhaDataHoraReagendamento({ from, msg, parametros });
  }

  const diasDisp = estado.diasDisponiveis || {};
  const diasKeys = Object.keys(diasDisp);
  logger.info(from, `Etapa ${estado.confirmationStep}`);

  if (estado.confirmationStep === 'awaiting_day') {
    let escolhido = null;

    let paramDate = parametros['date-time']?.stringValue || parametros.date?.stringValue;
    if (paramDate) {
      escolhido = String(paramDate).split('T')[0];
    } else {
      const parsed = parseEscolhaDia(msg.toLowerCase());
      if (parsed.type === 'verMais') {
        estado.diaIndex += 6;
        const listaDias = listarPrimeirosDias(diasDisp, estado.diaIndex);
        setEstado(from, estado);
        return `Mais opções de dias:\n${listaDias}`;
      }
      if (parsed.type === 'weekday') {
        if (parsed.value === 0) {
          const listaDias = listarPrimeirosDias(diasDisp, estado.diaIndex);
          return `${mensagens.DOMINGO_NAO_PERMITIDO}\nEscolha um dia disponível:\n${listaDias}`;
        }
        const possiveis = diasKeys.filter(
          (d) => new Date(d).getDay() === parsed.value,
        );
        if (possiveis.length) {
          escolhido = parsed.next ? possiveis[1] || possiveis[0] : possiveis[0];
        }
      } else if (parsed.type === 'date') {
        if (new Date(parsed.value).getDay() === 0) {
          const listaDias = listarPrimeirosDias(diasDisp, estado.diaIndex);
          return `${mensagens.DOMINGO_NAO_PERMITIDO}\nEscolha um dia disponível:\n${listaDias}`;
        }
        if (diasKeys.includes(parsed.value)) escolhido = parsed.value;
      }
    }

    if (!escolhido || !diasKeys.includes(escolhido)) {
      const listaDias = listarPrimeirosDias(diasDisp, estado.diaIndex);
      let sugestao = '';
      try {
        const proximos = await listarTodosHorariosDisponiveis(14);
        const proximo = encontrarHorarioProximo(
          `${escolhido || diasKeys[0]}T00:00:00`,
          proximos,
        );
        if (proximo) {
          sugestao = ` Próximo horário disponível: ${formatarDataHorarioBr(
            proximo.dia_horario,
          )}.`;
        }
      } catch (e) {
        logger.error(from, e);
      }
      return `Dia inválido.${sugestao}\nEscolha um destes:\n${listaDias}`;
    }

    if (new Date(escolhido).getDay() === 0) {
      const listaDias = listarPrimeirosDias(diasDisp, estado.diaIndex);
      return `${mensagens.DOMINGO_NAO_PERMITIDO}\nEscolha um dia disponível:\n${listaDias}`;
    }

    estado.diaEscolhido = escolhido;
    estado.confirmationStep = 'awaiting_time';
    setEstado(from, estado);

    const horarios = gerarMensagemHorarios(diasDisp[escolhido]);
    return `Ótimo! Horários disponíveis para ${formatarDiaBr(escolhido)}:\n${horarios}`;
  }

  if (estado.confirmationStep === 'awaiting_time') {
    const horariosDia = diasDisp[estado.diaEscolhido] || [];
    let hora = null;

    if (parametros['date-time']?.stringValue) {
      const dt = new Date(parametros['date-time'].stringValue);
      const dataParam = dt.toISOString().slice(0, 10);
      if (dataParam === estado.diaEscolhido) {
        hora = dt.toTimeString().slice(0, 5);
      }
    } else if (parametros.time?.stringValue) {
      hora = parametros.time.stringValue.slice(11, 16);
    }

    if (!hora) {
      const num = parseInt(msg, 10);
      if (!isNaN(num)) hora = horariosDia[num - 1];
      const lower = msg.toLowerCase();
      if (!hora && /primeiro/.test(lower)) {
        hora = horariosDia[0];
      }
      if (!hora && /manh[ãa]/.test(lower)) {
        hora = horariosDia.find((h) => parseInt(h.split(':')[0]) < 12);
      }
      if (!hora && /tarde/.test(lower)) {
        hora = horariosDia.find((h) => parseInt(h.split(':')[0]) >= 12);
      }
      if (!hora) {
        const m = lower.match(/\b(\d{1,2})(?:h|:(\d{2}))?/);
        if (m) {
          const hh = m[1].padStart(2, '0');
          const mm = m[2] || '00';
          hora = `${hh}:${mm}`;
        }
      }
    }

    if (!hora || !horariosDia.includes(hora)) {
      const lista = gerarMensagemHorarios(horariosDia);
      let sugestao = '';
      try {
        const proximos = await listarTodosHorariosDisponiveis(14);
        const proximo = encontrarHorarioProximo(
          `${estado.diaEscolhido}T${hora || '00:00'}:00`,
          proximos,
        );
        if (proximo) {
          sugestao = ` Próximo horário disponível: ${formatarDataHorarioBr(
            proximo.dia_horario,
          )}.`;
        }
      } catch (e) {
        logger.error(from, e);
      }
      return `Horário inválido.${sugestao}\nEscolha um dos seguintes:\n${lista}`;
    }

    estado.horarioEscolhido = hora;
    estado.confirmationStep = 'awaiting_confirm';
    setEstado(from, estado);

    const resumo = formatarDataHorarioBr(`${estado.diaEscolhido}T${hora}:00`);
    return `Confirmar agendamento de *${estado.servico}* em *${resumo}* para *${estado.nome}*?`;
  }

  return mensagens.NAO_AGENDAMENTO_ANDAMENTO;
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
    setEstado(from, estado);
    return `Nome atualizado para *${nome}*. Confirma o agendamento?`;
  }
  return mensagens.ERRO_ATUALIZAR_NOME;
}

/** Confirma o agendamento após validar dados obrigatórios */
async function handleConfirmarAgendamento({ from }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_confirm')
    return mensagens.AGENDAMENTO_NAO_CONFIRMADO;

  if (!estado.clienteId) return mensagens.AGENDAMENTO_NAO_CONFIRMADO;

  const dataHora = `${estado.diaEscolhido}T${estado.horarioEscolhido}:00`;
  if (!isValidNome(estado.nome)) return mensagens.NOME_INVALIDO;
  if (!isValidServico(estado.servico)) return mensagens.SERVICO_INVALIDO;
  if (!isValidDataHora(dataHora)) return mensagens.DATAHORA_INVALIDA;

  const result = await agendarServico({
    clienteId: estado.clienteId,
    clienteNome: estado.nome,
    servicoNome: estado.servico,
    horario: `${estado.diaEscolhido}T${estado.horarioEscolhido}:00`,
  });

  agendamentosPendentes.delete(from);

  if (!result.success) return mensagens.ERRO_AGENDAR;
  return `✅ Agendamento confirmado para *${estado.servico}* em *${formatarDataHorarioBr(`${estado.diaEscolhido}T${estado.horarioEscolhido}:00`)}* no nome de *${estado.nome}*.` +
    " Se precisar reagendar ou cancelar, responda 'Reagendar' ou 'Cancelar'.";
}

/** Lista agendamentos ativos para cancelamento */
async function handleCancelamento({ from }) {
  const cliente = await buscarClientePorTelefone(from);
  if (!cliente) return mensagens.CLIENTE_NAO_ENCONTRADO;

  const agendamentos = (await listarAgendamentosAtivos(cliente.id)).filter(
    (a) => new Date(a.horario).getDay() !== 0,
  );
  if (!agendamentos.length) return mensagens.SEM_AGENDAMENTOS_CANCELAR;
  const lista = agendamentos
    .map((a, i) => `${i + 1}. ${a.servico} em ${formatarDataHorarioBr(a.horario)}`)
    .join('\n');
  setEstado(from, {
    fluxo: 'cancelamento',
    confirmationStep: 'awaiting_cancelar',
    agendamentos,
    clienteId: cliente.id,
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
  setEstado(from, estado);
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
  const result = await cancelarAgendamento(
    estado.agendamentoId,
    estado.eventId,
    estado.clienteId
  );
  agendamentosPendentes.delete(from);
  if (!result.success) return mensagens.ERRO_PROCESSAR_CANCELAMENTO;
  return `✅ Agendamento cancelado com sucesso!`;
}

// Placeholders for reagendamento handlers to keep structure clear
/** Inicia o fluxo de reagendamento */
async function handleReagendar({ from }) {
  const cliente = await buscarClientePorTelefone(from);
  if (!cliente) return mensagens.CLIENTE_NAO_ENCONTRADO;

  const agendamentos = (await listarAgendamentosAtivos(cliente.id)).filter(
    (a) => new Date(a.horario).getDay() !== 0,
  );
  if (!agendamentos.length) return mensagens.SEM_AGENDAMENTOS_REAGENDAR;
  const lista = agendamentos
    .map((a, i) => `${i + 1}. ${a.servico} em ${formatarDataHorarioBr(a.horario)}`)
    .join('\n');
  setEstado(from, {
    fluxo: 'reagendamento',
    confirmationStep: 'awaiting_reagendamento',
    agendamentos,
    clienteId: cliente.id,
  });
  logger.info(from, `Listando ${agendamentos.length} agendamentos para reagendamento`);
  return `Qual deseja reagendar?\n${lista}`;
}

/** Confirma o agendamento a ser reagendado */
async function handleConfirmarInicioReagendamento({ from, msg, contexts }) {
  const estado = agendamentosPendentes.get(from);
  if (
    !estado ||
    estado.confirmationStep !== 'awaiting_reagendamento' ||
    (contexts && !contexts.includes('reagendamento_awaiting_datahora'))
  )
    return mensagens.NENHUM_REAGENDAMENTO;

  const ag = parseEscolhaAgendamento(msg, estado.agendamentos);
  if (!ag) {
    const lista = estado.agendamentos
      .map((a, i) => `${i + 1}. ${a.servico} em ${formatarDataHorarioBr(a.horario)}`)
      .join('\n');
    return `Opção inválida. Escolha um dos agendamentos abaixo:\n${lista}`;
  }
  estado.agendamentoId = ag.id;
  estado.eventId = ag.google_event_id;
  estado.servico = ag.servico;
  estado.horarioAtual = ag.horario;
  estado.confirmationStep = 'awaiting_reagendamento_time';
  estado.diasDisponiveis = await listarDiasDisponiveis(14);
  estado.diaIndex = 0;
  estado.novoDia = null;
  estado.horariosReagendamento = [];
  estado.contextoDialogflow = 'reagendamento_datahora_selected';
  setEstado(from, estado);
  logger.info(from, `Reagendamento selecionado id=${ag.id} servico=${ag.servico}`);
  const listaDias = listarPrimeirosDias(estado.diasDisponiveis);
  return `Você está reagendando ${ag.servico} em ${formatarDataHorarioBr(ag.horario)}.` +
    `\nPara qual dia deseja remarcar?\n${listaDias}`;
}

/** Recebe a nova data e hora para o reagendamento */
async function handleEscolhaDataHoraReagendamento({ from, msg, parametros }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado) return mensagens.NENHUM_REAGENDAMENTO;

  if (estado.confirmationStep === 'awaiting_reagendamento_time' && !estado.novoDia) {
    let escolhido = null;
    let paramDate = parametros['date-time']?.stringValue || parametros.date?.stringValue;
    if (paramDate) {
      escolhido = String(paramDate).split('T')[0];
    } else {
      const parsed = parseEscolhaDia(msg.toLowerCase());
      const diasDisp = estado.diasDisponiveis || {};
      const diasKeys = Object.keys(diasDisp);
      if (parsed.type === 'verMais') {
        estado.diaIndex += 6;
        const listaDias = listarPrimeirosDias(diasDisp, estado.diaIndex);
        setEstado(from, estado);
        return `Mais opções de dias:\n${listaDias}`;
      }
      if (parsed.type === 'weekday') {
        const possiveis = diasKeys.filter((d) => new Date(d).getDay() === parsed.value);
        if (possiveis.length) {
          escolhido = parsed.next ? possiveis[1] || possiveis[0] : possiveis[0];
        }
      } else if (parsed.type === 'date') {
        if (diasKeys.includes(parsed.value)) escolhido = parsed.value;
      }
    }

    const diasDisp = estado.diasDisponiveis || {};
    const diasKeys = Object.keys(diasDisp);
    if (!escolhido || !diasKeys.includes(escolhido)) {
      const listaDias = listarPrimeirosDias(diasDisp, estado.diaIndex);
      return `Dia inválido. Escolha um destes:\n${listaDias}`;
    }

    estado.novoDia = escolhido;
    estado.horariosReagendamento = await buscarHorariosDisponiveis(escolhido);
    if (!estado.horariosReagendamento.length) {
      return mensagens.SEM_HORARIOS_DISPONIVEIS;
    }
    setEstado(from, estado);
    const lista = gerarMensagemHorarios(estado.horariosReagendamento);
    return `Horários disponíveis para ${formatarDiaBr(escolhido)}:\n${lista}`;
  }

  if (estado.confirmationStep === 'awaiting_reagendamento_time') {
    const horariosDia = estado.horariosReagendamento || [];
    let hora = null;
    if (parametros['date-time']?.stringValue) {
      const dt = new Date(parametros['date-time'].stringValue);
      const dataParam = dt.toISOString().slice(0, 10);
      if (dataParam === estado.novoDia) {
        hora = dt.toTimeString().slice(0, 5);
      }
    } else if (parametros.time?.stringValue) {
      hora = parametros.time.stringValue.slice(11, 16);
    }
    if (!hora) {
      const num = parseInt(msg, 10);
      if (!isNaN(num)) hora = horariosDia[num - 1];
    }
    if (!hora || !horariosDia.includes(hora)) {
      const lista = gerarMensagemHorarios(horariosDia);
      return `Horário inválido. Escolha um dos seguintes:\n${lista}`;
    }

    estado.novoHorario = `${estado.novoDia}T${hora}:00`;
    estado.confirmationStep = 'awaiting_reagendamento_confirm';
    setEstado(from, estado);
    return `Confirma reagendar ${estado.servico} para ${formatarDataHorarioBr(estado.novoHorario)}?`;
  }

  return mensagens.NENHUM_REAGENDAMENTO;
}

/** Finaliza o reagendamento se confirmado */
async function handleConfirmarReagendamento({ from, msg }) {
  const estado = agendamentosPendentes.get(from);
  if (!estado || estado.confirmationStep !== 'awaiting_reagendamento_confirm')
    return mensagens.NENHUM_REAGENDAMENTO;
  logger.info(from, `Confirmando reagendamento do servico ${estado.servico} para ${estado.novoHorario}`);
  if (!/^sim/i.test(msg)) {
    agendamentosPendentes.delete(from);
    return mensagens.REAGENDAMENTO_CANCELADO;
  }
  const result = await reagendarAgendamento(
    estado.agendamentoId,
    estado.novoHorario,
    estado.eventId,
    estado.clienteId
  );
  agendamentosPendentes.delete(from);
  if (!result.success) return mensagens.ERRO_REAGENDAR;
  return `✅ Horário atualizado! ${estado.servico} agora está marcado para ${formatarDataHorarioBr(estado.novoHorario)}.`;
}

/** Fallback para intents não mapeadas */
async function handleDefault({ from, fulfillment }) {
  const estado = agendamentosPendentes.get(from);
  if (estado) {
    switch (estado.confirmationStep) {
      case 'awaiting_day': {
        const diasDisp = estado.diasDisponiveis || {};
        const lista = listarPrimeirosDias(diasDisp, estado.diaIndex);
        return `Escolha um dia válido:\n${lista}`;
      }
      case 'awaiting_time': {
        const horarios = gerarMensagemHorarios(
          (estado.diasDisponiveis || {})[estado.diaEscolhido] || [],
        );
        return `Escolha um horário disponível:\n${horarios}`;
      }
      case 'awaiting_confirm': {
        const resumo = formatarDataHorarioBr(
          `${estado.diaEscolhido}T${estado.horarioEscolhido}:00`,
        );
        return `Confirma o agendamento de *${estado.servico}* em *${resumo}* para *${estado.nome}*?`;
      }
      case 'awaiting_cancelar': {
        const lista = (estado.agendamentos || [])
          .map((a, i) => `${i + 1}. ${a.servico} em ${formatarDataHorarioBr(a.horario)}`)
          .join('\n');
        return `Escolha o agendamento que deseja cancelar:\n${lista}`;
      }
      case 'awaiting_cancel_confirm': {
        const ag = (estado.agendamentos || []).find(a => a.id === estado.agendamentoId);
        const horario = ag ? formatarDataHorarioBr(ag.horario) : '';
        return `Confirma o cancelamento de ${estado.servico} em ${horario}?`;
      }
      case 'awaiting_reagendamento': {
        const lista = (estado.agendamentos || [])
          .map((a, i) => `${i + 1}. ${a.servico} em ${formatarDataHorarioBr(a.horario)}`)
          .join('\n');
        return `Qual deseja reagendar?\n${lista}`;
      }
      case 'awaiting_reagendamento_time': {
        if (!estado.novoDia) {
          const diasDisp = estado.diasDisponiveis || {};
          const lista = listarPrimeirosDias(diasDisp, estado.diaIndex);
          return `Informe o dia desejado:\n${lista}`;
        }
        const horarios = gerarMensagemHorarios(estado.horariosReagendamento || []);
        return `Escolha um horário disponível:\n${horarios}`;
      }
      case 'awaiting_reagendamento_confirm': {
        return `Confirma reagendar ${estado.servico} para ${formatarDataHorarioBr(estado.novoHorario)}?`;
      }
      default:
        if (estado.fluxo === 'reagendamento') {
          return mensagens.FLUXO_REAGENDAMENTO_EM_ANDAMENTO;
        }
        if (estado.fluxo === 'cancelamento') {
          return mensagens.FLUXO_CANCELAMENTO_EM_ANDAMENTO;
        }
        break;
    }
  }
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
  escolha_datahora_reagendamento: handleConfirmarInicioReagendamento,
  confirmar_inicio_reagendamento: handleEscolhaDataHoraReagendamento,
  confirmar_reagendamento: handleConfirmarReagendamento,
};

/** Controller principal do webhook do Dialogflow */
async function handleWebhook(req, res) {
  const msg = req.body.Body || req.body.text;
  const from = req.body.From || req.body.sessionId;
  const profileName = req.body.ProfileName || 'Cliente';

  if (!msg || !from) return res.status(400).send('Requisição inválida.');

  logger.user(from, msg);

  const texto = (msg || '').trim().toLowerCase();
  if (/^\d+$/.test(texto) && !agendamentosPendentes.has(from)) {
    const reply = mensagens.NAO_ENTENDI;
    logger.bot(from, reply);
    return res.json(createResponse(true, { reply }, null));
  }
  if (/^(cancelar|voltar|reiniciar)/.test(texto)) {
    agendamentosPendentes.delete(from);
    const respostaReinicio = await handleWelcome({ from });
    logger.bot(from, respostaReinicio);
    return res.json(createResponse(true, { reply: respostaReinicio }, null));
  }

  let cliente;
  try {
    cliente = await encontrarOuCriarCliente(from, profileName);
  } catch (e) {
    logger.error(from, e);
    return res.json(createResponse(false, null, mensagens.ERRO_GERAL));
  }

  const { intent, parameters, fulfillment, contexts } = await detectIntent(from, msg);
  logger.dialogflow(intent, parameters);
  const estado = setEstado(from, {
    clienteId: cliente.id,
    nome: cliente.nome,
    telefone: cliente.telefone,
  });

  if (!intentNoFluxo(intent, estado.fluxo)) {
    const respostaFluxo = await handleDefault({ from, fulfillment: '' });
    logger.bot(from, respostaFluxo);
    return res.json(createResponse(true, { reply: respostaFluxo }, null));
  }

  let resposta;
  try {
    const handler = intentHandlers[intent];
    if (handler) {
      resposta = await handler({ from, msg, parametros: parameters, contexts });
    } else {
      resposta = await handleDefault({ from, fulfillment });
    }
    logger.bot(from, resposta);
    res.json(createResponse(true, { reply: resposta }, null));
  } catch (error) {
    logger.error(from, error);
    res.json(createResponse(false, null, mensagens.ERRO_GERAL));
  }
}

module.exports = { handleWebhook };
