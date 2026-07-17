const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channels = await guild.channels.fetch();
  const sorted = [...channels.values()].sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
  for (const ch of sorted) {
    const typeLabel = ch.type === ChannelType.GuildCategory ? 'CATEGORY'
      : ch.type === ChannelType.GuildVoice ? 'VOICE'
      : ch.type === ChannelType.GuildText ? 'TEXT'
      : `TYPE${ch.type}`;
    const parent = ch.parent ? ` (in: ${ch.parent.name})` : '';
    console.log(`[${typeLabel}] ${ch.name}${parent} - id:${ch.id}`);
  }
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
