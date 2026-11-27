import type { IncomingMessage, ServerResponse } from 'node:http';

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    sendJson(res, 200, {
      configured: false,
      message: 'Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO in Vercel environment variables.',
      runs: []
    });
    return;
  }

  try {
    const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/onboard.yml/runs?per_page=8`;
    const runsRes = await fetch(runsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-Onboarding-Runner'
      }
    });

    if (!runsRes.ok) {
      const err = await runsRes.json().catch(() => ({}));
      sendJson(res, 200, {
        configured: true,
        error: (err as any)?.message || runsRes.statusText,
        runs: []
      });
      return;
    }

    const runsData = (await runsRes.json()) as any;
    const rawRuns = Array.isArray(runsData.workflow_runs) ? runsData.workflow_runs : [];

    const enrichedRuns = await Promise.all(
      rawRuns.map(async (run: any) => {
        let artifacts: Array<{ id: number; name: string; size_in_bytes: number; download_url: string }> = [];
        try {
          const artRes = await fetch(run.artifacts_url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'Vercel-Onboarding-Runner'
            }
          });
          if (artRes.ok) {
            const artData = (await artRes.json()) as any;
            if (Array.isArray(artData.artifacts)) {
              artifacts = artData.artifacts.map((a: any) => ({
                id: a.id,
                name: a.name,
                size_in_bytes: a.size_in_bytes,
                download_url: a.archive_download_url
              }));
            }
          }
        } catch {}

        return {
          id: run.id,
          runNumber: run.run_number,
          name: run.name || 'Onboarding Run',
          status: run.status, // queued, in_progress, completed
          conclusion: run.conclusion, // success, failure, cancelled, etc.
          createdAt: run.created_at,
          updatedAt: run.updated_at,
          htmlUrl: run.html_url,
          artifacts
        };
      })
    );

    sendJson(res, 200, {
      configured: true,
      repository: `${owner}/${repo}`,
      runs: enrichedRuns
    });
  } catch (err: any) {
    sendJson(res, 500, { error: err.message || 'Failed to fetch status from GitHub' });
  }
}
