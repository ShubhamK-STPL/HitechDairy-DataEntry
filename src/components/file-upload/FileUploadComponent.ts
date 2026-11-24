import { expect, type Locator } from '@playwright/test';

export interface FileUploadConfig {
  readonly inputSelector?: string;
  readonly fileNameDisplaySelector?: string;
}

export class FileUploadComponent {
  private readonly inputLocator: Locator;
  private readonly fileNameSelector: string;

  constructor(
    readonly root: Locator,
    readonly label: string = 'FileUpload',
    config?: FileUploadConfig
  ) {
    this.inputLocator = config?.inputSelector
      ? this.root.locator(config.inputSelector)
      : this.root.locator('input[type="file"]').or(this.root);
    this.fileNameSelector = config?.fileNameDisplaySelector ?? '.file-name, .uploaded-file, .file-list';
  }

  async upload(filePath: string | string[]): Promise<void> {
    await this.inputLocator.setInputFiles(filePath);
  }

  async clear(): Promise<void> {
    await this.inputLocator.setInputFiles([]);
  }

  async fileName(): Promise<string> {
    const displayLoc = this.root.locator(this.fileNameSelector).first();
    if (await displayLoc.isVisible()) {
      return (await displayLoc.textContent())?.trim() ?? '';
    }
    // Fallback: extract value from input
    const val = await this.inputLocator.inputValue();
    return val.split(/[/\\]/).pop() ?? '';
  }

  async expectUploaded(expectedFileName: string | RegExp): Promise<void> {
    await expect(async () => {
      const current = await this.fileName();
      if (typeof expectedFileName === 'string') {
        expect(current).toContain(expectedFileName);
      } else {
        expect(current).toMatch(expectedFileName);
      }
    }, `FileUpload(${this.label}): expected file '${String(expectedFileName)}'`).toPass();
  }
}
