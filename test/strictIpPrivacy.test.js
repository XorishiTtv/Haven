'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const privacy = require('../src/ipPrivacy');

const relay = 'candidate:1 1 udp 2122260223 203.0.113.7 50000 typ relay raddr 0.0.0.0 rport 0';
const host = 'candidate:2 1 udp 2122260223 192.168.1.44 50001 typ host';
const reflexive = 'candidate:3 1 udp 2122260223 198.51.100.22 50002 typ srflx raddr 192.168.1.44 rport 50001';
const sdp = (candidate = relay, origin = '127.0.0.1', connection = '0.0.0.0') => ({
  type: 'offer',
  sdp: [
    'v=0',
    `o=- 1234 2 IN IP4 ${origin}`,
    's=-',
    't=0 0',
    `c=IN IP4 ${connection}`,
    'a=rtcp:9 IN IP4 0.0.0.0',
    `a=${candidate}`,
    ''
  ].join('\r\n')
});

test('strict privacy is explicitly configured', () => {
  const previous = process.env.HAVEN_STRICT_IP_PRIVACY;
  try {
    process.env.HAVEN_STRICT_IP_PRIVACY = 'true';
    assert.equal(privacy.enabled(), true);
    process.env.HAVEN_STRICT_IP_PRIVACY = 'false';
    assert.equal(privacy.enabled(), false);
  } finally {
    if (previous === undefined) delete process.env.HAVEN_STRICT_IP_PRIVACY;
    else process.env.HAVEN_STRICT_IP_PRIVACY = previous;
  }
});

test('strict mode requires configured TURN and fails closed on database errors', () => {
  const previous = process.env.TURN_URL;
  try {
    delete process.env.TURN_URL;
    assert.equal(privacy.hasTurnConfiguration({ prepare: () => ({ get: () => ({ value: '' }) }) }), false);
    assert.equal(privacy.hasTurnConfiguration({ prepare: () => { throw Error('db unavailable'); } }), false);
    assert.equal(privacy.hasTurnConfiguration({ prepare: () => ({ get: () => ({ value: 'turns:relay.example:5349' }) }) }), true);
    process.env.TURN_URL = 'turn:relay.example:3478';
    assert.equal(privacy.hasTurnConfiguration({ prepare: () => { throw Error('db unavailable'); } }), true);
  } finally {
    if (previous === undefined) delete process.env.TURN_URL;
    else process.env.TURN_URL = previous;
  }
});

test('only relay ICE candidates can be forwarded', () => {
  assert.equal(privacy.safeCandidate({ candidate: relay }), true);
  assert.equal(privacy.safeCandidate({ candidate: host }), false);
  assert.equal(privacy.safeCandidate({ candidate: reflexive }), false);
  assert.equal(privacy.safeCandidate({ candidate: relay.replace('raddr 0.0.0.0', 'raddr 192.168.1.44') }), false);
  assert.equal(privacy.safeCandidate({ candidate: '' }), true);
  assert.equal(privacy.safeCandidate(null), true);
  assert.equal(privacy.safeCandidate({ candidate: 'fake typ relay' }), false);
});

test('SDP cannot include host or reflexive candidates or origin addresses', () => {
  assert.equal(privacy.safeDescription(sdp()), true);
  assert.equal(privacy.safeDescription(sdp(host)), false);
  assert.equal(privacy.safeDescription(sdp(reflexive)), false);
  assert.equal(privacy.safeDescription(sdp(relay, '192.168.1.44')), false);
  assert.equal(privacy.safeDescription(sdp(relay, '127.0.0.1', '192.168.1.44')), false);
  assert.equal(privacy.safeDescription({ type: 'answer', sdp: 'v=0\r\na=remote-candidates:1 192.168.1.44 50001\r\n' }), false);
  assert.equal(privacy.safeDescription({ type: 'offer', sdp: 'v=0\r\nc=IN IP4 0.0.0.0\r\n' }), true);
});
