export function buildCategoryEmbed(category, guild) {
  const statusIcon = getCategoryStatus(category);
  const statusText = category.categoryDisabled
    ? 'Category disabled'
    : category.disabledCount === 0
      ? 'All entries enabled'
      : `${category.disabledCount} of ${category.totalCount} disabled`;

  const commandLines = category.commands.map((command) => {
    const enabled = category.enabledCommands.includes(command.name);
    const icon = enabled ? STATUS.enabled : STATUS.disabled;
    const lock = command.protected ? ' 🔒' : '';
    return `${icon} ${formatCommandLabel(command)}${lock}`;
  });

  const fields = [
    {
      name: `${statusIcon} Status`,
      value: statusText,
      inline: true,
    },
    {
      name: '📈 Count',
      value: `${category.enabledCount}/${category.totalCount} enabled`,
      inline: true,
    },
  ];

  const chunks = chunkLines(commandLines);
  chunks.forEach((chunk, index) => {
    fields.push({
      name: index === 0 ? '📋 Commands & Subcommands' : '📋 (cont.)',
      value: chunk,
      inline: false,
    });
  });

  fields.push({
    name: 'How to Use',
    value: [
      '• Use the dropdown to toggle individual commands or subcommands',
      '• **Disable All** turns off the whole category',
      '• **Clear Overrides** re-enables individually disabled entries',
    ].join('\n'),
  });

  const guildName = guild?.name ?? 'this server';

  return createEmbed({
    title: `${category.icon} ${category.displayName}`,
    description: `Command access for **${guildName}**.`,
    color: category.categoryDisabled ? 'error' : category.disabledCount > 0 ? 'warning' : 'success',
    fields,
    footer: '🔒 Protected entries cannot be disabled',
  });
}
