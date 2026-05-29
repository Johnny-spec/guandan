import 'dotenv/config';
import restify from 'restify';
import { CloudAdapter, ConfigurationServiceClientCredentialFactory, createBotFrameworkAuthenticationFromConfiguration } from 'botbuilder';
import { GuandanBot } from './bot.js';

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env['MICROSOFT_APP_ID'],
  MicrosoftAppPassword: process.env['MICROSOFT_APP_PASSWORD'],
  MicrosoftAppTenantId: process.env['MICROSOFT_APP_TENANT_ID'],
});

const botAuth = createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);
const adapter = new CloudAdapter(botAuth);
const bot = new GuandanBot();

const server = restify.createServer();
server.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, (ctx) => bot.run(ctx));
});

const port = Number(process.env['BOT_PORT'] ?? 3978);
server.listen(port, () => console.log(`Teams Bot listening on :${port}`));
