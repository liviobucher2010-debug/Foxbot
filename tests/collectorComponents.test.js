import test from 'node:test';
import assert from 'node:assert/strict';

import { isCollectorManagedComponent } from '../src/utils/collectorComponents.js';

test('command access dashboard component IDs are handled by the dashboard collector', () => {
  assert.equal(isCollectorManagedComponent('cmdaccess'), true);
  assert.equal(isCollectorManagedComponent('cmdaccess:category'), true);
  assert.equal(isCollectorManagedComponent('cmdaccess:toggle:core'), true);
});

test('unrelated component IDs are not treated as dashboard collector components', () => {
  assert.equal(isCollectorManagedComponent('other:button'), false);
});
