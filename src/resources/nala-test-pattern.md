# Nala Test Pattern

> Published as `milo://conventions/nala-test-pattern`

## File structure

```
nala/{block-name}/
  {block-name}.test.js   ← Playwright test runner
  {block-name}.spec.js   ← test feature definitions
```

## {block-name}.spec.js

```javascript
export const features = [
  {
    tcid: '0',
    name: '{Block Name} - default',
    path: '/test/{block-name}/default',
    title: 'Default variant',
    tag: 'regression',
  },
  {
    tcid: '1',
    name: '{Block Name} - dark variant',
    path: '/test/{block-name}/dark',
    title: 'Dark variant',
    tag: 'regression',
  },
];
```

## {block-name}.test.js

```javascript
import { expect, test } from '@playwright/test';
import { features } from './{block-name}.spec.js';
const { describe } = test;

describe('{Block Name} block', () => {
  features.forEach((props) => {
    describe(props.title, () => {
      test(`@${props.tag} ${props.title}`, async ({ page, baseURL }) => {
        await page.goto(`${baseURL}${props.path}`);
        await expect(page.locator('.{block-name}')).toBeVisible();
      });
    });
  });
});
```

## Running tests

```bash
# Run all tests for a block
npx playwright test nala/{block-name}/

# Run with a specific base URL
BASE_URL=https://main--milo--adobecom.aem.page npx playwright test nala/{block-name}/
```
