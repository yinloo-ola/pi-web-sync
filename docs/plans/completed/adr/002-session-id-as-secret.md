# Session ID as shared secret

The URL path contains a session ID that also serves as the shared secret. Both pi and the web app must know this ID to connect. No separate auth layer.

Context: We need simple access control so random people can't connect to someone's pi session. A separate auth system (API keys, OAuth) is overkill for personal use. The session ID itself can be a random hash (e.g., 8-12 hex chars) that's hard to guess.

Decision: The session ID in the URL path is the credential. Anyone who knows the ID can connect.

Why: Simple, no infrastructure needed, sufficient for personal use. The ID is a random hash so it's not guessable. If stronger auth is needed later, a query param token can be added without changing the architecture.