import expectPuppeteer from 'expect-puppeteer';
import { CLIENT_URL, registerNewUser, registerDandiset, login, uniqueId } from '../util';


beforeAll(async () => {
  // Set the default action timeout to something greater than 500ms
  expectPuppeteer.setDefaultOptions({ timeout: 10000 });
  await page.goto(CLIENT_URL);
});

describe('stats', () => {
  var username;
  var password;

  it('user', async () => {
    // wait for stats to load
    await page.waitFor(1000);
    const initialUserCount = await page.$eval('[data-id="stat"][data-name="users"] [data-id="value"]', element => Number(element.innerText));

    // register a new user to increment the user count
    ({ username, password } = await registerNewUser());

    // refresh the page to get the new stats
    await page.goto(CLIENT_URL);

    // wait for stats to load
    await page.waitFor(1000);
    const finalUserCount = await page.$eval('[data-id="stat"][data-name="users"] [data-id="value"]', element => Number(element.innerText));

    expect(finalUserCount).toEqual(initialUserCount + 1);
  });

  it('dandiset', async () => {
    const dandisetName = `dandiset${uniqueId()}`;
    const dandisetDescription = `Description! ${uniqueId()}`;

    // wait for stats to load
    await page.waitFor(1000);
    const initialDandisetCount = await page.$eval('[data-id="stat"][data-name="dandisets"] [data-id="value"]', element => Number(element.innerText));

    // register a new dandiset to increment the user count
    await login(username, password);
    await registerDandiset(dandisetName, dandisetDescription);

    // refresh the page to get the new stats
    await page.goto(CLIENT_URL);

    // wait for stats to load
    await page.waitFor(1000);
    const finalDandisetCount = await page.$eval('[data-id="stat"][data-name="dandisets"] [data-id="value"]', element => Number(element.innerText));

    expect(finalDandisetCount).toEqual(initialDandisetCount + 1);
  });
});
