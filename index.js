require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const dialogflow = require("@google-cloud/dialogflow");
const { agendarServico } = require("./controllers/agendamentoController");
const {
  formatarDataHorarioBr,
  encontrarHorarioProximo,
  getDateFromWeekdayAndTime,
  listarTodosHorariosDisponiveis,
} = require("./utils/dataHelpers");
const { normalizarServico } = require("./utils/stringHelpers");
const {
  encontrarOuCriarCliente,
  atualizarNomeCliente,
} = require("./controllers/clienteController");
const {
  listarAgendamentosAtivos,
  cancelarAgendamento,
  reagendarAgendamento,
} = require("./controllers/gerenciamentoController");
const logger = require("./utils/logger");
const mensagens = require("./utils/mensagensUsuario");
const originValidator = require("./middlewares/originValidator");

const app = express();
const port = process.env.PORT || 3000;

// Configuração do Dialogflow
const sessionClient = new dialogflow.SessionsClient({
  keyFilename: process.env.DIALOGFLOW_KEYFILE, // Caminho para sua chave de serviço do Dialogflow
});
const projectId = process.env.DIALOGFLOW_PROJECT_ID; // ID do seu projeto Dialogflow

// Armazena estados temporários dos agendamentos por usuário
const agendamentosPendentes = new Map();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const agendamentoRoutes = require("./routes/agendamentoRoutes");
const clienteRoutes = require("./routes/clienteRoutes");

app.use("/api/agendamento", agendamentoRoutes);
app.use("/api/clientes", clienteRoutes);

