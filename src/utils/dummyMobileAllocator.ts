import fs from 'node:fs';
import path from 'node:path';

/**
 * Atomic cross-process allocator for sequential dummy mobile numbers.
 * Default template: 600 + {organizationId in 3 digits} + 0001 onwards
 * Example: orgId 417 -> 6004170001, 6004170002, 6004170003...
 * Or allows custom starting dummy number entered by user.
 */
export class DummyMobileAllocator {
  private static readonly stateDir = path.resolve(process.cwd(), 'reports');
  private static readonly stateFile = path.resolve(process.cwd(), 'reports', '.mobile_sequence.json');
  private static readonly lockDir = path.resolve(process.cwd(), 'reports', '.mobile_sequence.lock');
  private static readonly orgFile = path.resolve(process.cwd(), 'reports', '.session_org_id.json');

  private static customStartingMobile?: string;
  private static seenMobiles = new Set<string>();

  /**
   * Tracks encountered phone numbers during execution to identify duplicates
   */
  static trackMobile(mobile: string): void {
    const clean = mobile.replace(/\D/g, '').slice(-10);
    if (/^[6-9]\d{9}$/.test(clean)) {
      this.seenMobiles.add(clean);
    }
  }

  /**
   * Checks if a phone number was already seen in this execution run
   */
  static isDuplicateMobile(mobile: string): boolean {
    const clean = mobile.replace(/\D/g, '').slice(-10);
    return clean.length === 10 && this.seenMobiles.has(clean);
  }

  static clearTrackedMobiles(): void {
    this.seenMobiles.clear();
  }

  /**
   * Acquires atomic cross-process lock using directory creation.
   */
  private static acquireLock(maxWaitMs: number = 10000): boolean {
    if (!fs.existsSync(this.stateDir)) {
      try {
        fs.mkdirSync(this.stateDir, { recursive: true });
      } catch {}
    }

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        fs.mkdirSync(this.lockDir);
        return true;
      } catch (err: any) {
        if (err.code !== 'EEXIST') break;
        try {
          const stat = fs.statSync(this.lockDir);
          if (Date.now() - stat.mtimeMs > 10000) {
            fs.rmdirSync(this.lockDir);
            continue;
          }
        } catch {}
        const endWait = Date.now() + 50;
        while (Date.now() < endWait) {}
      }
    }
    return false;
  }

  private static releaseLock(): void {
    try {
      if (fs.existsSync(this.lockDir)) {
        fs.rmdirSync(this.lockDir);
      }
    } catch {}
  }

  /**
   * Saves organizationId captured from Login/UserLogin API
   */
  static setOrganizationId(orgId: number | string): void {
    const cleanId = String(orgId).trim();
    if (!cleanId) return;
    process.env.LOGGED_IN_ORGANIZATION_ID = cleanId;

    try {
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }
      fs.writeFileSync(this.orgFile, JSON.stringify({ organizationId: cleanId }, null, 2));
      console.log(`🏢 [DummyMobileAllocator] Organization ID saved: ${cleanId}`);
    } catch {}
  }

  /**
   * Retrieves organizationId from environment or session cache file.
   */
  static getOrganizationId(): string {
    if (process.env.LOGGED_IN_ORGANIZATION_ID) {
      return process.env.LOGGED_IN_ORGANIZATION_ID;
    }
    if (fs.existsSync(this.orgFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.orgFile, 'utf-8'));
        if (data?.organizationId) {
          process.env.LOGGED_IN_ORGANIZATION_ID = String(data.organizationId);
          return String(data.organizationId);
        }
      } catch {}
    }
    return '001';
  }

  /**
   * Formats organizationId into 3 digits and builds default starting mobile:
   * 600 + {orgId in 3 digits} + 0001 (10 digits)
   */
  static getDefaultStartingMobile(orgId?: number | string): string {
    const resolvedOrgId = orgId ? String(orgId).trim() : this.getOrganizationId();
    const orgId3Digit = String(resolvedOrgId || '1').padStart(3, '0').slice(-3);
    return `600${orgId3Digit}0001`;
  }

  static setCustomStartingMobile(mobile?: string): void {
    if (mobile && /^\d{10}$/.test(mobile.trim())) {
      this.customStartingMobile = mobile.trim();
    } else {
      this.customStartingMobile = undefined;
    }
  }

  /**
   * Clears state for a fresh execution run.
   */
  static resetSequence(customStart?: string): void {
    this.seenMobiles.clear();
    if (customStart) {
      this.setCustomStartingMobile(customStart);
    }
    const lockAcquired = this.acquireLock(5000);
    try {
      if (fs.existsSync(this.stateFile)) {
        fs.unlinkSync(this.stateFile);
      }
    } catch {} finally {
      if (lockAcquired) this.releaseLock();
    }
  }

  /**
   * Attempts to resolve and cache organizationId from browser page localStorage or cookies if available
   */
  static async resolveOrganizationIdFromPage(page: any): Promise<string> {
    try {
      const storageState = await page.evaluate(() => {
        try {
          const userStr = localStorage.getItem('user') || localStorage.getItem('currentUser') || localStorage.getItem('userData');
          if (userStr) {
            const parsed = JSON.parse(userStr);
            if (parsed.organizationId) return parsed.organizationId;
          }
        } catch {}
        return null;
      });
      if (storageState) {
        this.setOrganizationId(storageState);
        return String(storageState);
      }
    } catch {}
    return this.getOrganizationId();
  }

  /**
   * Claims the next unique dummy mobile number across workers/records:
   * First record gets starting mobile, subsequent records increment onwards.
   */
  static claimNextMobile(customStart?: string, orgId?: number | string): string {
    const lockAcquired = this.acquireLock(15000);

    const initialStart = (customStart || this.customStartingMobile || process.env.START_DUMMY_MOBILE || '').trim();
    const fallbackStart = this.getDefaultStartingMobile(orgId);
    const startMobile = /^\d{10}$/.test(initialStart) ? initialStart : fallbackStart;

    let allocatedMobile = startMobile;

    try {
      let state: { lastAllocated?: string } = {};
      if (fs.existsSync(this.stateFile)) {
        try {
          state = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8')) || {};
        } catch {}
      }

      if (state.lastAllocated && /^\d{10}$/.test(state.lastAllocated)) {
        const nextBig = BigInt(state.lastAllocated) + 1n;
        allocatedMobile = nextBig.toString().padStart(10, '0');
      } else {
        allocatedMobile = startMobile;
      }

      state.lastAllocated = allocatedMobile;
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch {
      allocatedMobile = startMobile;
    } finally {
      if (lockAcquired) this.releaseLock();
    }

    return allocatedMobile;
  }
}
