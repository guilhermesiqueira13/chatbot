require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const dialogflow = require("@google-cloud/dialogflow");
const { agendarServico } = require("./agendamentoController");
const {
  formatarDataHorarioBr,
  encontrarHorarioProximo,
  getDateFromWeekdayAndTime,
  listarTodosHorariosDisponiveis,
  listarDiasDisponiveis,
  formatarDiaBr,
} = require("../utils/dataHelpers");
const { normalizarServico } = require("../utils/stringHelpers");
const {
  encontrarOuCriarCliente,
  atualizarNomeCliente,
} = require("./clienteController");
const {
  listarAgendamentosAtivos,
  cancelarAgendamento,
  reagendarAgendamento,
} = require("./gerenciamentoController");
const logger = require("../utils/logger");
const mensagens = require("../utils/mensagensUsuario");

const router = express.Router();

// Configuração do Dialogflow
const sessionClient = new dialogflow.SessionsClient({
  keyFilename: process.env.DIALOGFLOW_KEYFILE, // Caminho para sua chave de serviço do Dialogflow
});
const projectId = process.env.DIALOGFLOW_PROJECT_ID; // ID do seu projeto Dialogflow

// Armazena estados temporários dos agendamentos por usuário
const agendamentosPendentes = new Map();

router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());

// Utilitário para formatar datas e horários no padrão brasileiro

// Mapeamento de serviços válidos e seus IDs no banco de dados
const SERVICOS_VALIDOS = {
  corte: { id: 1, nome: "Corte" },
  cortarcabelo: { id: 1, nome: "Corte" },
  barba: { id: 2, nome: "Barba" },
  fazerbarba: { id: 2, nome: "Barba" },
  sobrancelha: { id: 3, nome: "Sobrancelha" },
  fazersobrancelha: { id: 3, nome: "Sobrancelha" },
};



