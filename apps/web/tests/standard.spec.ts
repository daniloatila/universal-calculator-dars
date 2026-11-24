import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function calculate(page: Page, expression: string, name = 'Expression') {
  const input = page.getByRole('textbox', { name, exact: true });
  await input.fill(expression);
  await input.press('Enter');
}

async function ready(page: Page) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Expression', exact: true }).fill('0');
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeEnabled();
}

test('Standard calculates exact decimal and rational results, precedence and roots through WASM', async ({ page }) => {
  await ready(page);
  const result = page.getByTestId('result');
  await calculate(page, '0.1+0.2');
  await expect(result).toHaveText('0.3');
  await expect(page.getByText('Approximate', { exact: true })).toHaveCount(0);
  await calculate(page, '1/3');
  await expect(page.getByText('Approximate', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Exact', exact: true }).click();
  await expect(result).toHaveText('1/3');
  await expect(page.getByText('0.333333333333333333333333', { exact: true })).toBeVisible();
  for (const [expression, expected] of [
    ['2+3×4', '14'], ['−2^2', '-4'], ['(2+3)^2', '25'], ['√9+cbrt(-8)', '1'], ['200+10%', '220'],
  ] as const) {
    await calculate(page, expression);
    await expect(result).toHaveText(expected);
  }
});

test('errors are recoverable and failed calculations are excluded from history', async ({ page }) => {
  await ready(page);
  const result = page.getByTestId('result');
  await calculate(page, '5/0');
  await expect(page.getByText('Division by zero is undefined.')).toBeVisible();
  await expect(result).toHaveText('—');
  await calculate(page, 'sqrt(-4)');
  await expect(page.getByText('This operation is outside its mathematical domain.')).toBeVisible();
  await calculate(page, 'alert(1)');
  await expect(page.getByText('This expression is incomplete or invalid.')).toBeVisible();
  await expect(page.getByText('No calculations yet')).toBeVisible();
  await calculate(page, '4+2');
  await expect(result).toHaveText('6');
  await expect(page.getByRole('button', { name: 'Use history expression: 4+2' })).toBeVisible();
});

test('keypad insertion, keyboard editing, undo and redo operate on the expression', async ({ page }) => {
  await ready(page);
  const input = page.getByRole('textbox', { name: 'Expression', exact: true });
  await input.fill('');
  await page.getByRole('button', { name: '9', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: '7', exact: true }).click();
  await expect(input).toHaveValue('9+7');
  await input.press('Control+z');
  await expect(input).toHaveValue('9+');
  await input.press('Control+y');
  await expect(input).toHaveValue('9+7');
  await input.press('ArrowLeft');
  await input.press('Delete');
  await expect(input).toHaveValue('9+');
  await input.press('8');
  await input.press('=');
  await expect(page.getByTestId('result')).toHaveText('17');
  await input.press('Escape');
  await expect(input).toHaveValue('');
});

test('memory, result copying and history use session state only', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  await calculate(page, '1/3');
  await page.getByRole('button', { name: 'Exact', exact: true }).click();
  await page.getByRole('button', { name: 'Copy result' }).click();
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1/3');
  await page.getByRole('button', { name: 'Store in memory' }).click();
  await expect(page.getByRole('button', { name: 'Recall memory' })).toBeEnabled();
  const input = page.getByRole('textbox', { name: 'Expression', exact: true });
  await input.fill('1/6');
  await page.getByRole('button', { name: 'Add to memory' }).click();
  await expect(page.getByRole('button', { name: 'Add to memory' })).toBeEnabled();
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByRole('button', { name: 'Recall memory' }).click();
  await expect(input).toHaveValue('1/2');
  await input.press('Enter');
  await expect(page.getByTestId('result')).toHaveText('1/2');
  await page.getByRole('button', { name: 'Use history expression: 1/3' }).click();
  await expect(input).toHaveValue('1/3');
  await page.reload();
  await expect(page.getByText('No calculations yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recall memory' })).toBeDisabled();
  await expect(input).toHaveValue('');
});

test('regional decimal input, RTL and language/theme preferences work across reload', async ({ page }) => {
  await ready(page);
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('pt-BR');
  await expect(page.getByRole('heading', { name: 'Padrão', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Aparência', exact: true }).selectOption('oled');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled');
  await page.getByText('Configurações', { exact: true }).click();
  await calculate(page, '0,1+0,2', 'Expressão');
  await expect(page.getByTestId('result')).toHaveText('0,3');
  await calculate(page, 'root(0,125;3)', 'Expressão');
  await expect(page.getByTestId('result')).toHaveText('0,5');
  await page.getByText('Configurações', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('textbox', { name: 'التعبير' })).toHaveValue('root(0٫125,3)');
  await page.getByText('الإعدادات', { exact: true }).click();
  await calculate(page, '١٫٢٥+٢٫٧٥', 'التعبير');
  await expect(page.getByTestId('result')).toHaveText('٤');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled');
});

test('production calculator confines assets to its own origin', async ({ page, baseURL }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(baseURL ?? 'missing')) outside.push(request.resourceType());
  });
  await ready(page);
  await calculate(page, '3/7');
  await expect(page.getByTestId('result')).toHaveText('0.428571428571428571428571');
  expect(outside).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the default is dark on a ${colorScheme} system and an explicit theme survives reload`, async ({ browser, page, baseURL }) => {
    const firstPaint = await browser.newPage({ baseURL, colorScheme, javaScriptEnabled: false });
    try {
      await firstPaint.goto('/');
      await expect(firstPaint.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(firstPaint.locator('body')).toHaveCSS('background-color', 'rgb(10, 20, 39)');
    } finally {
      await firstPaint.close();
    }

    await page.emulateMedia({ colorScheme });
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 20, 39)');
    await page.getByText('Settings', { exact: true }).click();
    const theme = colorScheme === 'light' ? 'system' : 'light';
    await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption(theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(239, 244, 251)');
  });

  test(`the ${colorScheme} layout is responsive and satisfies automated axe checks`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await ready(page);
    if (colorScheme === 'light') {
      await page.getByText('Settings', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('light');
      await page.getByText('Settings', { exact: true }).click();
    }
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  });
}
