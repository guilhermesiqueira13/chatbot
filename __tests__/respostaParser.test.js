const { parseEscolhaDia, DEFAULT_ERROR_MSG } = require('../utils/respostaParser');

describe('parseEscolhaDia', () => {
  test('reconhece dia da semana', () => {
    const res = parseEscolhaDia('Terça');
    expect(res).toEqual({ type: 'weekday', value: 2 });
  });

  test('reconhece data dd/mm', () => {
    const year = new Date().getFullYear();
    const res = parseEscolhaDia('05/07');
    expect(res).toEqual({ type: 'date', value: `${year}-07-05` });
  });

  test('reconhece data completa', () => {
    const res = parseEscolhaDia('12/10/2025');
    expect(res).toEqual({ type: 'date', value: '2025-10-12' });
  });

  test('reconhece ver mais dias', () => {
    const res = parseEscolhaDia('Ver mais dias');
    expect(res).toEqual({ type: 'verMais' });
  });

  test('retorna erro para entrada invalida', () => {
    const res = parseEscolhaDia('xyz');
    expect(res).toEqual({ type: 'invalid', error: DEFAULT_ERROR_MSG });
  });
});