// --- Rota Principal do Webhook ---
router.post("/webhook", async (req, res) => {
  const msg = req.body.Body || req.body.text;
  const from = req.body.From || req.body.sessionId;
  const profileName = req.body.ProfileName || "Cliente";

  if (!msg || !from) {
    logger.error("Requisição webhook inválida: 'Body' ou 'From' ausentes.");
    return res.status(400).send("Requisição inválida.");
  }

  const msgLower = msg.toLowerCase().trim();
  const sessionId = from;
  const sessionPath = sessionClient.projectAgentSessionPath(
    projectId,
    sessionId
  );
  const request = {
    session: sessionPath,
    queryInput: {
      text: { text: msg, languageCode: "pt-BR" },
    },
  };

  let resposta = "";
  let processamentoConcluido = false; // Nova flag para evitar sobrescrita

  try {
    const [response] = await sessionClient.detectIntent(request);
    let intent = response.queryResult.intent?.displayName || "default";
    const parametros = response.queryResult.parameters?.fields || {};

    let cliente = await encontrarOuCriarCliente(from, profileName);
    const estadoAgendamentoPendente = agendamentosPendentes.get(from);

    // --- Lógica para forçar intents com base no estado ---
    if (estadoAgendamentoPendente) {
      switch (estadoAgendamentoPendente.confirmationStep) {
        case "awaiting_reagendamento_datahora":
          if (intent === "default") {
            intent = "escolha_datahora_reagendamento";
          }
          break;
        case "awaiting_name_choice":
          if (
            ["sim", "manter", "confirmar", "pode agendar", "agendar"].some(
              (k) => msgLower.includes(k)
            )
          ) {
            intent = "confirmar_agendamento_com_nome";
          } else if (
            ["não", "trocar", "outro"].some((k) => msgLower.includes(k))
          ) {
            intent = "pedir_novo_nome";
          }
          break;
        case "awaiting_new_name":
          intent = "salvar_novo_nome";
          break;
        case "confirmar_inicio_reagendamento":
          if (
            ["sim", "confirmar", "quero continuar"].some((k) =>
              msgLower.includes(k)
            )
          ) {
            intent = "confirmar_inicio_reagendamento";
          }
          break;
        case "awaiting_reagendamento_confirmation":
          if (["sim", "confirmar"].some((k) => msgLower.includes(k))) {
            intent = "confirmar_reagendamento";
          } else if (["não", "cancelar"].some((k) => msgLower.includes(k))) {
            resposta =
              "Reagendamento cancelado. Deseja escolher outro horário?";
            estadoAgendamentoPendente.confirmationStep =
              "awaiting_reagendamento_datahora";
            agendamentosPendentes.set(from, estadoAgendamentoPendente);
            processamentoConcluido = true;
            res.json({ reply: resposta });
            return;
          }
          break;
        case "awaiting_day":
          if (intent === "default") {
            intent = "escolha_dia";
          }
          break;
        case "awaiting_time":
          if (intent === "default") {
            intent = "escolha_horario";
          }
          break;
        case "confirmar_horario_proximo":
          if (["sim", "confirmar"].some((k) => msgLower.includes(k))) {
            intent = "confirmar_horario_proximo";
          }
          break;
        case "confirmar_cancelamento": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          logger.info(
            "agendamentosPendentes para from:",
            from,
            agendamentoPendente
          );

          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !== "confirmar_cancelamento"
          ) {
            resposta =
              "Nenhum cancelamento em andamento. Quer cancelar um agendamento?";
            agendamentosPendentes.delete(from);
            processamentoConcluido = true;
            break;
          }

          const isConfirmation = ["sim", "confirmar"].some((k) =>
            msg.toLowerCase().includes(k)
          );

          if (isConfirmation) {
            logger.info(
              "Tentando cancelar agendamento com ID:",
              agendamentoPendente.agendamentoId
            );

            if (!agendamentoPendente.agendamentoId) {
              logger.error("agendamentoId inválido:", agendamentoPendente);
              resposta = "Erro: ID do agendamento inválido. Tente novamente.";
              agendamentosPendentes.delete(from);
              processamentoConcluido = true;
              break;
            }

            try {
              const result = await cancelarAgendamento(
                agendamentoPendente.agendamentoId,
                agendamentoPendente.eventId
              );
              logger.info("Resultado de cancelarAgendamento:", result);

              if (!result || typeof result.success !== "boolean") {
                logger.error("Formato de result inválido:", result);
                resposta =
                  "Ops, algo deu errado ao processar o cancelamento. Tente novamente mais tarde.";
                agendamentosPendentes.delete(from);
                processamentoConcluido = true;
                break;
              }

              if (!result.success) {
                logger.info("Falha no cancelamento:", result.message);
                resposta =
                  result.message ||
                  "Ops, algo deu errado ao cancelar o agendamento. Por favor, tente novamente.";
                resposta +=
                  "\nSe o problema persistir, entre em contato conosco diretamente para obter ajuda.";
                agendamentosPendentes.delete(from);
                processamentoConcluido = true;
                break;
              }

              resposta = `✅ Agendamento de *${agendamentoPendente.servico}* cancelado com sucesso!`;
              agendamentosPendentes.delete(from);
              processamentoConcluido = true;
            } catch (error) {
              console.error('Erro:', error, error && error.stack, JSON.stringify(error));
              logger.error("Erro ao processar cancelamento:", error);
              resposta =
                "Ops, algo deu errado ao processar o cancelamento. Tente novamente mais tarde.";
              agendamentosPendentes.delete(from);
              processamentoConcluido = true;
            }
          } else {
            resposta = "Cancelamento não confirmado. Deseja fazer algo mais?";
            agendamentosPendentes.delete(from);
            processamentoConcluido = true;
          }
          break;
        }
      }
    }
    //processamento da Intent Detectada ---
    if (!processamentoConcluido) {
      switch (intent) {
        case "welcome_intent":
          resposta =
            "Opa, seja bem-vindo à Barbearia!\nQual serviço deseja agendar?\nCorte\nBarba\n\nSe quiser cancelar digite: 'Cancelar'";
          agendamentosPendentes.delete(from); // Garante que nenhum estado antigo atrapalhe
          break;

        case "escolha_servico": {
          const servicoNome = parametros?.servico?.stringValue;
          if (!servicoNome) {
            resposta =
              "Não entendi qual serviço você deseja. Escolha entre Corte, Barba ou Sobrancelha.";
            agendamentosPendentes.delete(from);
            break;
          }

          const servicoNormalizado = normalizarServico(servicoNome);
          const servicoInfo = SERVICOS_VALIDOS[servicoNormalizado];

          if (!servicoInfo) {
            resposta = `Desculpe, o serviço "${servicoNome}" não foi reconhecido. Escolha entre Corte, Barba ou Sobrancelha.`;
            agendamentosPendentes.delete(from);
            break;
          }

          let agendamentoPendente = agendamentosPendentes.get(from) || {
            servicos: [],
            servicoIds: [],
            confirmationStep: "initial",
          };

          // Adiciona o serviço escolhido (evita duplicatas se o usuário repetir)
          if (!agendamentoPendente.servicos.includes(servicoInfo.nome)) {
            agendamentoPendente.servicos.push(servicoInfo.nome);
            // Garante que servicoIds seja um array e adiciona o ID
            agendamentoPendente.servicoIds = Array.isArray(
              agendamentoPendente.servicoIds
            )
              ? agendamentoPendente.servicoIds
              : [];
            agendamentoPendente.servicoIds.push(servicoInfo.id);
          }

          const diasDisponiveis = await listarDiasDisponiveis(14);
          const diasKeys = Object.keys(diasDisponiveis);
          if (!diasKeys.length) {
            resposta =
              "Não temos horários disponíveis no momento. Tente novamente mais tarde!";
            agendamentosPendentes.delete(from);
            break;
          }

          agendamentoPendente.diasDisponiveis = diasDisponiveis;
          agendamentoPendente.diaIndex = 0;
          const listaDias = diasKeys
            .slice(0, 6)
            .map((d) => `- ${formatarDiaBr(d)}`)
            .join("\n");

          resposta =
            `Ótimo! Você escolheu *${agendamentoPendente.servicos.join(
              " e "
            )}*.\nEscolha um dia (agendamos de segunda a sábado). Você pode responder "Quarta" ou "20/06".\n${listaDias}\n\nSe quiser agendar para mais longe, responda: 'Ver mais dias'.`;
          agendamentoPendente.confirmationStep = "awaiting_day";
          agendamentosPendentes.set(from, agendamentoPendente);
          break;
        }

        case "escolha_dia": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !== "awaiting_day" ||
            !agendamentoPendente.diasDisponiveis
          ) {
            resposta =
              "Escolha um serviço antes (Corte, Barba ou Sobrancelha). Qual prefere?";
            agendamentosPendentes.delete(from);
            break;
          }

          const diasKeys = Object.keys(agendamentoPendente.diasDisponiveis);

          const lower = msgLower;
          if (lower.includes("próxima") || lower.includes("mais")) {
            agendamentoPendente.diaIndex += 6;
          } else if (lower.includes("voltar")) {
            agendamentoPendente.diaIndex = Math.max(0, agendamentoPendente.diaIndex - 6);
          } else {
            let escolhido = null;
            const dataParam =
              parametros?.date?.stringValue || parametros?.["date-time"]?.stringValue;
            if (dataParam) {
              const p = new Date(dataParam);
              if (!isNaN(p.getTime())) {
                if (p.getDay() === 0) {
                  resposta = mensagens.DOMINGO_NAO_PERMITIDO;
                  agendamentosPendentes.set(from, agendamentoPendente);
                  break;
                }
                const dataStr = p.toISOString().slice(0, 10);
                if (diasKeys.includes(dataStr)) {
                  escolhido = dataStr;
                }
              }
            }
            if (!escolhido && parametros?.dia_semana?.stringValue) {
              const diaParam = parametros.dia_semana.stringValue.toLowerCase();
              if ("domingo".startsWith(diaParam)) {
                resposta = mensagens.DOMINGO_NAO_PERMITIDO;
                agendamentosPendentes.set(from, agendamentoPendente);
                break;
              }
              escolhido = diasKeys.find((k) => {
                const nome = new Date(k)
                  .toLocaleDateString("pt-BR", { weekday: "long" })
                  .replace("-feira", "")
                  .toLowerCase();
                return nome.startsWith(diaParam);
              });
            }
            if (escolhido) {
              agendamentoPendente.diaEscolhido = escolhido;
              const horariosDia = agendamentoPendente.diasDisponiveis[escolhido];
              agendamentoPendente.confirmationStep = "awaiting_time";
              agendamentosPendentes.set(from, agendamentoPendente);
              resposta = `Ótimo, você escolheu ${formatarDiaBr(escolhido)}. Esses são os horários disponíveis:\n${horariosDia
                .map((h, i) => `- ${h}`)
                .join("\n")}\nDigite o horário desejado ou "Voltar" para escolher outro dia.`;
              break;
            }
          }

          const inicio = agendamentoPendente.diaIndex;
          const listaDias = diasKeys
            .slice(inicio, inicio + 6)
            .map((d) => `- ${formatarDiaBr(d)}`)
            .join("\n");
          resposta =
            `Escolha um dia para agendar seu corte (segunda a sábado). Você pode responder "Quarta" ou "20/06".\n${listaDias}\n\nSe quiser agendar para mais longe, responda: 'Ver mais dias'.`;
          agendamentosPendentes.set(from, agendamentoPendente);
          break;
        }

        case "escolha_horario": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !== "awaiting_time" ||
            !agendamentoPendente.diaEscolhido
          ) {
            resposta =
              "Nenhum agendamento em andamento ou etapa incorreta. Quer agendar um serviço?";
            agendamentosPendentes.delete(from);
            break;
          }

          if (msgLower.includes("voltar")) {
            agendamentoPendente.confirmationStep = "awaiting_day";
            agendamentosPendentes.set(from, agendamentoPendente);
            const diasKeys = Object.keys(agendamentoPendente.diasDisponiveis);
            const listaDias = diasKeys
              .slice(agendamentoPendente.diaIndex, agendamentoPendente.diaIndex + 6)
              .map((d) => `- ${formatarDiaBr(d)}`)
              .join("\n");
            resposta =
              `Escolha um dia para agendar seu corte (segunda a sábado). Você pode responder "Quarta" ou "20/06".\n${listaDias}\n\nSe quiser agendar para mais longe, responda: 'Ver mais dias'.`;
            break;
          }

          const horariosDia =
            agendamentoPendente.diasDisponiveis[agendamentoPendente.diaEscolhido];
          let horaEscolhida = null;
          const ind = parseInt(msg) - 1;
          if (!isNaN(ind) && horariosDia[ind]) {
            horaEscolhida = horariosDia[ind];
          } else if (parametros?.time?.stringValue || parametros?.["date-time"]?.stringValue) {
            const timeStr =
              parametros?.time?.stringValue || parametros?.["date-time"]?.stringValue;
            const t = new Date(timeStr);
            if (!isNaN(t.getTime())) {
              const hora = t.toTimeString().slice(0, 5);
              if (horariosDia.includes(hora)) {
                horaEscolhida = hora;
              }
            }
          }

          if (!horaEscolhida) {
            resposta = `Horário inválido. Tente outro ou digite "Voltar".\n${horariosDia
              .map((h, i) => `${i + 1}. ${h}`)
              .join("\n")}`;
            break;
          }

          agendamentoPendente.dia_horario = `${agendamentoPendente.diaEscolhido}T${horaEscolhida}:00`;
          agendamentoPendente.clienteId = cliente.id;
          agendamentoPendente.nomeSugerido = cliente.nome;
          agendamentoPendente.confirmationStep = "awaiting_name_choice";
          agendamentosPendentes.set(from, agendamentoPendente);
          const horarioFormatadoEscolhido = formatarDataHorarioBr(agendamentoPendente.dia_horario);
          resposta = `Você escolheu *${agendamentoPendente.servicos.join()}* para *${horarioFormatadoEscolhido}*.\nO nome que usaremos para o agendamento é *${
            cliente.nome
          }*.\nGostaria de manter este nome ou informar outro? (Responda 'Sim' ou 'Trocar')`;
          break;
        }

        case "confirmar_agendamento_com_nome": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            (agendamentoPendente.confirmationStep !== "awaiting_name_choice" &&
              agendamentoPendente.confirmationStep !==
                "awaiting_new_name_confirmation") // Permite confirmar após digitar um novo nome
          ) {
            resposta =
              "Nenhum agendamento em andamento ou etapa incorreta. Quer agendar um serviço?";
            agendamentosPendentes.delete(from);
            break;
          }

          // A variável 'cliente' no escopo global do webhook já possui o nome correto.
          const result = await agendarServico({
            clienteId: agendamentoPendente.clienteId,
            clienteNome: cliente.nome,
            servicoNome: agendamentoPendente.servicos.join(", "),
            horario: agendamentoPendente.dia_horario,
          });

          if (!result.success) {
            resposta =
              result.message ||
              "Ops, algo deu errado ao agendar. Tente novamente.";
            agendamentosPendentes.delete(from);
            break;
          }

          const horarioFormatado = formatarDataHorarioBr(
            agendamentoPendente.dia_horario
          );
          resposta = `✅ Agendamento confirmado para *${agendamentoPendente.servicos.join()}* na *${horarioFormatado}*\nNo nome de: *${
            cliente.nome
          }*!`;
          agendamentosPendentes.delete(from);
          break;
        }

        case "pedir_novo_nome": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !== "awaiting_name_choice"
          ) {
            resposta =
              "Não estou esperando um nome agora. Por favor, comece o agendamento novamente.";
            agendamentosPendentes.delete(from);
            break;
          }
          logger.info(agendamentoPendente);
          resposta =
            "Ok, por favor, me diga o nome que você gostaria de usar para o agendamento.";
          agendamentosPendentes.set(from, {
            ...agendamentoPendente,
            confirmationStep: "awaiting_new_name",
          });
          break;
        }

        case "salvar_novo_nome": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !== "awaiting_new_name"
          ) {
            resposta =
              "Não estou esperando um nome agora. Por favor, comece o agendamento novamente.";
            agendamentosPendentes.delete(from);
            break;
          }

          const novoNome = msg.trim();
          if (novoNome.length < 2) {
            resposta =
              "Por favor, me diga um nome válido (com pelo menos 2 caracteres).";
            break;
          }

          const clienteAtualizado = await atualizarNomeCliente(
            agendamentoPendente.clienteId,
            novoNome
          );

          if (clienteAtualizado) {
            // ATUALIZA o objeto 'cliente' global na requisição com o nome recém-salvo
            cliente = clienteAtualizado;

            agendamentoPendente.nomeSugerido = novoNome;
            const horarioFormatado = formatarDataHorarioBr(
              agendamentoPendente.dia_horario
            );
            resposta = `Nome atualizado para *${novoNome}*.\nConfirma o agendamento de *${agendamentoPendente.servicos.join(
              " e "
            )}* para *${horarioFormatado}*? (Responda 'Sim' ou 'Não')`;
            agendamentosPendentes.set(from, {
              ...agendamentoPendente,
              confirmationStep: "awaiting_name_choice", // Volta para a etapa de escolha para confirmar o agendamento com o novo nome
            });
          } else {
            resposta =
              "Não consegui atualizar seu nome. Por favor, tente novamente.";
          }
          break;
        }

        case "reagendar_agendamento": {
          // Cliente já foi obtido no início do webhook.
          let agendamentosAtivos;
          try {
            agendamentosAtivos = await listarAgendamentosAtivos(cliente.id);
          } catch (error) {
            console.error('Erro:', error, error && error.stack, JSON.stringify(error));
            logger.error(
              "ERRO: Erro ao listar agendamentos para reagendamento:",
              error
            );
            resposta =
              "Ops, não conseguimos verificar seus agendamentos. Tente novamente mais tarde.";
            agendamentosPendentes.delete(from);
            break;
          }

          if (!agendamentosAtivos.length) {
            resposta = "Você não tem agendamentos ativos para reagendar.";
            agendamentosPendentes.delete(from);
            break;
          }

          if (agendamentosAtivos.length === 1) {
            const agendamento = agendamentosAtivos[0];
            const horarioFormatado = formatarDataHorarioBr(agendamento.dia_horario);
            resposta = `Você tem um agendamento para *${agendamento.servico}* em *${horarioFormatado}*. Deseja reagendar? Responda 'Sim' ou 'Não'.`;
            agendamentosPendentes.set(from, {
              clienteId: cliente.id,
              agendamentoId: agendamento.id,
              eventId: agendamento.google_event_id,
              servico: agendamento.servico,
              confirmationStep: "confirmar_inicio_reagendamento",
            });
          } else {
            resposta = `Você tem ${agendamentosAtivos.length} agendamentos ativos. Qual deseja reagendar?\n\n`;
            agendamentosAtivos.forEach((agendamento, index) => {
              const horarioFormatado = formatarDataHorarioBr(agendamento.dia_horario);
              resposta += `${index + 1}. *${
                agendamento.servico
              }* em *${horarioFormatado}*\n`;
            });
            resposta += `\nDigite o número do agendamento (exemplo: 1).`;
            agendamentosPendentes.set(from, {
              clienteId: cliente.id,
              agendamentosAtivos,
              confirmationStep: "selecionar_reagendamento",
            });
          }
          break;
        }

        case "selecionar_reagendamento": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !==
              "selecionar_reagendamento" ||
            !agendamentoPendente.agendamentosAtivos
          ) {
            resposta =
              "Nenhum reagendamento em andamento. Quer reagendar um agendamento?";
            agendamentosPendentes.delete(from);
            break;
          }

          const escolhaNumero = parseInt(msg) - 1;
          const agendamentoEscolhido =
            agendamentoPendente.agendamentosAtivos[escolhaNumero];

          if (!isNaN(escolhaNumero) && agendamentoEscolhido) {
            const horarios = await listarTodosHorariosDisponiveis();
            if (!horarios || !horarios.length) {
              resposta =
                "Não temos horários disponíveis no momento. Tente novamente mais tarde!";
              agendamentosPendentes.delete(from);
              break;
            }

            resposta = `Beleza! Você escolheu reagendar o agendamento de *${
              agendamentoEscolhido.servico
            }* em *${formatarDataHorarioBr(
              agendamentoEscolhido.dia_horario
            )}*. Escolha um novo horário:\n\n${horarios
              .map(
                (h, index) => `${index + 1}. *${formatarDataHorarioBr(h.dia_horario)}*`
              )
              .join(
                "\n"
              )}\n\nDigite o número do horário ou informe um dia e horário (exemplo: Sexta 10:00).`;

            agendamentosPendentes.set(from, {
              ...agendamentoPendente,
              agendamentoId: agendamentoEscolhido.id,
              eventId: agendamentoEscolhido.google_event_id,
              servico: agendamentoEscolhido.servico,
              confirmationStep: "awaiting_reagendamento_datahora",
              agendamentosAtivos: undefined, // Limpa agendamentosAtivos para evitar uso incorreto
            });
          } else {
            resposta = `Escolha um número válido do agendamento que deseja reagendar.`;
          }
          break;
        }

        case "confirmar_inicio_reagendamento": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !==
              "confirmar_inicio_reagendamento"
          ) {
            resposta =
              "Nenhum reagendamento em andamento. Quer reagendar um agendamento?";
            agendamentosPendentes.delete(from);
            break;
          }

          const isConfirmation = ["sim", "confirmar", "quero continuar"].some(
            (k) => msg.toLowerCase().includes(k)
          );

          if (isConfirmation) {
            const horarios = await listarTodosHorariosDisponiveis();
            if (!horarios || !horarios.length) {
              resposta =
                "Não temos horários disponíveis no momento. Tente novamente mais tarde!";
              agendamentosPendentes.delete(from);
              break;
            }

            resposta = `Beleza! Escolha um novo horário:\n\n${horarios
              .map(
                (h, index) => `${index + 1}. *${formatarDataHorarioBr(h.dia_horario)}*`
              )
              .join(
                "\n"
              )}\n\nDigite o número do horário ou informe um dia e horário (exemplo: Sexta 10:00).`;
            agendamentoPendente.confirmationStep =
              "awaiting_reagendamento_datahora";
            agendamentosPendentes.set(from, agendamentoPendente);
          } else {
            resposta = "Reagendamento cancelado. Deseja fazer algo mais?";
            agendamentosPendentes.delete(from);
          }
          break;
        }

        case "escolha_datahora_reagendamento": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !==
              "awaiting_reagendamento_datahora"
          ) {
            resposta =
              "Nenhum reagendamento em andamento. Quer reagendar um agendamento?";
            agendamentosPendentes.delete(from);
            break;
          }

          const horarios = await listarTodosHorariosDisponiveis();
          if (!horarios || !horarios.length) {
            resposta =
              "Não temos horários disponíveis no momento. Tente novamente mais tarde!";
            agendamentosPendentes.delete(from);
            break;
          }

          let diaHorario;
          const escolhaNumero = parseInt(msg) - 1;
          let dataSolicitada = null;

          if (!isNaN(escolhaNumero) && horarios[escolhaNumero]) {
            diaHorario = horarios[escolhaNumero].dia_horario;
          } else {
            const diaSemanaMatch = msg
              .toLowerCase()
              .match(/(segunda|terça|quarta|quinta|sexta|sábado|domingo)/);
            const horaMatch = msg.match(
              /\d{1,2}(?::\d{2})?(?:\s*(?:h|horas?|às))?/i
            );
            const diaSemanaParam =
              parametros?.dia_semana?.stringValue?.toLowerCase();

            if ((diaSemanaMatch || diaSemanaParam) && horaMatch) {
              const diaSemanaForParse = diaSemanaParam || diaSemanaMatch[0];
              dataSolicitada = getDateFromWeekdayAndTime(
                diaSemanaForParse,
                horaMatch[0].replace(/h|horas?|às/i, "").trim()
              );
            } else if (parametros?.["date-time"]?.stringValue) {
              dataSolicitada = new Date(parametros["date-time"].stringValue);
            } else if (msg.match(/\d{1,2}:\d{2}/)) {
              const [hora, minuto = "00"] = msg
                .match(/\d{1,2}:\d{2}/)[0]
                .split(":");
              dataSolicitada = new Date();
              dataSolicitada.setHours(
                parseInt(hora, 10),
                parseInt(minuto, 10),
                0,
                0
              );
              if (dataSolicitada < new Date()) {
                dataSolicitada.setDate(dataSolicitada.getDate() + 1);
              }
            }

            if (dataSolicitada && !isNaN(dataSolicitada.getTime())) {
              if (dataSolicitada.getDay() === 0) {
                resposta = mensagens.DOMINGO_NAO_PERMITIDO;
                agendamentosPendentes.set(from, agendamentoPendente);
                break;
              }

              const diaDaSemanaFormatado = dataSolicitada
                .toLocaleDateString("pt-BR", { weekday: "long" })
                .toLowerCase();
              const horaFormatada = dataSolicitada.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });

              const horarioExato = horarios.find(
                (h) => new Date(h.dia_horario).getTime() === dataSolicitada.getTime()
              );

              if (horarioExato) {
                diaHorario = horarioExato.dia_horario;
              } else {
                const horarioMaisProximo = encontrarHorarioProximo(
                  dataSolicitada.toISOString(),
                  horarios
                );
                if (horarioMaisProximo) {
                  resposta = `O horário *${diaDaSemanaFormatado} às ${horaFormatada}* não está disponível. O mais próximo é *${formatarDataHorarioBr(
                    horarioMaisProximo.dia_horario
                  )}*. Deseja escolher este? Responda 'Sim' ou escolha outro horário.`;
                  agendamentosPendentes.set(from, {
                    ...agendamentoPendente,
                    confirmationStep: "confirmar_horario_proximo",
                    diaHorarioProximo: horarioMaisProximo.dia_horario,
                  });
                  break;
                } else {
                  resposta = `Nenhum horário disponível próximo a *${diaDaSemanaFormatado} às ${horaFormatada}*. Escolha outro:\n\n${horarios
                    .map((h, index) => `${index + 1}. *${formatarDataHorarioBr(h.dia_horario)}*`)
                    .join("\n")}\n\nOu use o formato 'Sexta 10:00'.`;
                  break;
                }
              }
            } else {
              resposta = `Formato inválido. Escolha um horário da lista:\n\n${horarios
                .map(
                  (h, index) => `${index + 1}. *${formatarDataHorarioBr(h.dia_horario)}*`
                )
                .join("\n")}\n\nOu use o formato 'Sexta 10:00'.`;
              break;
            }
          }

          agendamentoPendente.dia_horario = diaHorario;
          agendamentoPendente.confirmationStep =
            "awaiting_reagendamento_confirmation";
          agendamentosPendentes.set(from, agendamentoPendente);

          const horarioFormatado = formatarDataHorarioBr(diaHorario);
          resposta = `Você escolheu reagendar *${agendamentoPendente.servico}* para *${horarioFormatado}*. Confirma? Responda 'Sim' ou 'Não'.`;
          break;
        }

        case "confirmar_reagendamento": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !==
              "awaiting_reagendamento_confirmation"
          ) {
            resposta =
              "Nenhum reagendamento em andamento. Quer reagendar um agendamento?";
            agendamentosPendentes.delete(from);
            break;
          }

          const isConfirmation = ["sim", "confirmar"].some((k) =>
            msg.toLowerCase().includes(k)
          );

          if (isConfirmation) {
            const result = await reagendarAgendamento(
              agendamentoPendente.agendamentoId,
              agendamentoPendente.dia_horario,
              agendamentoPendente.eventId
            );

            if (!result.success) {
              resposta =
                result.message ||
                "Ops, algo deu errado ao reagendar. Tente novamente.";
              agendamentosPendentes.delete(from);
              break;
            }

            const horarioFormatado = formatarDataHorarioBr(
              agendamentoPendente.dia_horario
            );
            resposta = `✅ Agendamento reagendado para *${agendamentoPendente.servico}* em *${horarioFormatado}*!`;
            agendamentosPendentes.delete(from);
          } else {
            resposta =
              "Reagendamento cancelado. Deseja escolher outro horário?";
            agendamentoPendente.confirmationStep =
              "awaiting_reagendamento_datahora"; // Permite que o usuário escolha outro horário imediatamente
            agendamentosPendentes.set(from, agendamentoPendente);
          }
          break;
        }

        case "confirmar_horario_proximo": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !== "confirmar_horario_proximo" ||
            !agendamentoPendente.diaHorarioProximo
          ) {
            resposta =
              "Nenhuma sugestão de horário próximo para confirmar. Por favor, tente novamente.";
            agendamentosPendentes.delete(from);
            break;
          }

          const isConfirmation = ["sim", "confirmar"].some((k) =>
            msg.toLowerCase().includes(k)
          );

          if (isConfirmation) {
            agendamentoPendente.dia_horario =
              agendamentoPendente.diaHorarioProximo;

            if (agendamentoPendente.agendamentoId) {
              // Se for um reagendamento
              agendamentoPendente.confirmationStep =
                "awaiting_reagendamento_confirmation";
              const horarioFormatado = formatarDataHorarioBr(
                agendamentoPendente.dia_horario
              );
              resposta = `Você escolheu reagendar *${agendamentoPendente.servico}* para *${horarioFormatado}*. Confirma? Responda 'Sim' ou 'Não'.`;
            } else {
              // Se for um novo agendamento
              agendamentoPendente.confirmationStep = "awaiting_name_choice";
              // 'cliente' já está no escopo global do webhook com os dados atualizados
              agendamentoPendente.clienteId = cliente.id;
              agendamentoPendente.nomeSugerido = cliente.nome;
              const horarioFormatado = formatarDataHorarioBr(
                agendamentoPendente.dia_horario
              );
              resposta = `Você escolheu *${agendamentoPendente.servicos.join(
                " e "
              )}* para *${horarioFormatado}*.\nO nome que usaremos para o agendamento é *${
                cliente.nome
              }*.\nGostaria de manter este nome ou informar outro? (Responda 'Sim' ou 'Trocar')`;
            }
            agendamentosPendentes.set(from, agendamentoPendente);
          } else {
            // Se o usuário não quiser o horário próximo, oferece a lista novamente
            const horarios = await listarTodosHorariosDisponiveis();
            resposta = `Ok, escolha outro horário:\n\n${horarios
              .map(
                (h, index) => `${index + 1}. *${formatarDataHorarioBr(h.dia_horario)}*`
              )
              .join("\n")}\n\nOu use o formato 'Sexta 10:00'.`;

            agendamentoPendente.confirmationStep =
              agendamentoPendente.agendamentoId
                ? "awaiting_reagendamento_datahora" // Volta para escolha de horário para reagendamento
                : "awaiting_time"; // Volta para escolha de horário para novo agendamento
            delete agendamentoPendente.diaHorarioProximo;
            agendamentosPendentes.set(from, agendamentoPendente);
          }
          break;
        }

        case "cancelar_agendamento": {
          // 'cliente' já está no escopo global do webhook com os dados atualizados
          let agendamentosAtivos;
          try {
            agendamentosAtivos = await listarAgendamentosAtivos(cliente.id);
          } catch (error) {
            console.error('Erro:', error, error && error.stack, JSON.stringify(error));
            logger.error(
              "ERRO: Erro ao listar agendamentos para cancelamento:",
              error
            );
            resposta =
              "Ops, não conseguimos verificar seus agendamentos. Tente novamente mais tarde.";
            agendamentosPendentes.delete(from);
            break;
          }

          if (!agendamentosAtivos.length) {
            resposta = "Você não tem agendamentos ativos para cancelar.";
            agendamentosPendentes.delete(from);
            break;
          }

          if (agendamentosAtivos.length === 1) {
            const agendamento = agendamentosAtivos[0];
            const horarioFormatado = formatarDataHorarioBr(agendamento.dia_horario);
            resposta = `Você tem um agendamento para *${agendamento.servico}* em *${horarioFormatado}*. Deseja cancelar? Responda 'Sim' ou 'Não'.`;
            agendamentosPendentes.set(from, {
              clienteId: cliente.id,
              agendamentoId: agendamento.id,
              eventId: agendamento.google_event_id,
              servico: agendamento.servico,
              confirmationStep: "confirmar_cancelamento",
            });
          } else {
            resposta = `Você tem ${agendamentosAtivos.length} agendamentos ativos. Qual deseja cancelar?\n\n`;
            agendamentosAtivos.forEach((agendamento, index) => {
              const horarioFormatado = formatarDataHorarioBr(agendamento.dia_horario);
              resposta += `${index + 1}. *${
                agendamento.servico
              }* em *${horarioFormatado}*\n`;
            });
            resposta += `\nDigite o número do agendamento (exemplo: 1).`;
            agendamentosPendentes.set(from, {
              clienteId: cliente.id,
              agendamentosAtivos,
              confirmationStep: "selecionar_cancelamento",
            });
          }
          break;
        }

        case "selecionar_cancelamento": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          if (
            !agendamentoPendente ||
            agendamentoPendente.confirmationStep !==
              "selecionar_cancelamento" ||
            !agendamentoPendente.agendamentosAtivos
          ) {
            resposta =
              "Nenhum cancelamento em andamento. Quer cancelar um agendamento?";
            agendamentosPendentes.delete(from);
            break;
          }

          const escolhaNumero = parseInt(msg) - 1;
          const agendamentoEscolhido =
            agendamentoPendente.agendamentosAtivos[escolhaNumero];

          if (!isNaN(escolhaNumero) && agendamentoEscolhido) {
            const horarioFormatado = formatarDataHorarioBr(
              agendamentoEscolhido.dia_horario
            );
            resposta = `Você escolheu cancelar o agendamento de *${agendamentoEscolhido.servico}* em *${horarioFormatado}*. Confirma o cancelamento? Responda 'Sim' ou 'Não'.`;
            agendamentosPendentes.set(from, {
              ...agendamentoPendente,
              agendamentoId: agendamentoEscolhido.id,
              eventId: agendamentoEscolhido.google_event_id,
              servico: agendamentoEscolhido.servico,
              confirmationStep: "confirmar_cancelamento",
              agendamentosAtivos: undefined, // Limpa agendamentosAtivos
            });
          } else {
            resposta = `Escolha um número válido do agendamento que deseja cancelar.`;
          }
          break;
        }

        // Tratamento para a intent 'confirmar_agendamento' (caso seja detectada de forma inesperada)
        case "confirmar_agendamento":
          resposta =
            "Desculpe, não entendi o que você quer confirmar. Por favor, comece o agendamento novamente.";
          agendamentosPendentes.delete(from);
          break;

        default:
          // Se a intent for 'default' do Dialogflow e não houver um estado ativo,
          // ou se o estado não foi tratado pelas lógicas acima, usa o fulfillmentText ou uma mensagem genérica.
          resposta =
            response.queryResult.fulfillmentText ||
            "Desculpe, não entendi. Pode repetir, por favor?";
          if (!estadoAgendamentoPendente) {
            // Limpa o estado se não houver um fluxo ativo
            agendamentosPendentes.delete(from);
          }
          break;
      }
    }
    logger.info("Resposta FINAL a ser enviada ao usuário:", resposta);
    res.json({ reply: resposta });
  } catch (error) {
    // Captura erros globais do webhook
    console.error('Erro:', error, error && error.stack, JSON.stringify(error));
    logger.error("ERRO GERAL no Dialogflow ou webhook:", error);
    res.json({ reply: "Ops, algo deu errado. Tente novamente?" });
  }
});

module.exports = router;
