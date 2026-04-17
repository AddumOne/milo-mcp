# DA Block Table Syntax

> Published as `milo://conventions/da-table-syntax`

## Basic block table

The first cell of the first row is the block name. EDS converts it to a CSS class.

```markdown
| My Block        |               |
|-----------------|---------------|
| Row 1 col 1     | Row 1 col 2   |
| Row 2 col 1     | Row 2 col 2   |
```

Renders as: `<div class="my-block">...</div>`

## Variant (modifier class)

Variant in parentheses becomes an additional CSS class:

```markdown
| My Block (dark) |
|-----------------|
| Row 1 content   |
```

Renders as: `<div class="my-block dark">...</div>`

## Multiple variants

```markdown
| My Block (dark, centered) |
|---------------------------|
| Row 1 content             |
```

Renders as: `<div class="my-block dark centered">...</div>`

## Full page example

```markdown
---
title: My Page
description: A test page
---

| Marquee (dark)  |                               |
|-----------------|-------------------------------|
| # Hello World   | ![hero image](./hero.jpg)     |
| CTA text        | [Get Started](#)              |

| Cards           |
|-----------------|
| Card 1 content  |
| Card 2 content  |
```

## Rules

- First cell = block name (case-insensitive, spaces → hyphens)
- Parenthetical = space-separated CSS modifier classes
- Each row after the header = a `<div>` row inside the block
- Columns within a row = `<div>` children of that row
- Inline HTML/Markdown renders inside cells
