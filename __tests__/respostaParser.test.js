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

  test('reconhece hoje e amanha', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const amanhaDate = new Date();
    amanhaDate.setDate(amanhaDate.getDate() + 1);
    const amanha = amanhaDate.toISOString().slice(0, 10);
    expect(parseEscolhaDia('hoje')).toEqual({ type: 'date', value: hoje });
    expect(parseEscolhaDia('amanhã')).toEqual({ type: 'date', value: amanha });
  });

  test('reconhece proxima sexta', () => {
    const res = parseEscolhaDia('Próxima sexta');
    expect(res).toEqual({ type: 'weekday', value: 5, next: true });
  });

  test('retorna erro para entrada invalida', () => {
    const res = parseEscolhaDia('xyz');
    expect(res).toEqual({ type: 'invalid', error: DEFAULT_ERROR_MSG });
  });
});
