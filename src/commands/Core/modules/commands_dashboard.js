import {
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import {
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
  const description = String(command?.description || '').trim().slice(0, 120);
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

export function buildCategoryEmbed(category, guild, page = 0) {
  const statusIcon = getCategoryStatus(category);
  const statusText = category.categoryDisabled
    ? 'Category disabled'
    : category.disabledCount === 0
      ? 'All entries enabled'
      : `${category.disabledCount} of ${category.totalCount} disabled`;

  const allCommands = category.commands || [];
  const pageCount = Math.max(1, Math.ceil(allCommands.length / 25));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const visibleCommands = allCommands.slice(safePage * 25, (safePage + 1) * 25);
  const commandLines = visibleCommands.map((command) => {
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

  chunkLines(commandLines, 900).slice(0, 5).forEach((chunk, index) => {
    fields.push({
      name: index === 0 ? '📋 Commands & Subcommands' : '📋 (cont.)',
      value: chunk,
      inline: false,
    });
  });

  fields.push({
    name: 'Page',
    value: `Showing page ${safePage + 1}/${pageCount} · ${allCommands.length} total entries`,
    inline: true,
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

function buildCategoryComponents(category, page = 0) {
  const rows = [];
  const commands = category.commands || [];
  const pageCount = Math.max(1, Math.ceil(commands.length / 25));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const pageCommands = commands.slice(safePage * 25, (safePage + 1) * 25).filter((command) => !command.protected);

  if (pageCommands.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}:toggle:${category.key}:${safePage}`)
      .setPlaceholder('Select a command to enable or disable')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(pageCommands.map((command) => {
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

  if (pageCount > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_ID_PREFIX}:page:${category.key}:${Math.max(0, safePage - 1)}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_ID_PREFIX}:page:${category.key}:${Math.min(pageCount - 1, safePage + 1)}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= pageCount - 1),
    ));
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

export async function buildDashboardView(client, guildId, guild, selectedCategory = 'overview', selectedPage = 0) {
  const config = await getGuildConfig(client, guildId);
  const snapshot = getCommandAccessSnapshot(client, config);

  if (selectedCategory && selectedCategory !== 'overview') {
    const category = snapshot.categories.find((item) => item.key === selectedCategory);
    if (category) {
      return { embed: buildCategoryEmbed(category, guild, selectedPage), components: buildCategoryComponents(category, selectedPage) };
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

  // Re-check permissions on every component interaction, not only when opening the dashboard.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'You need the **Manage Server** permission to manage commands.',
      ephemeral: true,
    });
    return false;
  }

  const [, action, categoryKey, pageValue] = interaction.customId.split(':');
  let selectedCategory = categoryKey || 'overview';
  let selectedPage = Number.parseInt(pageValue, 10) || 0;

  switch (action) {
    case 'category':
      selectedCategory = interaction.values?.[0] || 'overview';
      selectedPage = 0;
      break;
    case 'page':
      selectedPage = Math.max(0, selectedPage);
      break;
    case 'toggle': {
      const commandName = interaction.values?.[0];
      if (!commandName) return false;

      const config = await getGuildConfig(client, interaction.guildId);
      const snapshot = getCommandAccessSnapshot(client, config);
      const category = snapshot.categories.find((item) => item.key === categoryKey);
      if (!category) throw new Error('The selected command category no longer exists.');

      const selectedCommand = category.commands.find((command) => command.name === commandName);
      if (!selectedCommand || selectedCommand.protected) {
        throw new Error('That command cannot be changed from this dashboard.');
      }

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

  const view = await buildDashboardView(client, interaction.guildId, interaction.guild, selectedCategory, selectedPage);
  await interaction.update({ embeds: [view.embed], components: view.components });
  return true;
}
