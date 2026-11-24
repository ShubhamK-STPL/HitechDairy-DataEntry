import fs from 'node:fs';
import path from 'node:path';

export class VariantSequenceAllocator {
  private static readonly stateDir = path.resolve(process.cwd(), 'reports');
  private static readonly stateFile = path.resolve(process.cwd(), 'reports', '.variant_sequence.json');
  private static readonly lockDir = path.resolve(process.cwd(), 'reports', '.variant_sequence.lock');

  /**
   * Acquires an atomic cross-process file lock using directory creation.
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
        // Check for stale lock (older than 10 seconds)
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
   * Claims the next sequential variant code across all concurrent workers.
   * If ERP suggests 113, Worker 1 gets 113, Worker 2 gets 114, Worker 3 gets 115, etc.
   */
  static claimNextCode(baseSuggestedCode: string | number): string {
    const cleanNum = Number(String(baseSuggestedCode).replace(/\D/g, '')) || 100;
    const lockAcquired = this.acquireLock(15000);

    let allocated = cleanNum;

    try {
      let state: { lastAllocated?: number } = {};
      if (fs.existsSync(this.stateFile)) {
        try {
          const content = fs.readFileSync(this.stateFile, 'utf8');
          state = JSON.parse(content);
        } catch {}
      }

      const lastAllocated = Number(state.lastAllocated) || 0;
      if (lastAllocated >= cleanNum) {
        allocated = lastAllocated + 1;
      } else {
        allocated = cleanNum;
      }

      state.lastAllocated = allocated;
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf8');
    } catch (err: any) {
      console.warn(`[VariantSequenceAllocator] Warning during sequence allocation: ${err.message}`);
    } finally {
      if (lockAcquired) {
        this.releaseLock();
      }
    }

    return String(allocated);
  }

  /**
   * Resets sequence state (useful at the beginning of a fresh test run).
   */
  static resetSequence(): void {
    const lockAcquired = this.acquireLock(5000);
    try {
      if (fs.existsSync(this.stateFile)) {
        fs.unlinkSync(this.stateFile);
      }
    } catch {} finally {
      if (lockAcquired) {
        this.releaseLock();
      }
    }
  }
}
