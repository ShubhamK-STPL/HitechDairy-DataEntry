import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../config/envConfig';

/**
 * In-memory, environment/organization-scoped sequence allocator for Variant Codes.
 * Does NOT persist any state to disk across runs so every fresh run starts from
 * the ERP's actual suggested code while still preventing collisions across parallel workers.
 */
export class VariantSequenceAllocator {
  private static readonly legacyStateFile = path.resolve(process.cwd(), 'reports', '.variant_sequence.json');
  private static readonly legacyLockDir = path.resolve(process.cwd(), 'reports', '.variant_sequence.lock');
  private static readonly sequenceByScope = new Map<string, number>();

  private static getScopeKey(scope?: string): string {
    const baseUrl = (process.env.BASE_URL || ENV.BASE_URL || '').replace(/\/+$/, '').toLowerCase();
    const org = (scope || process.env.DEFAULT_ORGANIZATION || 'default').trim().toLowerCase();
    return `${baseUrl}|${org}`;
  }

  /**
   * Claims the next sequential variant code in memory for the current run & scope.
   * If ERP suggests 1, Worker 1 gets 1, Worker 2 gets 2, Worker 3 gets 3, etc.
   */
  static claimNextCode(baseSuggestedCode: string | number, scope?: string): string {
    const cleanNum = Number(String(baseSuggestedCode).replace(/\D/g, '')) || 100;
    const scopeKey = this.getScopeKey(scope);
    const lastAllocated = this.sequenceByScope.get(scopeKey) || 0;

    const allocated = lastAllocated >= cleanNum ? lastAllocated + 1 : cleanNum;
    this.sequenceByScope.set(scopeKey, allocated);

    return String(allocated);
  }

  /**
   * Resets in-memory sequence state (and cleans up any legacy disk state files if present).
   */
  static resetSequence(): void {
    this.sequenceByScope.clear();
    try {
      if (fs.existsSync(this.legacyStateFile)) {
        fs.unlinkSync(this.legacyStateFile);
      }
      if (fs.existsSync(this.legacyLockDir)) {
        fs.rmdirSync(this.legacyLockDir);
      }
    } catch {
      // Ignore cleanup errors for legacy files
    }
  }
}
