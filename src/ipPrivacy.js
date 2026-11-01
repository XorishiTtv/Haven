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
  const fields = line.replace(/^a=/i, '').trim().split(/\s+/);
  if (fields.length < 8 || !/^candidate:\S+$/i.test(fields[0]) ||
      !/^\d+$/.test(fields[1]) || !/^(udp|tcp)$/i.test(fields[2]) ||
      !/^\d+$/.test(fields[3]) || !fields[4] || !/^\d+$/.test(fields[5]) ||
      fields[6].toLowerCase() !== 'typ' || fields[7].toLowerCase() !== 'relay') return false;
  const related = line.match(/(?:^|\s)raddr\s+(\S+)/i);
  return !related || ['0.0.0.0', '::', '::0'].includes(related[1]);
}

function safeCandidate(candidate) {
  if (candidate == null) return true; // End-of-candidates marker.
  if (!candidate || typeof candidate !== 'object') return false;
  // Prevent custom payload fields from smuggling an IP around the ICE check.
  const allowed = new Set(['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment']);
  if (Object.keys(candidate).some(key => !allowed.has(key))) return false;
  if (candidate.sdpMid != null &&
      (typeof candidate.sdpMid !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(candidate.sdpMid))) return false;
  if (candidate.sdpMLineIndex != null &&
      (!Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0 || candidate.sdpMLineIndex > 64)) return false;
  if (candidate.usernameFragment != null &&
      (typeof candidate.usernameFragment !== 'string' || !/^[a-zA-Z0-9+/_=-]{1,256}$/.test(candidate.usernameFragment))) return false;
  if (candidate.candidate === '') return true;
  return safeCandidateLine(candidate.candidate);
}

function safeDescription(description) {
  if (!description || typeof description !== 'object' ||
      Object.keys(description).some(key => key !== 'type' && key !== 'sdp') ||
      !['offer', 'answer'].includes(description.type) ||
      typeof description.sdp !== 'string') return false;
  const lines = description.sdp.split(/\r?\n/);
  const relayAddresses = new Set(['0.0.0.0', '127.0.0.1', '::', '::1']);
  for (const line of lines) {
    if (/^a=remote-candidates:/i.test(line)) return false;
    if (!/^a=candidate:/i.test(line)) continue;
    if (!safeCandidateLine(line)) return false;
    // In the standard ICE candidate format, the fifth field is its address.
    const fields = line.split(/\s+/);
    if (fields.length < 8) return false;
    relayAddresses.add(fields[4]);
  }
  // SDP origin, connection and RTCP fields can disclose an address even when
  // every ICE candidate is a TURN relay. Permit only placeholders and relay IPs.
  for (const line of lines) {
    const address = /^c=IN IP[46]\s+(\S+)/i.exec(line)?.[1] ||
      /^o=.*\sIN IP[46]\s+(\S+)/i.exec(line)?.[1] ||
      /^a=rtcp:\d+\s+IN IP[46]\s+(\S+)/i.exec(line)?.[1];
    if (address && !relayAddresses.has(address)) return false;
  }
  return true;
}

module.exports = { enabled, hasTurnConfiguration, safeCandidate, safeDescription };
