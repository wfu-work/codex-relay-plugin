import assert from 'node:assert/strict';
import test from 'node:test';
import { composerSettings, composerSettingsPatch } from '../server/composer-settings.js';
import { normalizeCodexNotification } from '../server/protocol.js';

test('resume and settings notifications expose the same composer fields without instructions', () => {
  const common = { model: 'gpt-6-astra', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', activePermissionProfile: { id: ':workspace' } };
  const expected = { ...common, effort: 'high', sandboxPolicy: { type: 'workspaceWrite' } };
  assert.deepEqual(composerSettings({ ...common, reasoningEffort: 'high', sandbox: expected.sandboxPolicy, instructionSources: ['private'] }), expected);
  assert.deepEqual(composerSettings({ threadSettings: { ...expected, collaborationMode: { settings: { developer_instructions: 'private' } } } }), expected);
  assert.equal(composerSettings({}), null);
  const event = normalizeCodexNotification('thread/settings/updated', { threadId: 'thread', threadSettings: expected });
  assert.equal(event.type, 'thread.settings.updated');
});

test('permission modes select official profiles and require remote approval permission', () => {
  const config = { permissions: { respondToApprovals: true } };
  assert.deepEqual(composerSettingsPatch({ permissionMode: '自动审查' }, config), { permissions: ':workspace', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' });
  assert.deepEqual(composerSettingsPatch({ permissionMode: '完全访问权限' }, config), { permissions: ':danger-full-access', approvalPolicy: 'never', approvalsReviewer: 'user' });
  assert.equal(composerSettingsPatch({ permissionMode: '只读权限' }, config).permissions, ':read-only');
  assert.equal(composerSettingsPatch({ permissionMode: '默认权限' }, config).permissions, ':workspace');
  config.permissions.respondToApprovals = false;
  assert.throws(() => composerSettingsPatch({ permissionMode: '完全访问权限' }, config), { code: 'COMMAND_NOT_ALLOWED' });
  assert.deepEqual(composerSettingsPatch({ model: 'gpt-6-astra', effort: 'ultra' }, config), { model: 'gpt-6-astra', effort: 'ultra' });
  for (const input of [{}, { model: '' }, { effort: {} }]) {
    assert.throws(() => composerSettingsPatch(input, config), { code: 'INVALID_MESSAGE' });
  }
});
