# Strict IP privacy deployment (Haven fork)

This fork includes an opt-in **strict IP privacy** policy for deployments that
must not expose a private Haven origin or members' WebRTC addresses to other
members. The supplied Docker Compose file enables it by default.

**This is defense in depth, not anonymity.** A visitor can always learn the
public endpoint they connect to. A TURN peer learns the TURN server address.
Any third-party site a member visits can learn that member's IP. Haven cannot
hide the physical location of a public IP from its owner or network provider.

## Required topology

1. Put the Haven HTTP(S) origin behind a tunnel or reverse proxy. The supplied
   Docker Compose configuration publishes ports 3000 and 3001 on **127.0.0.1
   only**. Do not expose them through a router, alternate port mapping, IPv6
   listener, DNS record, or firewall exception. Restrict direct access to the
   origin at the network/firewall layer as well.
2. Host **TURN on a separate public VPS or relay provider**, not on the home
   network whose IP you want to conceal. Configure its TLS and authentication
   independently; verify that UDP/TCP connectivity works. Do not use the
   origin-hosted built-in mediasoup relay to conceal the origin.
3. Configure `TURN_URL` and `TURN_SECRET` (preferred) or the TURN username and
   password, or configure TURN in the admin UI. TURN credentials should not be
   committed to Git. For a remote TLS relay, use an appropriate `turns:` URI.
4. Set `PUBLIC_URL` to the tunnel/reverse proxy hostname. Configure
   `TRUST_PROXY` only for the known reverse proxy hop(s). Keep the media proxy
   enabled. Install ExifTool and FFmpeg; the provided Dockerfile includes both.
5. Use the fork's local image (`docker compose build && docker compose up -d`),
   not the upstream `ghcr.io/ancsemi/haven` image.

## What strict mode enforces

Set `HAVEN_STRICT_IP_PRIVACY=true` in the server environment.

- `/api/ice-servers` requires TURN and returns `iceTransportPolicy: relay`.
  Without TURN it returns HTTP 503; voice must not fall back to host or STUN.
- Voice joins and rejoins require a privacy-compatible client and configured
  TURN. The signaling server rejects non-relay ICE candidates and SDP that
  advertises non-relay candidate, connection, or origin addresses.
- Voice in this mode uses TURN-only WebRTC rather than the built-in SFU, which
  can advertise the host's own network address.
- `/api/connection-address` is admin-only. The public health check reports
  online status only, without a server fingerprint.
- Unfurling member-controlled links and fetching uncached external images are
  disabled: those requests would otherwise expose the **origin's egress IP**
  to the owner of a posted URL.
- The browser Content Security Policy restricts third-party scripts, frames,
  images, media and connections. Features such as third-party embeds, remote
  GIFs, login CAPTCHA and external media may not work in strict mode.
- Upload processing requires ExifTool and FFmpeg rather than silently allowing
  potentially location-tagged video/photo formats through. Older media and
  backups should be reviewed separately.

## Operational limits

- **Network isolation is mandatory.** Application code alone cannot prevent
  direct origin discovery if the machine exposes another service or outbound
  connection. Use an outbound proxy/egress gateway if the origin's public
  egress IP must also remain concealed from external services; restrict
  outbound traffic at the firewall, and audit bots, webhooks, integrations,
  push services, OAuth, DDNS and external APIs.
- TURN relay configuration is not proof of reachability. Test a real call with
  two accounts on separate networks, then inspect browser WebRTC internals to
  verify that only `relay` candidates are used. Test TURN outage and missing
  configuration; voice must fail rather than establish a direct connection.
- Invite codes grant access; they are not a substitute for authentication,
  private networking, role permissions, or a secure reverse proxy.
- The public login page may still display the deliberately public server name
  and branding. Administrators can access connection diagnostics.
- IP addresses can still be stored for rate limits, security auditing, and
  bans. Strict mode does not promise that operators or infrastructure
  providers cannot see or store member IPs.
- Changes to the browser's WebRTC implementation or third-party clients should
  be re-audited before deployment. Never treat a client-supplied capability
  flag alone as a privacy guarantee.

## Verification

Run `npm test` and `node --test test/strictIpPrivacy.test.js` in a full
checkout with dependencies installed. Validate the tunnel, TURN and egress
firewall on the actual deployment before accepting public invite codes.
