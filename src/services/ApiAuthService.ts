import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../config/envConfig';
import { DummyMobileAllocator } from '../utils/dummyMobileAllocator';

interface StorageStateOrigin {
  origin: string;
  localStorage: { name: string; value: string }[];
}

interface StorageStateFile {
  cookies: any[];
  origins: StorageStateOrigin[];
}

export class ApiAuthService {
  /**
   * Resolves the ERP backend API base URL from API_BASE_URL or ENV.BASE_URL.
   */
  static resolveApiBaseUrl(): string {
    const explicit = (process.env.API_BASE_URL || '').trim().replace(/\/+$/, '');
    if (explicit) return explicit;

    const base = ENV.BASE_URL.toLowerCase();
    if (base.includes('demo.hitechdairy.in')) return 'https://demo-api-hitech.hitechdairy.in';
    if (base.includes('webuat.hitechdairy.in')) return 'https://uat-api-hitech.hitechdairy.in';
    if (base.includes('hitechdairy.in')) return 'https://api-hitech.hitechdairy.in';

    throw new Error(`Cannot infer API_BASE_URL from BASE_URL="${ENV.BASE_URL}". Set API_BASE_URL in .env.`);
  }

  /**
   * Checks whether an existing storageState.json can be reused for the current BASE_URL.
   */
  static isReusableSession(storageStatePath: string): boolean {
    if (process.env.FORCE_LOGIN === 'true') return false;
    if (!fs.existsSync(storageStatePath)) return false;

    const maxAgeHours = Number(process.env.SESSION_MAX_AGE_HOURS || 8);
    try {
      const stats = fs.statSync(storageStatePath);
      if (stats.size < 20) return false;
      const ageMs = Date.now() - stats.mtimeMs;
      if (Number.isFinite(maxAgeHours) && maxAgeHours > 0 && ageMs > maxAgeHours * 3600 * 1000) {
        return false;
      }

      const raw = JSON.parse(fs.readFileSync(storageStatePath, 'utf-8')) as StorageStateFile;
      const targetOrigin = ENV.BASE_URL.replace(/\/+$/, '').toLowerCase();
      const matchingOrigin = (raw.origins || []).find(
        (o) => o.origin.replace(/\/+$/, '').toLowerCase() === targetOrigin
      );
      if (!matchingOrigin) return false;

      const hasSessionData = matchingOrigin.localStorage.some(
        (item) => item.name === 'dairyUserLoggedInData' && Boolean(item.value)
      );
      return hasSessionData;
    } catch {
      return false;
    }
  }

  /**
   * Authenticates directly against the ERP API (without opening UI / captcha browser)
   * and writes storageState.json for Playwright workers to reuse.
   */
  static async loginViaApi(storageStatePath: string): Promise<void> {
    const username = (process.env.ADMIN_USERNAME || '').trim();
    const password = process.env.ADMIN_PASSWORD || '';
    const targetYear = (process.env.FINANCIAL_YEAR || '').trim();

    if (!username || !password) {
      throw new Error('Authentication credentials missing. Please set ADMIN_USERNAME and ADMIN_PASSWORD.');
    }

    const apiBase = this.resolveApiBaseUrl();
    console.log(`🔑 [API Auth] Authenticating as "${username}" via ${apiBase}/Login/UserLogin ...`);

    // 1. Fetch Financial Years (non-fatal if unavailable)
    let fYearData: any = null;
    let fYearId: number | undefined;
    try {
      const fyRes = await fetch(`${apiBase}/MasterDropdown/GetFinancialYear`);
      if (fyRes.ok) {
        fYearData = await fyRes.json();
        const list: any[] = Array.isArray(fYearData?.responseData) ? fYearData.responseData : [];
        const matched = targetYear
          ? list.find((y) => String(y.yearName || '').includes(targetYear))
          : list.find((y) => y.isCurrentYear === 1) || list[0];
        if (matched?.id !== undefined) {
          fYearId = Number(matched.id);
        }
      }
    } catch {
      // Proceed without fYearId if lookup fails
    }

    // 2. Call Login/UserLogin API
    const payload: Record<string, any> = {
      userName: username,
      username,
      password,
      ...(fYearId !== undefined ? { fYearId } : {})
    };

    const loginRes = await fetch(`${apiBase}/Login/UserLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });

    const rawText = await loginRes.text();
    let body: any = null;
    try {
      body = rawText ? JSON.parse(rawText) : null;
    } catch {
      body = null;
    }

    if (!loginRes.ok || (body?.statusCode && String(body.statusCode) !== '200')) {
      const msg = body?.statusMessage || body?.message || loginRes.statusText || `HTTP ${loginRes.status}`;
      throw new Error(`API Login failed: ${msg}`);
    }

    const orgId = body?.responseData?.organizationId ?? body?.organizationId;
    if (orgId !== undefined && orgId !== null) {
      DummyMobileAllocator.setOrganizationId(orgId);
    }

    const sessionPayload = typeof body?.responseData === 'string'
      ? body.responseData
      : JSON.stringify(body?.responseData ?? body);

    const localStorageEntries: { name: string; value: string }[] = [
      { name: 'dairyUserLoggedInData', value: sessionPayload }
    ];
    if (fYearData) {
      localStorageEntries.push({ name: 'financialYearData', value: JSON.stringify(fYearData) });
    }

    const state: StorageStateFile = {
      cookies: [],
      origins: [
        {
          origin: ENV.BASE_URL.replace(/\/+$/, ''),
          localStorage: localStorageEntries
        }
      ]
    };

    fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
    fs.writeFileSync(storageStatePath, JSON.stringify(state, null, 2), 'utf-8');
    console.log(`💾 [API Auth] Session saved to ${storageStatePath}`);
  }

  /**
   * Reuses an existing valid storageState.json for the current BASE_URL,
   * or logs in via API to create one.
   */
  static async ensureAuthenticatedSession(storageStatePath: string): Promise<void> {
    if (this.isReusableSession(storageStatePath)) {
      console.log(`♻️  [API Auth] Reusing existing valid session: ${storageStatePath}\n`);
      return;
    }

    await this.loginViaApi(storageStatePath);
    console.log('✅ [API Auth] Fresh API session ready. Launching workers...\n');
  }
}
