# Tailwind CSS v4 Migration Plan

## Context

Upgrading Tailwind CSS from v3.4.19 to v4.x in the Quick Budget Next.js application. This is a **major version upgrade** with architectural changes:

- **Why**: Tailwind v4 offers 5x faster builds, CSS-first configuration, and modern browser features
- **Breaking Changes**: Moves from JavaScript config (`tailwind.config.ts`) to CSS-based configuration using `@theme` directive
- **Impact**: Requires changes to CSS files, PostCSS config, animation plugin, and shadcn/ui theme variables

**Current State:**
- Tailwind CSS v3.4.19 with TypeScript config
- Uses `tailwindcss-animate` plugin (not v4 compatible)
- shadcn/ui components with CSS variables in `@layer base`
- Standard `@tailwind base/components/utilities` directives

**Target State:**
- Tailwind CSS v4 with CSS-first configuration
- `tw-animate-css` plugin (v4 compatible replacement)
- shadcn/ui variables refactored for v4 compatibility
- Single `@import "tailwindcss"` directive with `@theme` block

## Implementation Plan

### Phase 1: Preparation

1. **Create jujutsu change for migration**
   ```bash
   jj new -m "chore: prepare Tailwind v4 migration"
   ```

2. **Verify Node.js version**
   ```bash
   node --version  # Must be v20+
   ```

3. **Capture baseline for comparison**
   ```bash
   npm run build > /tmp/build-before-v4.log 2>&1
   ```

### Phase 2: Automated Migration

1. **Run official upgrade tool**
   ```bash
   npx @tailwindcss/upgrade@next
   ```

   This tool will:
   - Convert `@tailwind` directives to `@import "tailwindcss"`
   - Migrate `tailwind.config.ts` to CSS `@theme` directive
   - Update class names if needed
   - Install `tailwindcss@next` and `@tailwindcss/postcss@next`
   - Update `postcss.config.cjs`

2. **Review changes**
   ```bash
   jj diff
   ```

3. **Commit automated changes**
   ```bash
   jj commit -m "chore: run @tailwindcss/upgrade tool for Tailwind v4"
   jj new
   ```

### Phase 3: Manual Adjustments for shadcn/ui

**Critical File: `/Users/max/github/tucared/quick-budget/src/app/globals.css`**

1. **Refactor CSS variables for shadcn/ui v4 compatibility**

   Changes needed:
   - Move CSS variables OUT of `@layer base` block
   - Wrap all color values with `hsl()` function
   - Add `@theme inline` directive to reference CSS variables
   - Ensure both `:root` and `.dark` selectors have wrapped values

   Example transformation:
   ```css
   /* BEFORE */
   @tailwind base;
   @tailwind components;
   @tailwind utilities;

   @layer base {
     :root {
       --background: 0 0% 100%;
       --foreground: 222.2 84% 4.9%;
     }
   }

   /* AFTER */
   @import "tailwindcss";

   :root {
     --background: hsl(0 0% 100%);
     --foreground: hsl(222.2 84% 4.9%);
     --card: hsl(0 0% 100%);
     --card-foreground: hsl(222.2 84% 4.9%);
     /* ... all other variables ... */
     --radius: 0.5rem;
   }

   .dark {
     --background: hsl(222.2 84% 4.9%);
     --foreground: hsl(210 40% 98%);
     /* ... all other dark mode variables ... */
   }

   @theme inline {
     --color-background: var(--background);
     --color-foreground: var(--foreground);
     --color-card: var(--card);
     --color-card-foreground: var(--card-foreground);
     /* ... map all color variables ... */

     --radius-lg: var(--radius);
     --radius-md: calc(var(--radius) - 2px);
     --radius-sm: calc(var(--radius) - 4px);
   }

   @layer base {
     * {
       @apply border-border;
     }
     body {
       @apply bg-background text-foreground;
     }
   }
   ```

2. **Replace animation plugin**
   ```bash
   npm uninstall tailwindcss-animate
   npm install --save-dev tw-animate-css
   ```

   Add import to `globals.css`:
   ```css
   @import "tailwindcss";
   @import "tw-animate-css";
   ```

3. **Verify PostCSS config**

   **File: `/Users/max/github/tucared/quick-budget/postcss.config.cjs`**

   Should look like:
   ```javascript
   module.exports = {
     plugins: {
       '@tailwindcss/postcss': {},
       autoprefixer: {},
     },
   }
   ```

4. **Remove old Tailwind config**
   ```bash
   rm tailwind.config.ts  # If not already removed by upgrade tool
   ```

