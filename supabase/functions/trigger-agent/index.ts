// trigger-agent: Supabase Edge Function (Deno), called by a Database Webhook on
// INSERT into public.research_jobs. It wakes the OpenClaw agent on Agent 37 with
// "Process research job <id> for trip <trip_id>". The agent claims the job itself
// (ausflieger jobs claim <id>), so duplicate deliveries are harmless.
//
// Secrets (supabase secrets set ...; names only, values never in the repo):
//   AGENT37_URL     instance base URL, e.g. https://<instance-id>.agent37.app
//                   (or the OpenClaw gateway base URL when AGENT37_MODE=openclaw-hooks)
//   AGENT37_TOKEN   Agent 37 API key (sent as X-Agent37-Key), or the OpenClaw hooks token
//   AGENT37_MODE    optional: "responses" (default, Agent 37 /v1/responses) | "openclaw-hooks" (/hooks/agent)
//   WEBHOOK_SECRET  optional: if set, requests must carry header x-webhook-secret with this value
//
// Deploy: supabase functions deploy trigger-agent --no-verify-jwt
// (auth is the x-webhook-secret header; the Database Webhook can also send the service role JWT instead.)

interface ResearchJobRecord {
  id: string;
  trip_id: string;
  kind: string;
  status: string;
  card_id: string | null;
  upload_id: string | null;
  query: string | null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: ResearchJobRecord | null;
  old_record: ResearchJobRecord | null;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export function buildMessage(job: ResearchJobRecord): string {
  const extra = [
    `kind ${job.kind}`,
    job.card_id ? `card ${job.card_id}` : null,
    job.upload_id ? `upload ${job.upload_id}` : null,
  ].filter(Boolean).join(', ');
  return `Process research job ${job.id} for trip ${job.trip_id} (${extra}). ` +
    `Use the ausflieger-research skill: claim it with \`ausflieger jobs claim ${job.id}\` and stop if it is already claimed.`;
}

/**
 * Agent 37 /v1/responses is synchronous unless stream=true. We stream, read until the
 * response id appears (or a few seconds pass), then detach; the run continues on the instance
 * and can be re-attached via GET /v1/responses/{id}/stream.
 */
async function sendAgent37(baseUrl: string, token: string, job: ResearchJobRecord) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent37-Key': token, Accept: 'text/event-stream' },
    body: JSON.stringify({
      input: buildMessage(job),
      stream: true,
      metadata: { source: 'ausflieger-trigger-agent', job_id: job.id, trip_id: job.trip_id, kind: job.kind },
    }),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`Agent 37 responded ${res.status}: ${text}`);
  }
  let responseId: string | null = null;
  const reader = res.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let buf = '';
    const deadline = Date.now() + 8000;
    try {
      while (!responseId && Date.now() < deadline) {
        const chunk = await Promise.race([
          reader.read(),
          new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), Math.max(0, deadline - Date.now()))),
        ]);
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        const m = buf.match(/"id"\s*:\s*"([A-Za-z0-9_-]{8,})"/);
        if (m) responseId = m[1];
      }
    } finally {
      // Detach from the stream; the agent run continues server-side.
      reader.cancel().catch(() => {});
    }
  }
  return { response_id: responseId };
}

/** Alternative: OpenClaw gateway webhook (hooks.enabled in openclaw.json). Returns {ok, runId} immediately. */
async function sendOpenClawHook(baseUrl: string, token: string, job: ResearchJobRecord) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/hooks/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': `job-${job.id}` },
    body: JSON.stringify({ message: buildMessage(job), name: 'Ausflieger research job', deliver: false }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenClaw hook responded ${res.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (secret && !safeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) {
    return json(401, { error: 'unauthorized' });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON' });
  }
  const job = payload.record;
  if (payload.table !== 'research_jobs' || payload.type !== 'INSERT' || !job?.id || !job.trip_id) {
    return json(200, { skipped: true, reason: 'not a research_jobs INSERT' });
  }
  if (job.status !== 'queued') return json(200, { skipped: true, reason: `status ${job.status}` });

  const baseUrl = Deno.env.get('AGENT37_URL');
  const token = Deno.env.get('AGENT37_TOKEN');
  if (!baseUrl || !token) return json(500, { error: 'AGENT37_URL / AGENT37_TOKEN not configured' });
  const mode = Deno.env.get('AGENT37_MODE') ?? 'responses';

  try {
    const result = mode === 'openclaw-hooks'
      ? await sendOpenClawHook(baseUrl, token, job)
      : await sendAgent37(baseUrl, token, job);
    console.log(JSON.stringify({ msg: 'agent triggered', job_id: job.id, mode, result }));
    return json(202, { dispatched: true, job_id: job.id, mode, ...result });
  } catch (e) {
    // The job stays queued; the cron/heartbeat fallback (ausflieger jobs next) will pick it up.
    console.error(JSON.stringify({ msg: 'agent trigger failed', job_id: job.id, error: String(e) }));
    return json(502, { dispatched: false, job_id: job.id, error: String(e).slice(0, 300) });
  }
}

Deno.serve(handler);
