import expectPuppeteer from 'expect-puppeteer';
import { CLIENT_URL, uniqueId, registerNewUser } from '../util';
import { vBtn, vTextField, vTextarea, vCard, vChip } from '../vuetify-xpaths';


beforeAll(async () => {
  // Set the default action timeout to something greater than 500ms
  expectPuppeteer.setDefaultOptions({ timeout: 10000 });
  await page.goto(CLIENT_URL);
});

it('register', async () => {
  const id = uniqueId();
  const name = `name ${id}`;
  const description = `description ${id}`;

  await registerNewUser();

  await (await page.waitForXPath(vBtn('New Dandiset'))).click();

  await (await page.waitForXPath(vTextField('Name*'))).type(name);
  await (await page.waitForXPath(vTextarea('Description*'))).type(description);

  await (await page.waitForXPath(vBtn('Register dataset'))).click();

  await page.waitForXPath(vCard({ title: [name, vChip('This dataset has not been published!')] }));
});
