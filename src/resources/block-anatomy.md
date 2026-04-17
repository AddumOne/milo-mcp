# Milo Block Anatomy

> Published as `milo://conventions/block-anatomy`

## Directory structure

```
libs/blocks/{block-name}/     ← Milo core
blocks/{block-name}/          ← child project (da-bacom, bacom, cc, etc.)
  {block-name}.js             ← required
  {block-name}.css            ← required (may be empty)
```

## JavaScript template

```javascript
/**
 * {Block Name} block
 * @description {One sentence — this text is indexed by the RAG block index}
 * @author {GitHub handle}
 * @param {Element} block - The block element passed by EDS decoration
 */
export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  rows.forEach((row) => {
    const [label, content] = row.children;
    // transform DOM in-place
  });
}
```

## Self-RAG checklist — all 5 must pass before PR is opened

1. Single `export default function decorate(block)` — no other named exports as entry point
2. No external dependencies — vanilla JS only
3. DOM manipulation in-place — do not `replaceWith` or reparent the block element
4. `window.lana.log(message, { tags: 'error,{block-name}' })` not `console`
5. Lazy-load heavy resources (images, iframes)

## CSS template

```css
.{block-name} { /* container */ }
.{block-name} > div { /* row styles */ }
.{block-name}.dark { /* variant: authored as "{Block Name} (dark)" in DA */ }
```

## Nala test template

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

## Mock document

```markdown
# {Block Name}

| {Block Name}    |
|-----------------|
| Row 1 content   |
| Row 2 content   |
```
