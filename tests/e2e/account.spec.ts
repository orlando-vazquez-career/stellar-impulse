import { TEST_SERVER_URL } from './server-url';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const SERVER = TEST_SERVER_URL;
const welcome = (alias: string) => ({ name: `Comandante ${alias}, el sector espera.` });

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: /Iniciar sesión/ }).click();
}

test('creates an account in the game and gets its alias back after signing out and on another device', async ({ page, browser, request }) => {
  const email = `cuenta-${randomUUID()}@example.com`;
  const password = `Pilot-${randomUUID().slice(0, 8)}`;
  await page.goto('/');
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByLabel('Alias de comandante').fill('Ñandú 07');
  await page.getByRole('button', { name: /Crear cuenta/ }).click();
  await expect(page.getByRole('heading', welcome('Ñandú 07'))).toBeVisible();
  await expect(page.locator('.vi-screen__footer')).toContainText(email);
  const token = await page.evaluate(() => sessionStorage.getItem('impulso.auth-token'));
  const me = await request.get(`${SERVER}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect(await me.json()).toMatchObject({ user: { email, displayName: 'Ñandú 07' } });

  // Back on the access screen with an empty alias field: the account brings its own.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: /Iniciar sesión/ })).toBeEnabled();
  await page.getByLabel('Identificador de comandante').fill('');
  await signIn(page, email, password);
  await expect(page.getByRole('heading', welcome('Ñandú 07'))).toBeVisible();

  // Another device remembers nothing, and the account's alias wins over a local one on reload.
  const deviceContext = await browser.newContext();
  try {
    const device = await deviceContext.newPage();
    await device.goto('/');
    await expect(device.getByLabel('Identificador de comandante')).toHaveValue('');
    await signIn(device, email, password);
    await expect(device.getByRole('heading', welcome('Ñandú 07'))).toBeVisible();
    await device.evaluate(() => localStorage.setItem('impulso-stellar:alias', 'Otro'));
    await device.reload();
    await expect(device.getByRole('heading', welcome('Ñandú 07'))).toBeVisible();
  } finally {
    await deviceContext.close();
  }
});

test('explains an invalid alias and a taken email, then signs in to that account', async ({ page, request }) => {
  const email = `cuenta-${randomUUID()}@example.com`;
  const password = `Pilot-${randomUUID().slice(0, 8)}`;
  const created = await request.post(`${SERVER}/auth/register`, { data: { email, password, displayName: 'Vega' } });
  expect(created.status()).toBe(201);
  const { token } = await created.json() as { token: string };
  await request.post(`${SERVER}/auth/logout`, { headers: { Authorization: `Bearer ${token}` } });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Correo electrónico').fill(email);

  // A password without an uppercase letter is explained, kept in the field and marked on the list.
  await page.getByLabel('Contraseña').fill('piloto-sin-mayus');
  await page.getByLabel('Alias de comandante').fill('Nova');
  await page.getByRole('button', { name: /Crear cuenta/ }).click();
  await expect(page.getByRole('status')).toContainText('La contraseña necesita');
  await expect(page.getByLabel('Contraseña')).toHaveValue('piloto-sin-mayus');
  const rules = page.locator('#account-password-rules li');
  await expect(rules).toHaveCount(4);
  await expect(rules.filter({ hasText: 'Una mayúscula' })).toHaveAttribute('data-met', 'false');
  await expect(rules.filter({ hasText: 'Una minúscula' })).toHaveAttribute('data-met', 'true');

  await page.getByLabel('Contraseña').fill(password);
  await page.getByLabel('Alias de comandante').fill('<Nova>');
  await page.getByRole('button', { name: /Crear cuenta/ }).click();
  await expect(page.getByRole('status')).toContainText('El alias admite de 1 a 24 letras');

  await page.getByLabel('Contraseña').fill(password);
  await page.getByLabel('Alias de comandante').fill('Nova');
  await page.getByRole('button', { name: /Crear cuenta/ }).click();
  await expect(page.getByRole('status')).toContainText('Ese correo ya tiene una cuenta.');

  // The account keeps the alias it already had.
  await page.getByRole('tab', { name: 'Iniciar sesión' }).click();
  await signIn(page, email, password);
  await expect(page.getByRole('heading', welcome('Vega'))).toBeVisible();
});
