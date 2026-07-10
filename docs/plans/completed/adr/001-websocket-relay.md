# WebSocket relay over WebRTC

The relay is a Cloudflare Worker that pairs two WebSocket clients per session ID and forwards JSON messages. No storage, no logic beyond routing.

Context: We need bidirectional real-time messaging between a local pi process and a browser. WebRTC DataChannel would give lower latency but requires a signaling server, NAT traversal handling, and both peers online simultaneously. For a prototype, a simple WebSocket relay on Cloudflare Workers is sufficient — the Worker is stateless, connections are long-lived, and the 30s CPU limit doesn't apply to idle WebSocket connections.

Decision: Use WebSocket relay on Cloudflare Workers.

Why: Simplicity. The relay is ~100 lines, symmetric, and both peers get real-time updates without worrying about connection state. WebRTC can be optimized in later if latency matters.