// Usa utilitário de formatação em pt-BR
const formatarData = formatarDataHorarioBr;

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
app.post("/webhook", originValidator, async (req, res, next) => {
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
            resposta = mensagens.REAGENDAMENTO_CANCELADO;
            estadoAgendamentoPendente.confirmationStep =
              "awaiting_reagendamento_datahora";
            agendamentosPendentes.set(from, estadoAgendamentoPendente);
            processamentoConcluido = true;
            res.json({ reply: resposta });
            return;
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
            resposta = mensagens.NENHUM_CANCELAMENTO;
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
                agendamentoPendente.agendamentoId
              );
              logger.info("Resultado de cancelarAgendamento:", result);

              if (!result || typeof result.success !== "boolean") {
                logger.error("Formato de result inválido:", result);
                resposta = mensagens.ERRO_PROCESSAR_CANCELAMENTO;
                agendamentosPendentes.delete(from);
                processamentoConcluido = true;
                break;
              }

              if (!result.success) {
                logger.info("Falha no cancelamento:", result.message);
                resposta =
                  result.message ||
                  mensagens.ERRO_CANCELAR_AGENDAMENTO;
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
              logger.error("Erro ao processar cancelamento:", error);
              resposta = mensagens.ERRO_PROCESSAR_CANCELAMENTO;
              agendamentosPendentes.delete(from);
              processamentoConcluido = true;
            }
          } else {
            resposta = mensagens.CANCELAMENTO_NAO_CONFIRMADO;
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
          resposta = mensagens.BEM_VINDO;
          agendamentosPendentes.delete(from); // Garante que nenhum estado antigo atrapalhe
          break;

        case "escolha_servico": {
          const servicoNome = parametros?.servico?.stringValue;
          if (!servicoNome) {
            resposta = mensagens.SERVICO_NAO_ENTENDIDO;
            agendamentosPendentes.delete(from);
            break;
          }

          const servicoNormalizado = normalizarServico(servicoNome);
          const servicoInfo = SERVICOS_VALIDOS[servicoNormalizado];

          if (!servicoInfo) {
            resposta = mensagens.servicoNaoReconhecido(servicoNome);
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

          const horarios = await listarTodosHorariosDisponiveis();
          // Verifica se há horários ou se a busca falhou
          if (!horarios || !horarios.length) {
            resposta = mensagens.SEM_HORARIOS_DISPONIVEIS;
            agendamentosPendentes.delete(from);
            break;
          }

          resposta = `Ótimo! Você escolheu *${agendamentoPendente.servicos.join(
            " e "
          )}*.\nHorários disponíveis:\n\n${horarios
            .map((h, index) => `${index + 1}. *${formatarData(h.dia_horario)}*`)
            .join(
              "\n"
            )}\n\nDigite o número do horário desejado ou informe um dia e horário (exemplo: Sexta 10:00).`;
          agendamentoPendente.confirmationStep = "awaiting_date_time";
          agendamentosPendentes.set(from, agendamentoPendente);
          break;
        }

        case "escolha_datahora": {
          const agendamentoPendente = agendamentosPendentes.get(from);
          // Valida se há um agendamento em andamento e serviços selecionados
          if (
            !agendamentoPendente ||
            !agendamentoPendente.servicos.length ||
            !Array.isArray(agendamentoPendente.servicoIds) ||
            !agendamentoPendente.servicoIds.length
          ) {
            resposta = mensagens.ESCOLHA_SERVICO_PRIMEIRO;
            agendamentosPendentes.delete(from);
            break;
          }

          const horarios = await listarTodosHorariosDisponiveis();
          if (!horarios || !horarios.length) {
            resposta = mensagens.SEM_HORARIOS_DISPONIVEIS;
            agendamentosPendentes.delete(from);
            break;
          }

          let diaHorario;
          const escolhaNumero = parseInt(msg) - 1; // Ajusta para índice 0
          let dataSolicitada = null;

          if (!isNaN(escolhaNumero) && horarios[escolhaNumero]) {
            // Usuário escolheu por número
            diaHorario = horarios[escolhaNumero].dia_horario;
          } else {
            // Usuário tentou informar dia e hora
            const diaSemanaMatch = msg
              .toLowerCase()
              .match(/(segunda|terça|quarta|quinta|sexta|sábado|domingo)/);
            const horaMatch = msg.match(
              /\d{1,2}(?::\d{2})?(?:\s*(?:h|horas?|às))?/i
            );

            if (diaSemanaMatch && horaMatch) {
              dataSolicitada = getDateFromWeekdayAndTime(
                diaSemanaMatch[0],
                horaMatch[0].replace(/h|horas?|às/i, "").trim()
              );
            } else if (parametros?.["date-time"]?.stringValue) {
              // Se o Dialogflow detectou um @sys.date-time
              dataSolicitada = new Date(parametros["date-time"].stringValue);
            } else if (msg.match(/\d{1,2}:\d{2}/)) {
              // Se o usuário digitou apenas um horário (ex: "10:00")
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
              // Se o horário já passou hoje, sugere para o dia seguinte
              if (dataSolicitada < new Date()) {
                dataSolicitada.setDate(dataSolicitada.getDate() + 1);
              }
            }

            if (dataSolicitada && !isNaN(dataSolicitada.getTime())) {
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
                  resposta = `O horário *${diaDaSemanaFormatado} às ${horaFormatada}* não está disponível. O mais próximo é *${formatarData(
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
                    .map((h, index) => `${index + 1}. *${formatarData(h.dia_horario)}*`)
                    .join("\n")}\n\nOu use o formato 'Sexta 10:00'.`;
                  break;
                }
              }
            } else {
              resposta = `Formato inválido. Por favor, escolha um número da lista ou informe um dia e horário (exemplo: Sexta 10:00).\n\nHorários disponíveis:\n\n${horarios
                .map(
                  (h, index) => `${index + 1}. *${formatarData(h.dia_horario)}*`
                )
                .join("\n")}`;
              break;
            }
          }

          // Se um horário válido foi escolhido/encontrado, atualiza o estado
          agendamentoPendente.dia_horario = diaHorario;

          // O objeto 'cliente' já está atualizado no início do webhook
          agendamentoPendente.clienteId = cliente.id;
          agendamentoPendente.nomeSugerido = cliente.nome;

          agendamentoPendente.confirmationStep = "awaiting_name_choice";
          agendamentosPendentes.set(from, agendamentoPendente);

          const horarioFormatado = formatarData(diaHorario);
          resposta = `Você escolheu *${agendamentoPendente.servicos.join()}* para *${horarioFormatado}*.\nO nome que usaremos para o agendamento é *${
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
            resposta = mensagens.NAO_AGENDAMENTO_ANDAMENTO;
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
            resposta = result.message || mensagens.ERRO_AGENDAR;
            agendamentosPendentes.delete(from);
            break;
          }

          const horarioFormatado = formatarData(
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
            resposta = mensagens.NAO_ESPERANDO_NOME;
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
            resposta = mensagens.NAO_ESPERANDO_NOME;
            agendamentosPendentes.delete(from);
            break;
          }

          const novoNome = msg.trim();
          if (novoNome.length < 2) {
            resposta = mensagens.NOME_INVALIDO;
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
            const horarioFormatado = formatarData(
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
            resposta = mensagens.ERRO_ATUALIZAR_NOME;
          }
          break;
        }

        case "reagendar_agendamento": {
          // Cliente já foi obtido no início do webhook.
          let agendamentosAtivos;
          try {
            agendamentosAtivos = await listarAgendamentosAtivos(cliente.id);
          } catch (error) {
            logger.error(
              "ERRO: Erro ao listar agendamentos para reagendamento:",
              error
            );
            resposta = mensagens.ERRO_VERIFICAR_AGENDAMENTOS;
            agendamentosPendentes.delete(from);
            break;
          }

          if (!agendamentosAtivos.length) {
            resposta = mensagens.SEM_AGENDAMENTOS_REAGENDAR;
            agendamentosPendentes.delete(from);
            break;
          }

          if (agendamentosAtivos.length === 1) {
            const agendamento = agendamentosAtivos[0];
            const horarioFormatado = formatarData(agendamento.dia_horario);
            resposta = `Você tem um agendamento para *${agendamento.servico}* em *${horarioFormatado}*. Deseja reagendar? Responda 'Sim' ou 'Não'.`;
            agendamentosPendentes.set(from, {
              clienteId: cliente.id,
              agendamentoId: agendamento.id,
              servico: agendamento.servico,
              confirmationStep: "confirmar_inicio_reagendamento",
            });
          } else {
            resposta = `Você tem ${agendamentosAtivos.length} agendamentos ativos. Qual deseja reagendar?\n\n`;
            agendamentosAtivos.forEach((agendamento, index) => {
              const horarioFormatado = formatarData(agendamento.dia_horario);
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
            resposta = mensagens.NENHUM_REAGENDAMENTO;
            agendamentosPendentes.delete(from);
            break;
          }

          const escolhaNumero = parseInt(msg) - 1;
          const agendamentoEscolhido =
            agendamentoPendente.agendamentosAtivos[escolhaNumero];

          if (!isNaN(escolhaNumero) && agendamentoEscolhido) {
            const horarios = await listarTodosHorariosDisponiveis();
            if (!horarios || !horarios.length) {
              resposta = mensagens.SEM_HORARIOS_DISPONIVEIS;
              agendamentosPendentes.delete(from);
              break;
            }

            resposta = `Beleza! Você escolheu reagendar o agendamento de *${
              agendamentoEscolhido.servico
            }* em *${formatarData(
              agendamentoEscolhido.dia_horario
            )}*. Escolha um novo horário:\n\n${horarios
              .map(
                (h, index) => `${index + 1}. *${formatarData(h.dia_horario)}*`
              )
              .join(
                "\n"
              )}\n\nDigite o número do horário ou informe um dia e horário (exemplo: Sexta 10:00).`;

            agendamentosPendentes.set(from, {
              ...agendamentoPendente,
              agendamentoId: agendamentoEscolhido.id,
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
            resposta = mensagens.NENHUM_REAGENDAMENTO;
            agendamentosPendentes.delete(from);
            break;
          }

          const isConfirmation = ["sim", "confirmar", "quero continuar"].some(
            (k) => msg.toLowerCase().includes(k)
          );

          if (isConfirmation) {
            const horarios = await listarTodosHorariosDisponiveis();
            if (!horarios || !horarios.length) {
              resposta = mensagens.SEM_HORARIOS_DISPONIVEIS;
              agendamentosPendentes.delete(from);
              break;
            }

            resposta = `Beleza! Escolha um novo horário:\n\n${horarios
              .map(
                (h, index) => `${index + 1}. *${formatarData(h.dia_horario)}*`
              )
              .join(
                "\n"
              )}\n\nDigite o número do horário ou informe um dia e horário (exemplo: Sexta 10:00).`;
            agendamentoPendente.confirmationStep =
              "awaiting_reagendamento_datahora";
            agendamentosPendentes.set(from, agendamentoPendente);
          } else {
            resposta = mensagens.REAGENDAMENTO_CANCELADO;
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
            resposta = mensagens.NENHUM_REAGENDAMENTO;
            agendamentosPendentes.delete(from);
            break;
          }

          const horarios = await listarTodosHorariosDisponiveis();
          if (!horarios || !horarios.length) {
            resposta = mensagens.SEM_HORARIOS_DISPONIVEIS;
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
                  resposta = `O horário *${diaDaSemanaFormatado} às ${horaFormatada}* não está disponível. O mais próximo é *${formatarData(
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
                    .map((h, index) => `${index + 1}. *${formatarData(h.dia_horario)}*`)
                    .join("\n")}\n\nOu use o formato 'Sexta 10:00'.`;
                  break;
                }
              }
            } else {
              resposta = `Formato inválido. Escolha um horário da lista:\n\n${horarios
                .map(
                  (h, index) => `${index + 1}. *${formatarData(h.dia_horario)}*`
                )
                .join("\n")}\n\nOu use o formato 'Sexta 10:00'.`;
              break;
            }
          }

          agendamentoPendente.dia_horario = diaHorario;
          agendamentoPendente.confirmationStep =
            "awaiting_reagendamento_confirmation";
          agendamentosPendentes.set(from, agendamentoPendente);

          const horarioFormatado = formatarData(diaHorario);
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
            resposta = mensagens.NENHUM_REAGENDAMENTO;
            agendamentosPendentes.delete(from);
            break;
          }

          const isConfirmation = ["sim", "confirmar"].some((k) =>
            msg.toLowerCase().includes(k)
          );

          if (isConfirmation) {
            const result = await reagendarAgendamento(
              agendamentoPendente.agendamentoId,
              agendamentoPendente.dia_horario
            );

            if (!result.success) {
              resposta =
                result.message ||
                mensagens.ERRO_REAGENDAR;
              agendamentosPendentes.delete(from);
              break;
            }

            const horarioFormatado = formatarData(
              agendamentoPendente.dia_horario
            );
            resposta = `✅ Agendamento reagendado para *${agendamentoPendente.servico}* em *${horarioFormatado}*!`;
            agendamentosPendentes.delete(from);
          } else {
            resposta = mensagens.REAGENDAMENTO_CANCELADO;
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
              const horarioFormatado = formatarData(
                agendamentoPendente.dia_horario
              );
              resposta = `Você escolheu reagendar *${agendamentoPendente.servico}* para *${horarioFormatado}*. Confirma? Responda 'Sim' ou 'Não'.`;
            } else {
              // Se for um novo agendamento
              agendamentoPendente.confirmationStep = "awaiting_name_choice";
              // 'cliente' já está no escopo global do webhook com os dados atualizados
              agendamentoPendente.clienteId = cliente.id;
              agendamentoPendente.nomeSugerido = cliente.nome;
              const horarioFormatado = formatarData(
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
                (h, index) => `${index + 1}. *${formatarData(h.dia_horario)}*`
              )
              .join("\n")}\n\nOu use o formato 'Sexta 10:00'.`;

            agendamentoPendente.confirmationStep =
              agendamentoPendente.agendamentoId
                ? "awaiting_reagendamento_datahora" // Volta para escolha de horário para reagendamento
                : "awaiting_date_time"; // Volta para escolha de horário para novo agendamento
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
            logger.error(
              "ERRO: Erro ao listar agendamentos para cancelamento:",
              error
            );
            resposta = mensagens.ERRO_VERIFICAR_AGENDAMENTOS;
            agendamentosPendentes.delete(from);
            break;
          }

          if (!agendamentosAtivos.length) {
            resposta = mensagens.SEM_AGENDAMENTOS_CANCELAR;
            agendamentosPendentes.delete(from);
            break;
          }

          if (agendamentosAtivos.length === 1) {
            const agendamento = agendamentosAtivos[0];
            const horarioFormatado = formatarData(agendamento.dia_horario);
            resposta = `Você tem um agendamento para *${agendamento.servico}* em *${horarioFormatado}*. Deseja cancelar? Responda 'Sim' ou 'Não'.`;
            agendamentosPendentes.set(from, {
              clienteId: cliente.id,
              agendamentoId: agendamento.id,
              servico: agendamento.servico,
              confirmationStep: "confirmar_cancelamento",
            });
          } else {
            resposta = `Você tem ${agendamentosAtivos.length} agendamentos ativos. Qual deseja cancelar?\n\n`;
            agendamentosAtivos.forEach((agendamento, index) => {
              const horarioFormatado = formatarData(agendamento.dia_horario);
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
            resposta = mensagens.NENHUM_CANCELAMENTO;
            agendamentosPendentes.delete(from);
            break;
          }

          const escolhaNumero = parseInt(msg) - 1;
          const agendamentoEscolhido =
            agendamentoPendente.agendamentosAtivos[escolhaNumero];

          if (!isNaN(escolhaNumero) && agendamentoEscolhido) {
            const horarioFormatado = formatarData(
              agendamentoEscolhido.dia_horario
            );
            resposta = `Você escolheu cancelar o agendamento de *${agendamentoEscolhido.servico}* em *${horarioFormatado}*. Confirma o cancelamento? Responda 'Sim' ou 'Não'.`;
            agendamentosPendentes.set(from, {
              ...agendamentoPendente,
              agendamentoId: agendamentoEscolhido.id,
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
          resposta = mensagens.CONFIRMAR_DESCONHECIDO;
          agendamentosPendentes.delete(from);
          break;

        default:
          // Se a intent for 'default' do Dialogflow e não houver um estado ativo,
          // ou se o estado não foi tratado pelas lógicas acima, usa o fulfillmentText ou uma mensagem genérica.
          resposta =
            response.queryResult.fulfillmentText ||
            mensagens.NAO_ENTENDI;
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
    // Propaga erros não tratados para o middleware global
    logger.error("ERRO GERAL no Dialogflow ou webhook:", error);
    next(error);
  }
});

// Middleware global de tratamento de erros
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  const status = err.status || 500;
  const message = err.message || mensagens.ERRO_GERAL;
  res.status(status).json({ error: message });
});

app.listen(port, () => {
  logger.info(`🚀 Servidor rodando em http://localhost:${port}`);
});
