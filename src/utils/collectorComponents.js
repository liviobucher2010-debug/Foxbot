/** Component custom IDs handled by ephemeral message collectors — skip global handlers. */
const COLLECTOR_MANAGED_PREFIXES = [
  'config_select',
  'config_wizard',
  'cmdaccess_',
];

export function isCollectorManagedComponent(customId = '') {
  // Dashboard component IDs use "cmdaccess:<action>:..." and are handled
  // by the collector created in the /commands dashboard command.
  if (customId === 'cmdaccess' || customId.startsWith('cmdaccess:')) {
    return true;
  }

  return COLLECTOR_MANAGED_PREFIXES.some((prefix) => customId.startsWith(prefix));
}
