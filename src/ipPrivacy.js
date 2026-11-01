'use strict';

// Opt-in deployment policy. This is deliberately independent of the admin's
// voice_force_relay toggle: an admin UI change must not weaken host privacy.
const enabled = () => process.env.HAVEN_STRICT_IP_PRIVACY === 'true';

function hasTurnConfiguration(db) {
  if ((process.env.TURN_URL || '').trim()) return true;
  try {
    return !!db.prepare("SELECT value FROM server_settings WHERE key = 'turn_url'").get()?.value?.trim();
  } catch {
    // If we cannot establish that a relay exists, do not allow voice.
    return false;
  }
}

// ICE candidate strings carry network addresses. Never forward a host/srflx/
// prflx candidate, even if a modified client claims it is using TURN.
// A relay candidate can also carry the client's address in raddr; refuse it.
function safeCandidateLine(line) {
  if (typeof line !== 'string' || line.length > 2048) return false;
  if (!/(?:^|\s)typ relay(?:\s|$)/i.test(line)) return false;
  const related = line.match(/(?:^|\s)raddr\s+(\S+)/i);
  return !related || ['0.0.0.0', '::', '::0'].includes(related[1]);
}

function safeCandidate(candidate) {
  if (candidate == null) return true; // End-of-candidates marker.
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.candidate === '') return true;
  return safeCandidateLine(candidate.candidate);
}

function safeDescription(description) {
  if (!description || typeof description !== 'object' ||
      typeof description.sdp !== 'string') return false;
  for (const line of description.sdp.split(/\r?\n/)) {
    if (/^a=candidate:/i.test(line) && !safeCandidateLine(line)) return false;
    if (/^a=remote-candidates:/i.test(line)) return false;
  }
  return true;
}

module.exports = { enabled, hasTurnConfiguration, safeCandidate, safeDescription };
