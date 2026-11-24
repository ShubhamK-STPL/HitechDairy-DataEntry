import type { IncomingMessage, ServerResponse } from 'node:http';

interface RunPayload {
  fileName?: string;
  fileBase64?: string;
  module: string;
  env?: string;
  workers?: number;
  parallel?: boolean;
  retryFailed?: boolean;
  useAiIntelligence?: boolean;
  allowDummyMobile?: boolean;
  startMobile?: string;
  limit?: number;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large (max 50MB)'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed. Use POST.' });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !owner || !repo) {
    sendJson(res, 500, {
      error: 'Missing required Vercel environment variables.',
      details: 'Please set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO in your Vercel project settings.'
    });
    return;
  }

  try {
    const rawBody = await readBody(req);
    const body: RunPayload = rawBody ? JSON.parse(rawBody) : {};

    const moduleName = body.module || 'Products';
    const envTarget = body.env || 'demo';
    const workers = Math.max(1, Math.min(4, Number(body.workers || 2)));
    const parallel = body.parallel !== false;
    const retryFailed = body.retryFailed !== false;
    const useAi = body.useAiIntelligence !== false;
    const limit = body.limit && body.limit > 0 ? Math.floor(body.limit) : 0;

    const runId = `run_${Date.now()}`;
    let excelFilePath = 'test-data/Master_Onboarding_Template.xlsx';

    // If an Excel file was uploaded from browser (Base64)
    if (body.fileBase64 && body.fileName) {
      const cleanFileName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetRepoPath = `test-data/uploads/${runId}_${cleanFileName}`;

      const uploadUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${targetRepoPath}`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Vercel-Onboarding-Runner',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `[Cloud Runner] Upload ${cleanFileName} for run ${runId}`,
          content: body.fileBase64,
          branch
        })
      });

      if (!uploadRes.ok) {
        const errJson = await uploadRes.json().catch(() => ({}));
        throw new Error(
          `Failed to store Excel file in GitHub: ${(errJson as any)?.message || uploadRes.statusText}`
        );
      }

      excelFilePath = targetRepoPath;
    } else if (body.fileName) {
      excelFilePath = `test-data/${body.fileName}`;
    }

    // Trigger GitHub Actions workflow_dispatch
    const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/onboard.yml/dispatches`;
    const dispatchRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-Onboarding-Runner',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: branch,
        inputs: {
          module: moduleName,
          env_target: envTarget,
          use_ai: String(useAi),
          workers: String(workers),
          parallel: String(parallel),
          retry_failed: String(retryFailed),
          allow_dummy_mobile: String(Boolean(body.allowDummyMobile)),
          start_dummy_mobile: body.allowDummyMobile && body.startMobile ? String(body.startMobile).trim() : '',
          limit: String(limit),
          excel_file_path: excelFilePath,
          run_id: runId
        }
      })
    });

    if (!dispatchRes.ok) {
      const errJson = await dispatchRes.json().catch(() => ({}));
      throw new Error(
        `Failed to trigger GitHub Actions workflow: ${(errJson as any)?.message || dispatchRes.statusText}`
      );
    }

    sendJson(res, 200, {
      success: true,
      runId,
      module: moduleName,
      env: envTarget,
      filePath: excelFilePath,
      actionsUrl: `https://github.com/${owner}/${repo}/actions/workflows/onboard.yml`,
      message: 'GitHub Actions workflow triggered successfully!'
    });
  } catch (err: any) {
    sendJson(res, 500, { error: err.message || 'Unexpected serverless error' });
  }
}
