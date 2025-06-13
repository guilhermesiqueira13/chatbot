# reservai-bot

Este projeto fornece um bot de agendamento integrado ao WhatsApp, Dialogflow e Google Calendar.

## Exemplos de requisições

### POST /webhook

```bash
curl -X POST http://localhost:3000/webhook \
     -H "Content-Type: application/json" \
     -d '{
       "Body": "Quero agendar corte para amanhã às 14h",
       "From": "whatsapp:+5511999999999",
       "ProfileName": "João"
     }'
```

Resposta esperada:

```json
{
  "reply": "Mensagem de resposta gerada pelo bot"
}
```

### POST /api/agendamento/agendar

```bash
curl -X POST http://localhost:3000/api/agendamento/agendar \
     -H "Content-Type: application/json" \
     -d '{
       "clienteId": 1,
       "clienteNome": "João",
       "servicoNome": "Corte",
       "horario": "2024-06-15T14:00:00-03:00"
     }'
```

Resposta esperada:

```json
{
  "success": true,
  "agendamentoId": 42,
  "eventId": "abcdef123456"
}
```

## Configurando o Google Calendar

1. Crie uma conta de serviço no Google Cloud e baixe o arquivo de credenciais.
2. Salve o arquivo com o nome `reservai_twilio.json` na raiz do projeto.
3. Compartilhe o calendário desejado com o e‑mail da conta de serviço.
4. Edite `services/calendarService.js` preenchendo o valor de `CALENDAR_ID` com o ID do seu calendário.

```javascript
const CALENDAR_ID = 'SEU_CALENDARIO_ID';
```

## Executando o projeto

### Ambiente de desenvolvimento

1. Instale as dependências:

```bash
npm install
```

2. Assegure que o MySQL esteja ativo e execute `bd.sql` para criar as tabelas.
3. Inicie o servidor com recarregamento automático:

```bash
npm start
```

4. Para testar via WhatsApp, exponha o webhook com ngrok (opcional):

```bash
npx ngrok http 3000
```

### Ambiente de produção

1. Configure as credenciais (`reservai_twilio.json` e `CALENDAR_ID`) e o banco de dados.
2. Execute a aplicação usando Node ou um gerenciador de processos:

```bash
node index.js
```
