import { Reporter, TestCase, TestResult, FullConfig, Suite } from '@playwright/test/reporter';
import mysql from 'mysql2/promise';

export default class DbReporter implements Reporter {
  private pool: mysql.Pool;
  private runId: number | null = null;
  private suiteStartTime: Date = new Date();

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'test_db',
      port: Number(process.env.DB_PORT) || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  async onBegin(config: FullConfig, suite: Suite) {
    this.suiteStartTime = new Date();
    try {
      // Connect to DB and check if it's available
      const connection = await this.pool.getConnection();
      connection.release();

      const [result] = await this.pool.execute(
        `INSERT INTO test_runs (run_name, environment, total_tests, started_at, status) 
         VALUES (?, ?, ?, ?, ?)`,
        ['Playwright Run', process.env.ENVIRONMENT || 'local', suite.allTests().length, this.suiteStartTime, 'running']
      );
      this.runId = (result as any).insertId;
      console.log(`\n[DbReporter] Started test run with DB ID: ${this.runId}`);
    } catch (e) {
      console.error('\n[DbReporter] Failed to initialize test run in DB:', e);
      // We don't throw to prevent stopping the tests if DB is down
    }
  }

  async onTestEnd(test: TestCase, result: TestResult) {
    if (!this.runId) return;

    try {
      // Parse tags
      const tags = test.tags ? JSON.stringify(test.tags) : '[]';
      
      const [dbResult] = await this.pool.execute(
        `INSERT INTO test_results 
         (run_id, test_name, suite_name, file_path, status, duration_ms, retry_count, is_flaky, tags, error_message, stack_trace, started_at, completed_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.runId,
          test.title,
          test.parent.title,
          test.location.file,
          result.status,
          result.duration,
          result.retry,
          result.status === 'passed' && result.retry > 0 ? 1 : 0, // is_flaky
          tags,
          result.error?.message || null,
          result.error?.stack || null,
          result.startTime,
          new Date(result.startTime.getTime() + result.duration)
        ]
      );
      
      const testResultId = (dbResult as any).insertId;

      // Insert standard output logs
      if (result.stdout.length > 0) {
        for (const out of result.stdout) {
          await this.pool.execute(
            `INSERT INTO test_logs (test_result_id, level, message) VALUES (?, ?, ?)`,
            [testResultId, 'info', typeof out === 'string' ? out : out.toString()]
          );
        }
      }

      // Insert standard error logs
      if (result.stderr.length > 0) {
        for (const err of result.stderr) {
          await this.pool.execute(
            `INSERT INTO test_logs (test_result_id, level, message) VALUES (?, ?, ?)`,
            [testResultId, 'error', typeof err === 'string' ? err : err.toString()]
          );
        }
      }
    } catch (e) {
      console.error(`\n[DbReporter] Failed to log test result for "${test.title}":`, e);
    }
  }

  async onEnd(result: { status: string }) {
    if (!this.runId) {
      await this.pool.end();
      return;
    }
    
    try {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - this.suiteStartTime.getTime();
      
      await this.pool.execute(
        `UPDATE test_runs SET status = ?, completed_at = ?, duration_ms = ? WHERE id = ?`,
        [result.status, completedAt, durationMs, this.runId]
      );
      console.log(`\n[DbReporter] Finished DB test run with ID: ${this.runId}. Status: ${result.status}`);
      
    } catch (e) {
      console.error('\n[DbReporter] Failed to complete test run in DB:', e);
    } finally {
      await this.pool.end(); // Always close connections
    }
  }
}
