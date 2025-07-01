# reservai-bot

Este projeto fornece um bot de agendamento integrado ao WhatsApp, Dialogflow e Google Calendar.

## Exemplos de requisições

### POST /webhook

```bash
curl -X POST http://localhost:3000/webhook \
     -d '{
       "Body": "Quero agendar corte para amanhã às 14h",
       "From": "whatsapp:+5511999999999",
       "ProfileName": "João"
     }'
```

Resposta esperada:

```json
{
  "success": true,
  "data": {
    "reply": "Mensagem de resposta gerada pelo bot"
  },
  "message": null
}
```

### POST /api/agendamento/agendar

```bash
curl -X POST http://localhost:3000/api/agendamento/agendar \
     -H "Content-Type: application/json" \
     -d '{
       "clienteId": 1,
       "clienteNome": "João",
       "servicosNomes": ["Corte", "Barba"],
       "horario": "2024-06-15T14:00:00-03:00"
     }'
```

Resposta esperada:

```json
{
  "success": true,
  "data": {
    "agendamentoId": 42,
    "eventId": "abcdef123456"
  },
  "message": "Agendamento realizado com sucesso"
}
```

## Configurando o Google Calendar

1. Crie uma conta de serviço no Google Cloud e baixe o arquivo de credenciais.
2. Salve os arquivos `reservai_twilio.json` (Dialogflow) e `barbearia-calendar.json` na raiz do projeto.
3. Compartilhe o calendário desejado com o e‑mail da conta de serviço usado no `barbearia-calendar.json`.
4. Crie um arquivo `.env` com as variáveis abaixo e ajuste de acordo com seu ambiente:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=barbearia
DIALOGFLOW_KEYFILE=./reservai_twilio.json
GOOGLE_APPLICATION_CREDENTIALS=./barbearia-calendar.json
DIALOGFLOW_PROJECT_ID=reservai-twilio-qrps
CALENDAR_ID=SEU_CALENDARIO_ID
PORT=3000
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

1. Garanta que o arquivo `.env` esteja configurado com suas credenciais e dados do banco.
2. Execute a aplicação usando Node ou um gerenciador de processos:

```bash
node index.js
```

## Exemplos de frases para treinar o Dialogflow

Para que o bot reconheça a escolha de dias e horários de forma natural, inclua frases de treinamento como:

### Intenção: Escolher Dia
- "Tenho horário disponível para amanhã?"
- "Quais dias você tem vaga para a próxima semana?"
- "Gostaria de marcar para segunda-feira."
- "Tem horário quinta?"
- "Me mostre os horários só de sábado."
- "Posso agendar para dia 22?"
- "Mostre as opções de dias novamente, por favor."
- "Queria saber se tem vaga na sexta à tarde."

### Intenção: Escolher Horário
- "Tem horário às 14h?"
- "Gostaria de agendar para de manhã."
- "Quais os horários disponíveis nesse dia?"
- "Consigo marcar por volta de 17:30?"
- "Qual o primeiro horário da manhã?"
- "Preciso de um horário no início da tarde."
- "Poderia ver se existe um horário às 9 da manhã?"
- "Quero ver os horários para noite."

### Intenção: Confirmar Agendamento
- "Esse horário está confirmado então?"
- "Pode confirmar meu agendamento, por favor?"
- "Está certo, pode marcar para mim."
- "Sim, esse dia e horário estão ótimos."
- "Quero confirmar o agendamento para quinta às 15h."
- "Perfeito, reserve esse horário pra mim."
- "Pode deixar confirmado."

### Intenção: Cancelar ou Reagendar
- "Preciso cancelar o meu horário."
- "Como faço pra remarcar para outro dia?"
- "Quero mudar o horário para mais cedo."
- "Dá pra remarcar para quarta-feira?"
- "Vou precisar cancelar o agendamento."
- "Quero alterar meu horário para 17h."
- "Consegue reagendar para o próximo sábado?"

### Fluxos de Cancelamento e Reagendamento
O backend mantém o contexto do fluxo em memória e somente processa intents compatíveis.
Quando o usuário envia **"Cancelar"**, o bot exibe os agendamentos ativos e, após a escolha,
pede confirmação do cancelamento. Para **"Reagendar"**, a lógica é similar: primeiro lista os agendamentos e,
após a seleção, solicita a nova data e horário. Intents de outros fluxos são ignoradas enquanto o contexto estiver ativo,
evitando quedas para respostas de "não entendi".

### Confirmação e Feedback
Ao final do fluxo o bot sempre envia uma mensagem de resumo com o serviço, data e horário confirmados. A resposta também lembra que você pode reagendar ou cancelar a qualquer momento respondendo **"Reagendar"** ou **"Cancelar"**. Os agendamentos somente são permitidos de segunda a sábado, das 09h às 18h.

## Utilizando dias da semana

Para converter um texto como "quinta" ou "amanhã" na data correta respeitando o fuso horário, use a função `getNextDateFromText`:

```js
const { getNextDateFromText } = require('./utils/dataHelpers');
const { listarHorariosDisponiveis } = require('./services/calendarService');

(async () => {
  const data = getNextDateFromText('quinta');
  if (data) {
    const horarios = await listarHorariosDisponiveis(data);
    console.log(data, horarios);
  }
})();
```

### Debug de timezone

Verifique se o Node está utilizando o fuso correto:

```js
console.log('Sistema:', new Date().toString());
console.log('S\u00e3o Paulo:', new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date()));
```

Se houver diverg\u00eancia, defina `TZ=America/Sao_Paulo` ao iniciar a aplica\u00e7\u00e3o.
"# chatbot" 
# chatbot
# chatbot
