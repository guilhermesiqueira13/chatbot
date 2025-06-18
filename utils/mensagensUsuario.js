const MENSAGENS = {
  BEM_VINDO:
    "Opa! Bem-vindo à Barbearia. Realizamos agendamentos de segunda a sábado. Qual serviço deseja? Corte, Barba ou Sobrancelha.\n(Envie 'Cancelar' para sair)",
  SERVICO_NAO_ENTENDIDO:
    "Não entendi qual serviço você deseja. Escolha entre Corte, Barba ou Sobrancelha.",
  servicoNaoReconhecido: (nome) =>
    `Desculpe, o serviço "${nome}" não foi reconhecido. Escolha entre Corte, Barba ou Sobrancelha.`,
  ESCOLHA_SERVICO_PRIMEIRO:
    "Escolha um serviço antes (Corte, Barba ou Sobrancelha). Qual prefere?",
  SEM_HORARIOS_DISPONIVEIS:
    "Não temos horários disponíveis no momento. Tente novamente mais tarde!",
  DOMINGO_NAO_PERMITIDO:
    "Não realizamos agendamentos aos domingos. Trabalhamos apenas de segunda a sábado.",
  HORARIO_INVALIDO:
    "Horário inválido ou fora do nosso expediente (09h às 18h). Escolha um dos horários disponíveis listados acima.",
  NAO_AGENDAMENTO_ANDAMENTO:
    "Nenhum agendamento em andamento ou etapa incorreta. Quer agendar um serviço?",
  NAO_ESPERANDO_NOME:
    "Não estou esperando um nome agora. Por favor, comece o agendamento novamente.",
  NOME_INVALIDO:
    "Por favor, me diga um nome válido (com pelo menos 2 caracteres).",
  ERRO_ATUALIZAR_NOME:
    "Não consegui atualizar seu nome. Por favor, tente novamente.",
  ERRO_AGENDAR:
    "Ops, algo deu errado ao agendar. Tente novamente.",
  ERRO_REAGENDAR:
    "Ops, algo deu errado ao reagendar. Tente novamente.",
  ERRO_VERIFICAR_AGENDAMENTOS:
    "Ops, não conseguimos verificar seus agendamentos. Tente novamente mais tarde.",
  SEM_AGENDAMENTOS_REAGENDAR:
    "Você não tem agendamentos ativos para reagendar.",
  NENHUM_REAGENDAMENTO:
    "Nenhum reagendamento em andamento. Quer reagendar um agendamento?",
  REAGENDAMENTO_CANCELADO:
    "Reagendamento cancelado. Deseja escolher outro horário?",
  FLUXO_REAGENDAMENTO_EM_ANDAMENTO:
    "Estamos no fluxo de reagendamento. Escolha uma das opções apresentadas ou envie 'Cancelar' para sair.",
  CLIENTE_NAO_ENCONTRADO:
    "Não encontramos seu cadastro. Por favor realize um agendamento primeiro.",
  SEM_AGENDAMENTOS_CANCELAR:
    "Você não tem agendamentos ativos para cancelar.",
  NENHUM_CANCELAMENTO:
    "Nenhum cancelamento em andamento. Quer cancelar um agendamento?",
  FLUXO_CANCELAMENTO_EM_ANDAMENTO:
    "Estamos no fluxo de cancelamento. Escolha uma das opções apresentadas ou envie 'Cancelar' para sair.",
  CANCELAMENTO_NAO_CONFIRMADO:
    "Cancelamento não confirmado. Deseja fazer algo mais?",
  AGENDAMENTO_NAO_CONFIRMADO:
    "Agendamento não confirmado. Deseja tentar novamente?",
  ERRO_PROCESSAR_CANCELAMENTO:
    "Ops, algo deu errado ao processar o cancelamento. Tente novamente mais tarde.",
  ERRO_CANCELAR_AGENDAMENTO:
    "Ops, algo deu errado ao cancelar o agendamento. Por favor, tente novamente.",
  CONFIRMAR_DESCONHECIDO:
    "Desculpe, não entendi o que você quer confirmar. Por favor, comece o agendamento novamente.",
  NAO_ENTENDI: "Desculpe, não entendi. Pode repetir, por favor?",
  TELEFONE_INVALIDO:
    "Telefone inválido. Use o formato +55DDXXXXXXXXX.",
  SERVICO_INVALIDO:
    "Serviço inválido. Escolha entre Corte, Barba ou Corte + Barba.",
  DATAHORA_INVALIDA:
    "Data ou horário inválido. Escolha um horário futuro de segunda a sábado.",
  DADOS_OBRIGATORIOS_FALTANDO:
    "Algumas informações estão faltando. Informe nome, telefone, serviço e horário.",
  ERRO_GERAL: "Ops, algo deu errado. Tente novamente mais tarde.",
};

module.exports = MENSAGENS;
