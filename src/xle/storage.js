'use strict';

const crypto = require('node:crypto');

// Separate tables avoid giving lore characters human credentials or admin roles.
function install(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS xle_characters (
      character_id TEXT PRIMARY KEY,
      webhook_id INTEGER UNIQUE REFERENCES webhooks(id) ON DELETE SET NULL,
      channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS xle_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id TEXT NOT NULL REFERENCES xle_characters(character_id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK(scope IN ('conversation', 'member', 'lore_event')),
      scope_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_xle_memory_scope
      ON xle_memories(character_id, scope, scope_id, id DESC);
  `);
}

function binding(db, characterId) {
  return db.prepare('SELECT character_id, webhook_id, channel_id FROM xle_characters WHERE character_id = ?')
    .get(characterId) || null;
}

// Explicit admin provisioning, never automatically on startup. Bot token stays
// server-side; the XLE admin API never returns it.
function provision(db, character, channelId, adminId) {
  if (!Number.isSafeInteger(channelId) || channelId <= 0) throw new Error('Invalid channel');
  const admin = db.prepare('SELECT id FROM users WHERE id = ? AND is_admin = 1').get(adminId);
  if (!admin) throw new Error('Administrator required');
  const channel = db.prepare('SELECT id, is_dm FROM channels WHERE id = ?').get(channelId);
  if (!channel || channel.is_dm) throw new Error('Non-DM channel required');
  const existing = binding(db, character.id);
  if (existing?.webhook_id) throw new Error('Character already provisioned');
  return db.transaction(() => {
    const token = crypto.randomBytes(32).toString('hex');
    const inserted = db.prepare(`
      INSERT INTO webhooks (channel_id, name, token, created_by, is_active, can_moderate, can_use_voice)
      VALUES (?, ?, ?, ?, 1, 0, 0)
    `).run(channelId, character.name, token, adminId);
    const webhookId = Number(inserted.lastInsertRowid);
    db.prepare(`
      INSERT INTO xle_characters (character_id, webhook_id, channel_id)
      VALUES (?, ?, ?)
      ON CONFLICT(character_id) DO UPDATE SET webhook_id = excluded.webhook_id, channel_id = excluded.channel_id
    `).run(character.id, webhookId, channelId);
    return { character_id: character.id, webhook_id: webhookId, channel_id: channelId };
  })();
}

// Memory is opt-in at the call site: no automatic collection or sharing.
function remember(db, characterId, scope, scopeId, content, limit = 100) {
  if (!['conversation', 'member', 'lore_event'].includes(scope) ||
      typeof scopeId !== 'string' || scopeId.length < 1 || scopeId.length > 128 ||
      typeof content !== 'string' || !content.trim() || content.length > 2000 ||
      !Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid XLE memory');
  return db.transaction(() => {
    db.prepare('INSERT INTO xle_memories (character_id, scope, scope_id, content) VALUES (?, ?, ?, ?)')
      .run(characterId, scope, scopeId, content.trim());
    db.prepare(`
      DELETE FROM xle_memories WHERE character_id = ? AND scope = ? AND scope_id = ?
      AND id NOT IN (
        SELECT id FROM xle_memories WHERE character_id = ? AND scope = ? AND scope_id = ?
        ORDER BY id DESC LIMIT ?
      )
    `).run(characterId, scope, scopeId, characterId, scope, scopeId, limit);
  })();
}

function recall(db, characterId, scope, scopeId, limit = 20) {
  if (!['conversation', 'member', 'lore_event'].includes(scope) ||
      typeof scopeId !== 'string' || scopeId.length > 128 ||
      !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid XLE memory query');
  return db.prepare(`
    SELECT id, content, created_at FROM xle_memories
    WHERE character_id = ? AND scope = ? AND scope_id = ?
    ORDER BY id DESC LIMIT ?
  `).all(characterId, scope, scopeId, limit).reverse();
}

function forget(db, characterId, scope, scopeId) {
  if (!['conversation', 'member', 'lore_event'].includes(scope) || typeof scopeId !== 'string' || !scopeId) {
    throw new Error('Invalid XLE memory scope');
  }
  return db.prepare('DELETE FROM xle_memories WHERE character_id = ? AND scope = ? AND scope_id = ?')
    .run(characterId, scope, scopeId).changes;
}

module.exports = { install, binding, provision, remember, recall, forget };
