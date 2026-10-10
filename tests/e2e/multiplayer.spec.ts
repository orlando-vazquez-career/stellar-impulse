import { TEST_SERVER_URL } from './server-url';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { chooseOpening } from './helpers';

async function signIn(page: Page, request: APIRequestContext, name: string) {
  const email = `multiplayer-${randomUUID()}@example.com`;
  const password = `Pilot-${randomUUID()}`;
  const response = await request.post(`${TEST_SERVER_URL}/auth/register`, { data: { email, password } });
  expect(response.status()).toBe(201);
  const { token } = await response.json() as { token: string };
  await request.post(`${TEST_SERVER_URL}/auth/logout`, { headers: { Authorization: `Bearer ${token}` } });
  await page.goto('/');
  await page.getByLabel('Identificador de comandante').fill(name);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: false }).click();
  await expect(page.getByRole('heading', { name: `Comandante ${name}, el sector espera.` })).toBeVisible({ timeout: 20000 });
}


/** A real server order on the new engine: the base builds an Explorador and the fleet grows. */
async function produceExplorer(page: Page, fleet: string) {
  await page.locator('.vi-production').getByRole('button', { name: /Explorador/ }).click();
  // Two software-rendered pages share the CI runner: the ack can take several seconds to paint.
  await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-sequence', '1', { timeout: 20000 });
  await expect(page.locator('.vi-resources')).toContainText(fleet, { timeout: 20000 });
}

test('two accounts play the campaign on Espiral and recover the same match after reload', async ({ browser, request }) => {
  test.setTimeout(240_000);
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await signIn(host, request, 'Vega');
    await signIn(guest, request, 'Nova');
    await host.getByRole('button', { name: /Crear sala multijugador/ }).click();
    await expect(host.getByRole('button', { name: /Espiral Estelar.*96×96/ })).toBeVisible();
    await expect(host.locator('.vi-briefing')).not.toContainText('Sector 01');
    await expect(host.locator('.vi-briefing').getByRole('img', { name: /Vista previa/ })).toHaveAttribute('data-map-id', 'espiral');
    await host.getByRole('button', { name: 'Crear sala', exact: true }).click();
    const code = host.getByTestId('multiplayer-room-code');
    await expect(code).toHaveText(/^[A-F0-9]{12}$/);
    const roomId = (await code.innerText()).trim();
    await host.getByRole('button', { name: 'Estoy listo', exact: true }).click();
    await expect(host.getByText(/Esperando.*(jugador|rival)/).first()).toBeVisible();
    await expect(host.locator('.vi-gameplay')).toHaveCount(0);

    await guest.getByRole('button', { name: /Unirse a sala/ }).click();
    await guest.getByLabel('Código de sala').fill(roomId.toLowerCase());
    await guest.getByRole('button', { name: 'Unirse a sala', exact: true }).click();
    await expect(guest.getByTestId('multiplayer-room-code')).toHaveText(roomId);
    await expect(guest.locator('.vi-briefing')).toContainText('Espiral Estelar');
    await expect(guest.locator('.vi-briefing')).not.toContainText('Sector 01');
    await expect(guest.locator('.vi-briefing').getByRole('img', { name: /Vista previa/ })).toHaveAttribute('data-map-id', 'espiral');
    // Each commander sees their own base blue in the preview, as in the match: the guest sits in p2.
    await expect(host.locator('.vi-briefing').getByRole('img', { name: /Vista previa/ })).toHaveAttribute('data-self', 'p1');
    await expect(guest.locator('.vi-briefing').getByRole('img', { name: /Vista previa/ })).toHaveAttribute('data-self', 'p2');
    await expect(host.locator('.vi-commanders')).toContainText('Nova');
    await expect(guest.locator('.vi-commanders')).toContainText('Vega');
    await expect(guest.locator('.vi-gameplay')).toHaveCount(0);
    await host.screenshot({ path: 'test-results/multiplayer-lobby.png' });
    await guest.getByRole('button', { name: 'Estoy listo', exact: true }).click();

    for (const page of [host, guest]) {
      await expect(page.getByLabel('Campo táctico Phaser')).toBeVisible({ timeout: 20000 });
      await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-room-id', roomId);
      await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-connection', 'online');
    }
    await expect(host.locator('.vi-gameplay')).toHaveAttribute('data-player-id', 'p1');
    await expect(guest.locator('.vi-gameplay')).toHaveAttribute('data-player-id', 'p2');
    // The battlefield art loads before the map is announced; two clients share one CI runner.
    for (const page of [host, guest]) await expect(page.locator('.vi-phaser')).toHaveAttribute('data-map-source', 'espiral-estelar.json', { timeout: 20000 });
    // Sector 1 opens with a private augment offer; the clock starts when both have chosen.
    await Promise.all([chooseOpening(host), chooseOpening(guest)]);
    for (const page of [host, guest]) await expect(page.locator('.vi-resources')).toContainText('2/12');
    await produceExplorer(host, '3/12');
    await produceExplorer(guest, '3/12');
    await host.screenshot({ path: 'test-results/multiplayer-match.png' });

    await guest.reload();
    await expect(guest.locator('.vi-gameplay')).toHaveAttribute('data-room-id', roomId, { timeout: 20000 });
    await expect(guest.locator('.vi-gameplay')).toHaveAttribute('data-player-id', 'p2');
    await expect(guest.locator('.vi-gameplay')).toHaveAttribute('data-connection', 'online');
    await expect(guest.locator('.vi-resources')).toContainText('3/12', { timeout: 20000 });
    await expect(guest.locator('.vi-phaser')).toHaveAttribute('data-map-source', 'espiral-estelar.json', { timeout: 20000 });
    await expect(guest.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
    await expect(guest.locator('.vi-gameplay')).toHaveAttribute('data-sequence', '1', { timeout: 20000 });
    await expect(host.locator('.vi-gameplay')).toHaveAttribute('data-room-id', roomId);
    await host.getByRole('button', { name: 'Salir de partida', exact: true }).click();
    await expect(guest.getByRole('dialog', { name: 'Victoria', exact: true })).toBeVisible({ timeout: 15000 });
    await guest.reload();
    await expect(guest.getByRole('dialog', { name: 'Victoria', exact: true })).toBeVisible({ timeout: 20000 });
    await guest.getByRole('button', { name: 'Volver al mando', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Comandante Nova, el sector espera.' })).toBeVisible();
    expect(await guest.evaluate(() => sessionStorage.getItem('impulso.multiplayer-room'))).toBeNull();
  } finally {
    await Promise.allSettled([hostContext.close(), guestContext.close()]);
  }
});

test('lets a commander correct an invalid room name before creating a room', async ({ page, request }) => {
  await signIn(page, request, 'Vega🚀');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: /Crear sala multijugador/ }).click();
  const name = page.getByLabel('Nombre en la sala');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Crear sala', exact: true })).toBeDisabled();
  await name.fill('Vega');
  await expect(page.getByRole('button', { name: /Espiral Estelar.*96×96/ })).toBeVisible();
  const outsideBeforeCreation = await page.locator('.vi-lobby-card').evaluateAll((cards) => cards.some((card) => {
    const box = card.getBoundingClientRect();
    return box.x < 0 || box.y < 0 || box.right > innerWidth || box.bottom > innerHeight;
  }));
  expect(outsideBeforeCreation).toBe(false);
  await page.screenshot({ path: 'test-results/multiplayer-map-selection.png' });
  await page.getByRole('button', { name: 'Crear sala', exact: true }).click();
  await expect(page.getByTestId('multiplayer-room-code')).toHaveText(/^[A-F0-9]{12}$/);
  await expect(page.locator('.vi-commanders')).toContainText('Vega');
  await page.screenshot({ path: 'test-results/multiplayer-lobby-desktop.png' });
  const outside = await page.locator('.vi-lobby-card').evaluateAll((cards) => cards.some((card) => {
    const box = card.getBoundingClientRect();
    return box.x < 0 || box.y < 0 || box.right > innerWidth || box.bottom > innerHeight;
  }));
  expect(outside).toBe(false);
  await page.getByRole('button', { name: /Volver al mando/ }).click();
});

