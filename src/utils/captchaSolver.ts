import { Page } from '@playwright/test';
import { createWorker, PSM } from 'tesseract.js';

export class CaptchaSolver {
  /**
   * Extracts the captcha from the canvas element and performs OCR using Tesseract.js.
   * Renders the canvas onto a pure white background with 3x scaling for optimal recognition accuracy.
   *
   * @param page - Playwright Page instance
   * @param canvasSelector - CSS selector for the captcha canvas (default: 'canvas#captcha1, #captcha canvas')
   * @returns 6-digit captcha string
   */
  public static async solveFromCanvas(
    page: Page,
    canvasSelector: string = 'canvas#captcha1, #captcha canvas'
  ): Promise<string> {
    const canvasLocator = page.locator(canvasSelector).first();
    await canvasLocator.waitFor({ state: 'visible', timeout: 10000 });

    // Extract canvas pixels rendered on a crisp white background
    const dataUrl = await page.evaluate((selector) => {
      const orig = document.querySelector<HTMLCanvasElement>(selector);
      if (!orig) return null;

      const scale = 3;
      const offscreen = document.createElement('canvas');
      offscreen.width = orig.width * scale;
      offscreen.height = orig.height * scale;

      const ctx = offscreen.getContext('2d');
      if (!ctx) return null;

      // Fill pure white background to avoid transparent artifacts
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);

      // Draw original canvas enlarged
      ctx.drawImage(orig, 0, 0, offscreen.width, offscreen.height);

      return offscreen.toDataURL('image/png');
    }, canvasSelector);

    if (!dataUrl) {
      throw new Error(`Captcha canvas not found using selector: ${canvasSelector}`);
    }

    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Perform OCR with Tesseract
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });

    const result = await worker.recognize(imageBuffer);
    await worker.terminate();

    const digitsOnly = result.data.text.replace(/\D/g, '').trim();
    return digitsOnly;
  }
}

