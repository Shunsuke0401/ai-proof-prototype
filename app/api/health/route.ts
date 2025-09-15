// Simple health check endpoint for Fly.io / container orchestration
// Returns basic liveness info; avoid heavy dependencies.

export async function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    nodeEnv: process.env.NODE_ENV,
  });
}
