jest.mock('../services/twilioService', () => ({
  sendWhatsApp: jest.fn(() => Promise.resolve({ sid: '1' })),
  waitForDelivery: jest.fn(() => Promise.resolve()),
}));

jest.mock('../controllers/clienteController', () => ({
  encontrarOuCriarCliente: jest.fn(() => Promise.resolve({ id: 10, nome: 'Jose', telefone: '+5511999999999' })),
  atualizarNomeCliente: jest.fn(),
  buscarClientePorTelefone: jest.fn(),
}));

jest.mock('@google-cloud/dialogflow', () => {
  const detectIntentMock = jest.fn();
  return {
    __detectIntentMock: detectIntentMock,
    SessionsClient: jest.fn().mockImplementation(() => ({
      projectAgentSessionPath: jest.fn(() => 'path'),
      detectIntent: detectIntentMock,
    })),
  };
});
const { __detectIntentMock: detectIntentMock } = require('@google-cloud/dialogflow');

jest.mock('../controllers/agendamentoController', () => ({
  agendarServico: jest.fn(),
}));

const { handleWebhook, __test } = require('../controllers/dialogflowWebhookController');
const { agendamentosPendentes } = __test;

describe('manual agendamento via webhook', () => {
  beforeEach(() => {
    agendamentosPendentes.clear();
    jest.clearAllMocks();
    detectIntentMock.mockResolvedValue([
      {
        queryResult: {
          intent: { displayName: 'confirmar_agendamento' },
          parameters: { fields: {} },
          fulfillmentText: '',
          outputContexts: [],
        },
      },
    ]);
  });

  test('sim confirma agendamento e limpa estado', async () => {
    const { agendarServico } = require('../controllers/agendamentoController');
    agendarServico.mockResolvedValue({ success: true });

    agendamentosPendentes.set('user', {
      confirmationStep: 'awaiting_confirm',
      servico: 'Corte',
      servicoId: 1,
      diaEscolhido: '2030-01-01',
      horarioEscolhido: '09:00',
      clienteId: 10,
    });

    const req = { body: { Body: 'sim', From: 'user', ProfileName: 'Jose' } };
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    await handleWebhook(req, res);

    expect(agendarServico).toHaveBeenCalled();
    expect(agendamentosPendentes.has('user')).toBe(false);
  });

  test('confirma agendamento mesmo com intent incorreta', async () => {
    const { agendarServico } = require('../controllers/agendamentoController');
    agendarServico.mockResolvedValue({ success: true });

    agendamentosPendentes.set('user', {
      confirmationStep: 'awaiting_confirm',
      servico: 'Corte',
      servicoId: 1,
      diaEscolhido: '2030-01-01',
      horarioEscolhido: '09:00',
      clienteId: 10,
    });

    detectIntentMock.mockResolvedValueOnce([
      {
        queryResult: {
          intent: { displayName: 'confirmar_inicio_reagendamento' },
          parameters: { fields: {} },
          fulfillmentText: '',
          outputContexts: [],
        },
      },
    ]);

    const req = { body: { Body: 'confirmar', From: 'user', ProfileName: 'Jose' } };
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    await handleWebhook(req, res);

    expect(agendarServico).toHaveBeenCalled();
    expect(agendamentosPendentes.has('user')).toBe(false);
  });
});
