import { TEST_SERVER_URL } from './server-url';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('signs in, restores the account, trains and revokes the session', async ({ page, request }) => {
  const email = `browser-${randomUUID()}@example.com`;
  const password = `Pilot-${randomUUID().slice(0, 8)}`;
  const registered = await request.post(`${TEST_SERVER_URL}/auth/register`, { data: { email, password } });
  expect(registered.status()).toBe(201);
  const initial = await registered.json() as { token: string };
  await request.post(`${TEST_SERVER_URL}/auth/logout`, { headers: { Authorization: `Bearer ${initial.token}` } });

  await page.goto('/');
  await page.getByLabel('Identificador de comandante').fill('Pilot');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill('wrong-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: false }).click();
  await expect(page.getByRole('status')).toContainText('Correo o contraseña incorrectos.');
  await expect(page.getByLabel('Contraseña')).toHaveValue('');

  await page.getByLabel('Contraseña').fill(password);
  await page.getByLabel('Contraseña').press('Enter');
  await expect(page.getByRole('heading', { name: 'Comandante Pilot, el sector espera.' })).toBeVisible();
  await expect(page.locator('.vi-screen__footer')).toContainText(email);
  const token = await page.evaluate(() => sessionStorage.getItem('impulso.auth-token'));
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain(password);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Comandante Pilot, el sector espera.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await expect(page.locator('.vi-resources')).toContainText('2/12', { timeout: 10000 });

  // A reload also leaves the training room and restores the account's command menu.
  await page.reload();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: /Iniciar sesión/ })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('impulso.auth-token'))).toBeNull();
  const revoked = await request.get(`${TEST_SERVER_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect(revoked.status()).toBe(401);
  await page.reload();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
});

test('discards an expired session and keeps guest access available', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('impulso.auth-token', 'x'.repeat(43)));
  await page.reload();
  await expect(page.getByRole('button', { name: /Iniciar sesión/ })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('impulso.auth-token'))).toBeNull();
  await page.getByLabel('Identificador de comandante').fill('Guest');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await expect(page.getByRole('heading', { name: 'Comandante Guest, el sector espera.' })).toBeVisible();
});
