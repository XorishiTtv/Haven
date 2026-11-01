'use strict';

// Character identities are server-owned. Chat content and AI output never edit canon.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const LORE_DIR = path.join(ROOT, 'xle-lore');
const CONFIG_FILE = path.join(ROOT, 'xle.config.json');
const VALID_PROVIDERS = new Set(['openai', 'xai']);
const ID = /^[a-z][a-z0-9_]{1,39}$/;
const FILE = /^[a-z][a-z0-9_]{1,39}\.txt$/;

function readConfig(file = CONFIG_FILE) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('Invalid XLE configuration file');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (config.version !== 1 || typeof config.enabled !== 'boolean' ||
      !VALID_PROVIDERS.has(config.default_provider) ||
      !Array.isArray(config.characters) || config.characters.length > 32 ||
      !Number.isInteger(config.memory?.max_entries_per_scope) ||
      config.memory.max_entries_per_scope < 1 || config.memory.max_entries_per_scope > 500) {
    throw new Error('Invalid XLE configuration');
  }
  const seen = new Set();
  for (const character of config.characters) {
    if (!character || !ID.test(character.id) || seen.has(character.id) ||
        typeof character.name !== 'string' || character.name.length < 1 || character.name.length > 64 ||
        typeof character.role !== 'string' || character.role.length > 64 ||
        !VALID_PROVIDERS.has(character.provider) || !FILE.test(character.personality_file) ||
        typeof character.enabled !== 'boolean') {
      throw new Error('Invalid XLE character configuration');
    }
    seen.add(character.id);
  }
  return config;
}

function readPersonality(character, dir = LORE_DIR) {
  if (!character || !FILE.test(character.personality_file)) throw new Error('Invalid personality file');
  const file = path.join(dir, character.personality_file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) {
    throw new Error('Invalid XLE personality file');
  }
  const content = fs.readFileSync(file, 'utf8').trim();
  if (!content || content.startsWith('PLACEHOLDER:')) {
    throw new Error('Character lore has not been provided');
  }
  return content;
}

function publicCharacter(character, binding = null) {
  return {
    id: character.id, name: character.name, role: character.role,
    provider: character.provider, enabled: character.enabled,
    provisioned: !!binding?.webhook_id,
    channel_id: binding?.channel_id || null,
    webhook_id: binding?.webhook_id || null
  };
}

module.exports = { readConfig, readPersonality, publicCharacter, VALID_PROVIDERS };
