'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { readConfig, readPersonality, publicCharacter } = require('../src/xle/registry');
const { providerStatus, generate } = require('../src/xle/providers');
const { install, binding, provision, remember, recall, forget } = require('../src/xle/storage');

test('XLE config has five stable identities, disabled by default', () => {
  const config = readConfig();
  assert.equal(config.enabled, false);
  assert.deepEqual(config.characters.map(c => c.id), [
    'gnisu', 'da_scribe', 'gnije', 'zytheris', 'tachiagarithevoid'
  ]);
  for (const character of config.characters) {
    assert.throws(() => readPersonality(character), /lore has not been provided/);
    assert.equal(publicCharacter(character).provisioned, false);
  }
});

test('XLE rejects malformed config and unsafe personality paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xle-config-'));
  try {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, enabled: true, characters: [] }));
    assert.throws(() => readConfig(file), /Invalid XLE configuration/);
    assert.throws(() => readPersonality({ personality_file: '../secret.txt' }, dir), /Invalid personality file/);
    const lore = path.join(dir, 'canon.txt');
    fs.writeFileSync(lore, 'Approved test canon');
    assert.equal(readPersonality({ personality_file: 'canon.txt' }, dir), 'Approved test canon');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('XLE provider egress fails closed and uses fixed endpoints', async () => {
  const env = { OPENAI_API_KEY: 'test', XLE_OPENAI_MODEL: 'test-model' };
  assert.equal(providerStatus(env).openai.configured, true);
  await assert.rejects(generate({
    provider: 'openai', system: 'Canon', prompt: 'Hello',
    env, fetchImpl: () => { throw Error('Must not send network request'); }
  }), /Direct AI egress disabled/);
  let requested;
  const output = await generate({
    provider: 'openai', system: 'Canon', prompt: 'Hello',
    env: { ...env, XLE_ALLOW_DIRECT_AI_EGRESS: 'true' },
    fetchImpl: async (url, options) => {
      requested = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Hello!' } }] }) };
    }
  });
  assert.equal(output, 'Hello!');
  assert.equal(requested.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(requested.options.redirect, 'error');
  assert.equal(requested.options.headers.Authorization, 'Bearer test');
  assert.equal(JSON.parse(requested.options.body).messages[0].content, 'Canon');
});

test('XLE provisions least-privilege Haven webhook identities and isolates memory', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, is_admin INTEGER NOT NULL);
      CREATE TABLE channels (id INTEGER PRIMARY KEY, is_dm INTEGER NOT NULL);
      CREATE TABLE webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER NOT NULL REFERENCES channels(id),
        name TEXT, token TEXT UNIQUE, created_by INTEGER REFERENCES users(id),
        is_active INTEGER, can_moderate INTEGER, can_use_voice INTEGER
      );
      INSERT INTO users (id, is_admin) VALUES (1, 1), (2, 0);
      INSERT INTO channels (id, is_dm) VALUES (10, 0), (11, 1);
    `);
    install(db);
    install(db);
    const character = { id: 'gnije', name: 'Gnije' };
    assert.throws(() => provision(db, character, 10, 2), /Administrator required/);
    assert.throws(() => provision(db, character, 11, 1), /Non-DM channel required/);
    const result = provision(db, character, 10, 1);
    assert.equal(result.channel_id, 10);
    const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(result.webhook_id);
    assert.equal(webhook.name, 'Gnije');
    assert.equal(webhook.can_moderate, 0);
    assert.equal(webhook.can_use_voice, 0);
    assert.match(webhook.token, /^[a-f0-9]{64}$/);
    assert.equal(binding(db, 'gnije').webhook_id, result.webhook_id);
    assert.throws(() => provision(db, character, 10, 1), /already provisioned/);
    remember(db, 'gnije', 'member', '123', 'likes games', 2);
    remember(db, 'gnije', 'member', '123', 'likes art', 2);
    remember(db, 'gnije', 'member', '123', 'likes music', 2);
    remember(db, 'gnije', 'member', '456', 'private scope', 2);
    assert.deepEqual(recall(db, 'gnije', 'member', '123').map(m => m.content), ['likes art', 'likes music']);
    assert.equal(recall(db, 'gnije', 'member', '456').length, 1);
    assert.equal(forget(db, 'gnije', 'member', '123'), 2);
    assert.equal(recall(db, 'gnije', 'member', '123').length, 0);
    assert.equal(recall(db, 'gnije', 'member', '456').length, 1);
  } finally {
    db.close();
  }
});
