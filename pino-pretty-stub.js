// Lightweight stub for optional 'pino-pretty' dependency referenced by walletconnect logger.
// Prevents build failures when pretty printer is not installed in minimal environments.
module.exports = function stub() { return { write: () => {} }; };