test('shows an invalid code error and allows leaving a room before the match', async ({ page, request }) => {
  await signIn(page, request, 'Solo');
  await page.getByRole('button', { name: /Unirse a sala/ }).click();
  await page.getByLabel('Código de sala').fill('000000000000');
  await page.getByRole('button', { name: 'Unirse a sala', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: /Volver al mando/ }).click();
  await expect(page.getByRole('heading', { name: 'Comandante Solo, el sector espera.' })).toBeVisible();
  await page.getByRole('button', { name: /Crear sala multijugador/ }).click();
  await page.getByRole('button', { name: 'Crear sala', exact: true }).click();
  await expect(page.getByTestId('multiplayer-room-code')).toHaveText(/^[A-F0-9]{12}$/);
  await page.getByRole('button', { name: /Volver al mando/ }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('impulso.multiplayer-room'))).toBeNull();
  await expect(page.getByRole('heading', { name: 'Comandante Solo, el sector espera.' })).toBeVisible();
});

test('returns to the command center when leaving during a network drop', async ({ page, context, request }) => {
  await signIn(page, request, 'Offline');
  await page.getByRole('button', { name: /Crear sala multijugador/ }).click();
  await page.getByRole('button', { name: 'Crear sala', exact: true }).click();
  await expect(page.getByTestId('multiplayer-room-code')).toHaveText(/^[A-F0-9]{12}$/);
  await context.setOffline(true);
  await expect(page.locator('.vi-multiplayer-connection')).toContainText('Reconectando');
  await page.getByRole('button', { name: /Volver al mando/ }).click();
  await expect(page.getByRole('heading', { name: 'Comandante Offline, el sector espera.' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('impulso.multiplayer-room'))).toBeNull();
  await context.setOffline(false);
  await expect(page.locator('.vi-lobby')).toHaveCount(0);
});