5. **Commit manual adjustments**
   ```bash
   jj commit -m "chore: update shadcn/ui CSS variables and animation plugin for Tailwind v4"
   jj new
   ```

### Phase 4: Update Chart Component

**File: `/Users/max/github/tucared/quick-budget/src/components/budget-burndown-chart-client.tsx`**

Replace hardcoded color values with CSS variables:

```typescript
// Lines to update: 263, 298, 306, 312, 329, 338

// BEFORE:
const actualLineColor = isOverBudget ? "#ef4444" : "#22c55e"
fill="#f3f4f6"
axisLine={{ stroke: "#e5e7eb" }}
stroke="#9ca3af"

// AFTER:
const actualLineColor = isOverBudget
  ? "hsl(var(--destructive))"
  : "hsl(142.1 76.2% 36.3%)"  // green-600

fill="hsl(var(--muted))"
axisLine={{ stroke: "hsl(var(--border))" }}
stroke="hsl(var(--muted-foreground))"
```

Commit:
```bash
jj commit -m "refactor: migrate chart colors to CSS variables for Tailwind v4"
jj new
```

### Phase 5: Testing & Verification

1. **Clean install**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Build test**
   ```bash
   npm run build
   ```
   Compare with baseline from Phase 1. Build should succeed with similar or better performance.

3. **Lint check**
   ```bash
   npm run lint
   ```

4. **Manual testing checklist**
   ```bash
   npm run dev
   ```

   Test at http://localhost:3000:
   - [ ] Budget page renders correctly
   - [ ] Expense form displays properly
   - [ ] Category cards show correct colors and spacing
   - [ ] Budget burndown chart renders without errors
   - [ ] Dark mode works (if implemented)
   - [ ] Button hover states work
   - [ ] Dialogs and popovers display correctly
   - [ ] Responsive design works (resize browser)
   - [ ] Form inputs styled correctly
   - [ ] Calendar picker looks right
   - [ ] Animations work (dialog open/close, etc.)

5. **Browser console check**
   - No errors or warnings
   - No missing utility class warnings

### Phase 6: Finalization

1. **Update README.md**

   Update stack section:
   ```markdown
   ## Stack

   - **Frontend**: Next.js 16 + TypeScript + Tailwind CSS v4
   - **UI**: shadcn/ui (Radix UI + Tailwind v4)

   ## Tailwind CSS v4 Configuration

   This project uses Tailwind CSS v4 with CSS-first configuration:
   - Configuration is in `src/app/globals.css` via `@theme` directive
   - No JavaScript config file needed
   - Uses `tw-animate-css` for animations
   ```

2. **Final commit**
   ```bash
   jj commit -m "chore: upgrade Tailwind CSS from v3.4.19 to v4

- Migrate configuration to CSS-first approach using @theme directive
- Replace tailwindcss-animate with tw-animate-css
- Update shadcn/ui theme variables for v4 compatibility
- Migrate chart colors to CSS variables
- Update PostCSS configuration for @tailwindcss/postcss

BREAKING CHANGE: Requires Node.js 20+, Safari 16.4+, Chrome 111+, Firefox 128+
"
   ```

## Rollback Strategy

If critical issues arise:

```bash
# Undo the migration
jj undo

# Or abandon the change and return to main
jj abandon
jj edit main
```

## Critical Files

1. **`/Users/max/github/tucared/quick-budget/src/app/globals.css`** - Core config changes, CSS variable refactoring, `@theme` directive
2. **`/Users/max/github/tucared/quick-budget/package.json`** - Dependency updates
3. **`/Users/max/github/tucared/quick-budget/postcss.config.cjs`** - PostCSS plugin change
4. **`/Users/max/github/tucared/quick-budget/src/components/budget-burndown-chart-client.tsx`** - Hardcoded color migration
5. **`/Users/max/github/tucared/quick-budget/tailwind.config.ts`** - Will be removed (config moves to CSS)

## Potential Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| CSS variables not working | Colors show incorrectly | Verify `hsl()` wrapping and `@theme inline` mapping |
| Animations broken | No transitions/animations | Ensure `tw-animate-css` imported in globals.css |
| Build errors | Missing utilities | Check upgrade tool completed successfully |
| Dark mode issues | Dark mode doesn't apply | Verify `.dark` CSS variables are defined |

## Success Criteria

- ✅ Build completes without errors
- ✅ All pages render identically to pre-migration
- ✅ No console errors or warnings
- ✅ Animations work correctly
- ✅ Build time similar or faster
- ✅ All manual tests pass

## Estimated Time

**2-3 hours** (including testing buffer)
