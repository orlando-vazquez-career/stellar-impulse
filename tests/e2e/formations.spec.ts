import { expect, test } from '@playwright/test';
import { canvasPointFromMinimap, chooseOpening, openApp } from './helpers';

test('a selected group picks a formation and marches as one order', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1366, height: 768 });
  // Command frames are msgpack, so the command type travels as plain text inside them.
  const sent: string[] = [];
  page.on('websocket', (socket) => socket.on('framesent', (frame) => {
    const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('latin1');
    if (text.includes('stop')) sent.push('stop');
    else if (text.includes('move_formation')) sent.push('move_formation');
    else if (/move/.test(text)) sent.push('move');
  }));
  await openApp(page);
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByRole('button', { name: /Fácil/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await chooseOpening(page);
  await page.locator('.vi-production').getByRole('button', { name: /Explorador/ }).click();
  await expect(page.locator('.vi-resources')).toContainText('3/12', { timeout: 15000 });

  // Box-select the whole fleet around the hangar.
  const allies = page.locator('.map-ally');
  const points = [];
  for (const marker of await allies.all()) {
    points.push(await canvasPointFromMinimap(page, Number(await marker.getAttribute('cx')), Number(await marker.getAttribute('cy'))));
  }
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  await page.mouse.move(Math.min(...xs) - 50, Math.min(...ys) - 50);
  await page.mouse.down();
  await page.mouse.move(Math.max(...xs) + 50, Math.max(...ys) + 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('3 unidades seleccionadas')).toBeVisible();

  const picker = page.getByRole('radiogroup', { name: 'Formación' });
  await expect(picker.getByRole('radio')).toHaveCount(6);
  await picker.getByRole('radio', { name: 'Cuña' }).click();
  await expect(picker.getByRole('radio', { name: 'Cuña' })).toHaveAttribute('aria-checked', 'true');
  // F cycles to the next shape.
  await page.keyboard.press('f');
  await expect(picker.getByRole('radio', { name: 'Cuadro' })).toHaveAttribute('aria-checked', 'true');

  // The smallest supported viewport must leave the hangar and minimap usable.
  await page.setViewportSize({ width: 1024, height: 768 });
  const selection = await page.locator('.vi-squad').boundingBox();
  const hangar = await page.locator('.vi-production').boundingBox();
  const minimap = await page.locator('.vi-minimap').boundingBox();
  expect(selection!.x + selection!.width).toBeLessThanOrEqual(hangar!.x);
  expect(selection!.x).toBeGreaterThanOrEqual(minimap!.x + minimap!.width);
  await page.screenshot({ path: 'test-results/formation-layout-1024.png' });
  await page.setViewportSize({ width: 1366, height: 768 });
  // One click sends one group order and every ship sets off.
  const starts = await allies.evaluateAll((markers) => markers.map((marker) => `${marker.getAttribute('cx')},${marker.getAttribute('cy')}`));
  const centre = { x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length };
  for (const [dx, dy] of [[160, 90], [-160, 90], [160, -60], [-160, -60], [0, 140]] as const) {
    await page.mouse.click(centre.x + dx, centre.y + dy, { button: 'right' });
    // A click on rock is refused before it is sent; try the next spot.
    if (await expect.poll(() => sent.length, { timeout: 3000 }).toBeGreaterThan(0).then(() => true, () => false)) break;
  }
  expect(sent).toEqual(['move_formation']);
  await expect.poll(async () => {
    const now = await allies.evaluateAll((markers) => markers.map((marker) => `${marker.getAttribute('cx')},${marker.getAttribute('cy')}`));
    return now.filter((position, index) => position !== starts[index]).length;
  }, { timeout: 20000 }).toBe(3);

  // Ctrl+1 saves the three ships as squad 1.
  await page.keyboard.press('Control+1');
  await expect(page.locator('.vi-groups').getByRole('button', { name: 'Escuadra 1, 3 naves' })).toBeVisible();
  // Esc cancels the march: one stop per ship, and the fleet stays put.
  await page.keyboard.press('Escape');
  await expect.poll(() => sent.filter((command) => command === 'stop').length, { timeout: 5000 }).toBe(3);
  const positions = () => allies.evaluateAll((markers) => markers.map((marker) => `${marker.getAttribute('cx')},${marker.getAttribute('cy')}`));
  // Each ship finishes the cell step it is on, then holds there instead of reaching its seat.
  let halted = await positions();
  await expect.poll(async () => {
    const now = await positions();
    const still = now.every((position, index) => position === halted[index]);
    halted = now;
    return still;
  }, { intervals: [700], timeout: 6000 }).toBe(true);
  await page.waitForTimeout(1500);
  expect(await positions()).toEqual(halted);
  // A click on empty space drops the selection; 1 brings the whole squad back.
  await page.mouse.click(10, 400);
  await expect(page.getByText('3 unidades seleccionadas')).toHaveCount(0);
  await page.keyboard.press('1');
  await expect(page.getByText('3 unidades seleccionadas')).toBeVisible();
});


test('a rebound shortcut and live audio settings work during a match', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('impulso.visual-preferences', JSON.stringify({ keybindings: { 'select-all': 'KeyG' } })));
  await openApp(page);
  await page.getByLabel('Identificador de comandante').fill('Audio');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByRole('button', { name: /Fácil/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await chooseOpening(page);
  await page.keyboard.press('g');
  await expect(page.getByText(/^[2-9] unidades seleccionadas$/)).toBeVisible();
  await page.getByRole('button', { name: 'Sonido', exact: true }).click();
  await page.locator('#audio-effects-range').fill('17');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences')!).audio.effects)).toBe(17);
  await page.locator('.vi-sound-panel input[type=checkbox]').check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences')!).audio.muted)).toBe(true);
});
