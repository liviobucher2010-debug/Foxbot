import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import {
  buildCommandRegistry,
  getCommandAccessSnapshot,
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resetCategoryCommands,
} from '../../../services/commandAccessService.js';

const CUSTOM_ID_PREFIX = 'cmdaccess';
const STATUS = Object.freeze({
  enabled: '🟢',
  disabled: '🔴',
  mixed: '🟡',
});

function getCategoryStatus(category) {
  if (category.categoryDisabled) return STATUS.disabled;
  if (category.disabledCount > 0) return STATUS.mixed;
  return STATUS.enabled;
}

function formatCommandLabel(command) {
  const name = String(command?.name || 'unknown');
  const description = String(command?.description || '').trim();
  const prefix = command?.isSubcommand ? '↳ ' : '/';
  const label = `${prefix}${name}`;
  return description ? `${label} — ${description}` : label;
}

function chunkLines(lines, maxLength = 1000) {
  const chunks = [];
  let current = '';

  for (const rawLine of lines) {
    const line = String(rawLine);
    const safeLine = line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
    const next = current ? `${current}\n${safeLine}` : safeLine;

    if (next.length > maxLength && current) {
      chunks.push(current);
      current = safeLine;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : ['No commands found.'];
}

function buildOverviewEmbed(snapshot, guild) {
  const guildName = guild?.name ?? 'this server';
  const fields = [
    {
      name: '📊 Overall status',
      value: `${snapshot.enabledTotal}/${snapshot.totalCommands} commands enabled`,
      inline: true,
    },
    {
      name: '🔴 Disabled',
      value: String(snapshot.disabledTotal),
      inline: true,
    },
  ];

  for (const category of snapshot.categories) {
    fields.push({
      name: `${getCategoryStatus(category)} ${category.icon} ${category.displayName}`.slice(0, 256),
      value: `${category.enabledCount}/${category.totalCount} enabled${category.categoryDisabled ? ' · category disabled' : ''}`,
      inline: true,
    });
  }

  return createEmbed({
    title: '🛠️ Command Access Dashboard',
    description: `Manage command access for **${guildName}**. Choose a category below to inspect individual commands.`,
    color: snapshot.disabledTotal > 0 ? 'warning' : 'success',
    fields: fields.slice(0, 25),
    footer: '🔒 Protected commands cannot be disabled',
  });
}

export function buildCategoryEmbed(category, guild) {
  const statusIcon = getCategoryStatus(category);
  const statusText = category.categoryDisabled
    ? 'Category disabled'
    : category.disabledCount === 0
      ? 'All entries enabled'
      : `${category.disabledCount} of ${category.totalCount} disabled`;

  const commandLines = (category.commands || []).map((command) => {
    const enabled = category.enabledCommands.includes(command.name);
    const icon = enabled ? STATUS.enabled : STATUS.disabled;
    const lock = command.protected ? ' 🔒' : '';
    return `${icon} ${formatCommandLabel(command)}${lock}`;
  });

  const fields = [
    { name: `${statusIcon} Status`, value: statusText, inline: true },
    {
      name: '📈 Count',
      value: `${category.enabledCount}/${category.totalCount} enabled`,
      inline: true,
    },
  ];

  chunkLines(commandLines).slice(0, 22).forEach((chunk, index) => {
    fields.push({
      name: index === 0 ? '📋 Commands & Subcommands' : '📋 (cont.)',
      value: chunk,
      inline: false,
    });
  });

  fields.push({
    name: 'How to Use',
    value: [
      '• Use the dropdown to toggle an individual command or subcommand',
      '• **Disable All** turns off the whole category',
      '• **Clear Overrides** removes individual command disables',
    ].join('\n'),
  });

  return createEmbed({
    title: `${category.icon} ${category.displayName}`,
    description: `Command access for **${guild?.name ?? 'this server'}**.`,
    color: category.categoryDisabled ? 'error' : category.disabledCount > 0 ? 'warning' : 'success',
    fields: fields.slice(0, 25),
    footer: '🔒 Protected entries cannot be disabled',
  });
}

function buildOverviewComponents(snapshot) {
  const categories = snapshot.categories.slice(0, 25);
  if (!categories.length) return [];

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${CUSTOM_ID_PREFIX}:category`)
    .setPlaceholder('Choose a command category')
    .addOptions(categories.map((category) => ({
      label: category.displayName.slice(0, 100),
      description: `${category.enabledCount}/${category.totalCount} enabled`.slice(0, 100),
      value: category.key,
      emoji: category.icon || undefined,
    })));

  return [new ActionRowBuilder().addComponents(menu)];
}

function buildCategoryComponents(category) {
  const rows = [];
  const commands = (category.commands || []).filter((command) => !command.protected).slice(0, 25);

  if (commands.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}:toggle:${category.key}`)
      .setPlaceholder('Select a command to enable or disable')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(commands.map((command) => {
        const enabled = category.enabledCommands.includes(command.name);
        return {
          label: `/${command.name}`.slice(0, 100),
          description: (command.description || (enabled ? 'Currently enabled' : 'Currently disabled')).slice(0, 100),
          value: command.name,
          default: false,
        };
      }));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}:disable:${category.key}`)
      .setLabel('Disable All')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(category.categoryDisabled)),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}:enable:${category.key}`)
      .setLabel('Enable Category')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!category.categoryDisabled),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}:clear:${category.key}`)
      .setLabel('Clear Overrides')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}:overview`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Primary),
  );
  rows.push(actions);
  return rows;
}

export async function buildDashboardView(client, guildId, guild, selectedCategory = 'overview') {
  const config = await getGuildConfig(client, guildId);
  const snapshot = getCommandAccessSnapshot(client, config);

  if (selectedCategory && selectedCategory !== 'overview') {
    const category = snapshot.categories.find((item) => item.key === selectedCategory);
    if (category) {
      return { embed: buildCategoryEmbed(category, guild), components: buildCategoryComponents(category) };
    }
  }

  return {
    embed: buildOverviewEmbed(snapshot, guild),
    components: buildOverviewComponents(snapshot),
  };
}

export function isCommandAccessCustomId(customId) {
  return typeof customId === 'string' && customId.startsWith(`${CUSTOM_ID_PREFIX}:`);
}

export function createDashboardCollectorFilter(userId, guildId) {
  return (interaction) =>
    interaction.user?.id === userId &&
    interaction.guildId === guildId &&
    isCommandAccessCustomId(interaction.customId);
}

export async function handleDashboardComponent(interaction, client) {
  if (!isCommandAccessCustomId(interaction.customId)) return false;

  const [, action, categoryKey, ...rest] = interaction.customId.split(':');
  let selectedCategory = categoryKey || 'overview';

  switch (action) {
    case 'category':
      selectedCategory = interaction.values?.[0] || 'overview';
      break;
    case 'toggle': {
      const commandName = interaction.values?.[0];
      if (!commandName) return false;

      const config = await getGuildConfig(client, interaction.guildId);
      const snapshot = getCommandAccessSnapshot(client, config);
      const category = snapshot.categories.find((item) => item.key === categoryKey);
      if (!category) throw new Error('The selected command category no longer exists.');

      if (category.enabledCommands.includes(commandName)) {
        await disableCommand(client, interaction.guildId, commandName);
      } else {
        await enableCommand(client, interaction.guildId, commandName);
      }
      break;
    }
    case 'disable':
      await disableCategory(client, interaction.guildId, categoryKey);
      break;
    case 'enable':
      await enableCategory(client, interaction.guildId, categoryKey);
      break;
    case 'clear':
      await resetCategoryCommands(client, interaction.guildId, categoryKey);
      break;
    case 'overview':
      selectedCategory = 'overview';
      break;
    default:
      return false;
  }

  const view = await buildDashboardView(client, interaction.guildId, interaction.guild, selectedCategory);
  await interaction.update({ embeds: [view.embed], components: view.components });
  return true;
}
