#!/usr/bin/env node

/**
 * CSV Transformation Pipeline
 * Transforms raw CSV files from external app to database-ready format
 *
 * Usage: node transform-csvs.js
 * Input: raw/*.csv
 * Output: normalized/*.csv
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { validateExpense, validateBudgetAllocation } = require('./validators.cjs');

/**
 * Parses valid category names from 01_seed_categories.sql (single source of truth)
 */
function parseCategoriesFromSeed(seedFilePath) {
  const content = fs.readFileSync(seedFilePath, 'utf-8');
  const validCategories = new Set();
  // Match: (shared_household_id, 'CategoryName', ...)
  const pattern = /\(shared_household_id,\s*'([^']+)'/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    validCategories.add(match[1]);
  }
  return validCategories;
}

// Load config.local.cjs if it exists, otherwise use config.cjs template
const SCRIPT_DIR_FOR_CONFIG = __dirname;
let config;
try {
  config = require('./config.local.cjs');
  console.log('Using config.local.cjs');
} catch (e) {
  config = require('./config.cjs');
  console.log('Using config.cjs template');
}

// Resolve paths relative to script directory
const SCRIPT_DIR = __dirname;
const RAW_DIR = path.join(SCRIPT_DIR, '..', config.paths.raw);
const NORMALIZED_DIR = path.join(SCRIPT_DIR, '..', config.paths.normalized);

/**
 * Reads and parses CSV file
 */
function readCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Remove BOM if present
  const cleanContent = content.replace(/^\uFEFF/, '');
  return parse(cleanContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

/**
 * Escapes string for SQL
 */
function escapeSql(value) {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  // Escape single quotes by doubling them
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Generates SQL INSERT statements for expenses
 */
function generateExpensesSql(data, validCategories) {
  const dropped = {};
  const filteredData = data.filter(row => {
    if (validCategories.has(row.category)) return true;
    dropped[row.category] = (dropped[row.category] || 0) + 1;
    return false;
  });

  const droppedEntries = Object.entries(dropped);
  if (droppedEntries.length > 0) {
    const total = droppedEntries.reduce((sum, [, n]) => sum + n, 0);
    console.log(`\n⚠️  Dropped ${total} expenses with unknown categories:`);
    droppedEntries.forEach(([cat, count]) => console.log(`    • "${cat}": ${count} rows`));
  }

  const lines = [];
  lines.push('-- Expense data from transformed CSV');
  lines.push('INSERT INTO public.expenses (');
  lines.push('  logged_by_user_id, household_id, category_id, is_cash,');
  lines.push('  amount, currency, converted_amount, converted_currency, exchange_rate,');
  lines.push('  expense_date, description');
  lines.push(') VALUES');

  const values = filteredData.map((row, index) => {
    const isLast = index === filteredData.length - 1;
    const isCash = row.account && row.account.toLowerCase() === 'cash' ? 'TRUE' : 'FALSE';
    return `  (
    user1_id, shared_household_id,
    (SELECT id FROM public.categories WHERE name = ${escapeSql(row.category)} AND household_id = shared_household_id),
    ${isCash},
    ${escapeSql(row.amount)}, ${escapeSql(row.currency)},
    ${escapeSql(row.converted_amount)}, ${escapeSql(row.converted_currency)}, ${escapeSql(row.exchange_rate)},
    ${escapeSql(row.expense_date)}, ${escapeSql(row.description)}
  )${isLast ? ';' : ','}`;
  });

  lines.push(...values);
  return lines.join('\n');
}

/**
 * Generates SQL INSERT statements for budget allocations
 */
function generateBudgetSql(data, validCategories) {
  // Filter out allocations for categories not in seed and zero allocations.
  // Negative allocations are kept (e.g. Helper category used as a balancing entry).
  // Savings pot categories (Safety Net, Holidays Pot, Brazil Pot, Home Buy, Retirement)
  // are not in validCategories and will be dropped — intentional, this app tracks spending only.
  const dropped = {};
  const filteredData = data.filter(row => {
    if (parseFloat(row.allocated_amount) === 0) return false;
    if (validCategories.has(row.category)) return true;
    dropped[row.category] = (dropped[row.category] || 0) + 1;
    return false;
  });

  const droppedEntries = Object.entries(dropped);
  if (droppedEntries.length > 0) {
    const total = droppedEntries.reduce((sum, [, n]) => sum + n, 0);
    console.log(`\n⚠️  Dropped ${total} budget allocations with unknown categories:`);
    droppedEntries.forEach(([cat, count]) => console.log(`    • "${cat}": ${count} rows`));
  }

  const lines = [];
  lines.push('-- Budget allocation data from transformed CSV');
  lines.push('INSERT INTO public.budget_allocations (');
  lines.push('  household_id, category_id, budget_month, allocated_amount, currency');
  lines.push(') VALUES');

  const values = filteredData.map((row, index) => {
    const isLast = index === filteredData.length - 1;
    return `  (
    shared_household_id,
    (SELECT id FROM public.categories WHERE name = ${escapeSql(row.category)} AND household_id = shared_household_id),
    ${escapeSql(row.budget_month)}, ${escapeSql(row.allocated_amount)}, ${escapeSql(row.currency)}
  )${isLast ? ';' : ','}`;
  });

  lines.push(...values);
  return lines.join('\n');
}

/**
 * Loads EUR/BRL historical rates from investing.com CSV.
 * Returns a Map of YYYY-MM-DD → EUR/BRL price (e.g. "2026-02-20" → 6.099).
 */
function loadBrlRateMap() {
  const rateFile = path.join(RAW_DIR, 'eur_brl_historical_rates.csv');
  if (!fs.existsSync(rateFile)) {
    console.log('  ℹ️  No eur_brl_historical_rates.csv found — using config fallback for all BRL expenses');
    return new Map();
  }

  const content = fs.readFileSync(rateFile, 'utf-8');
  const cleanContent = content.replace(/^\uFEFF/, '');
  const rows = parse(cleanContent, { columns: true, skip_empty_lines: true, trim: true });

  const rateMap = new Map();
  for (const row of rows) {
    const rawDate = row['Date'];
    if (!rawDate) continue;
    // investing.com format: MM/DD/YYYY (may be quoted)
    const cleaned = rawDate.replace(/"/g, '').trim();
    const parts = cleaned.split('/');
    if (parts.length !== 3) continue;
    const [month, day, year] = parts;
    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const price = parseFloat(row['Price']);
    if (price && !isNaN(price) && price > 0) {
      rateMap.set(isoDate, price);
    }
  }

  return rateMap;
}

/**
 * Transforms expense CSV files
 */
function transformExpenses() {
  console.log('\n📊 Transforming expenses...');

  const rateMap = loadBrlRateMap();
  if (rateMap.size > 0) {
    console.log(`  📈 Loaded ${rateMap.size} per-date EUR/BRL rates from historical CSV`);
  }

  const inputFile = path.join(RAW_DIR, 'expenses.csv');
  const rows = readCsv(inputFile);
  const transformed = [];
  const stats = {
    total: rows.length,
    valid: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
    brlFromCsv: 0,
    brlFromCsvPrevDay: 0,
    brlFromConfig: 0
  };

  rows.forEach((row, index) => {
    const result = validateExpense(row, rateMap);

    if (result.valid) {
      transformed.push(result.data);
      stats.valid++;
      if (result.data.currency === 'BRL') {
        if (result.rateSource === 'csv') stats.brlFromCsv++;
        else if (result.rateSource === 'csv-prev-day') stats.brlFromCsvPrevDay++;
        else stats.brlFromConfig++;
      }
    } else if (result.skip) {
      stats.skipped++;
    } else {
      stats.errors++;
      stats.errorDetails.push({
        row: index + 2,  // +2 for header and 0-based index
        errors: result.errors,
        data: row
      });
    }
  });

  console.log(`  ✓ Processed ${stats.total} rows`);
  console.log(`    • Valid: ${stats.valid}`);
  console.log(`    • Skipped: ${stats.skipped}`);
  console.log(`    • Errors: ${stats.errors}`);
  if (stats.brlFromCsv + stats.brlFromCsvPrevDay + stats.brlFromConfig > 0) {
    console.log(`    • BRL rates from CSV: ${stats.brlFromCsv}, from CSV prev-day (weekends): ${stats.brlFromCsvPrevDay}, from config fallback: ${stats.brlFromConfig}`);
  }

  if (stats.errors > 0) {
    console.log('\n⚠️  Errors found:');
    stats.errorDetails.slice(0, 5).forEach(err => {
      console.log(`  Row ${err.row}: ${err.errors.join(', ')}`);
    });
    if (stats.errorDetails.length > 5) {
      console.log(`  ... and ${stats.errorDetails.length - 5} more`);
    }
  }

  return { stats, data: transformed };
}

/**
 * Transforms budget allocation CSV files
 */
function transformBudgetAllocations() {
  console.log('\n💰 Transforming budget allocations...');

  const inputFiles = [
    path.join(RAW_DIR, 'budget_allocations.csv')
  ];

  const transformed = [];
  const stats = {
    total: 0,
    valid: 0,
    skipped: 0,
    errors: 0,
    errorDetails: []
  };

  inputFiles.forEach(inputFile => {
    if (!fs.existsSync(inputFile)) {
      console.log(`  ⚠️  File not found: ${path.basename(inputFile)}`);
      return;
    }

    const rows = readCsv(inputFile);
    stats.total += rows.length;

    rows.forEach((row, index) => {
      const result = validateBudgetAllocation(row);

      if (result.valid) {
        transformed.push(result.data);
        stats.valid++;
      } else if (result.skip) {
        stats.skipped++;
      } else {
        stats.errors++;
        stats.errorDetails.push({
          file: path.basename(inputFile),
          row: index + 2,
          errors: result.errors,
          data: row
        });
      }
    });
  });

  console.log(`  ✓ Processed ${stats.total} rows`);
  console.log(`    • Valid: ${stats.valid}`);
  console.log(`    • Skipped: ${stats.skipped}`);
  console.log(`    • Errors: ${stats.errors}`);

  if (stats.errors > 0) {
    console.log('\n⚠️  Errors found:');
    stats.errorDetails.slice(0, 5).forEach(err => {
      console.log(`  ${err.file} row ${err.row}: ${err.errors.join(', ')}`);
    });
    if (stats.errorDetails.length > 5) {
      console.log(`  ... and ${stats.errorDetails.length - 5} more`);
    }
  }

  return { stats, data: transformed };
}

/**
 * Main transformation pipeline
 */
function main() {
  console.log('========================================');
  console.log('🔄 CSV Transformation Pipeline');
  console.log('========================================');

  const SEED_DIR = path.join(SCRIPT_DIR, '..');
  const outputFile = path.join(SEED_DIR, '02_import_normalized.sql');

  try {
    // Parse valid categories from seed (single source of truth)
    const seedFile = path.join(SEED_DIR, '01_seed_categories.sql');
    const VALID_CATEGORIES = parseCategoriesFromSeed(seedFile);
    console.log(`\n📂 Parsed ${VALID_CATEGORIES.size} valid categories from 01_seed_categories.sql`);

    const expenseResult = transformExpenses();
    const budgetResult = transformBudgetAllocations();

    // Generate SQL file
    console.log('\n📝 Generating SQL seed file...');

    const sqlLines = [];
    sqlLines.push('-- ============================================================================');
    sqlLines.push('-- 02_import_normalized.sql - Import Normalized Data');
    sqlLines.push('-- ============================================================================');
    sqlLines.push('-- Auto-generated by transform-csvs.js');
    sqlLines.push(`-- Generated: ${new Date().toISOString()}`);
    sqlLines.push('-- ============================================================================');
    sqlLines.push('');
    sqlLines.push('DO $$');
    sqlLines.push('DECLARE');
    sqlLines.push('  shared_household_id UUID;');
    sqlLines.push('  user1_id UUID;');
    sqlLines.push('  imported_count INTEGER;');
    sqlLines.push('BEGIN');
    sqlLines.push('  RAISE NOTICE \'========================================\';');
    sqlLines.push('  RAISE NOTICE \'[4/5] Importing normalized data...\';');
    sqlLines.push('  RAISE NOTICE \'========================================\';');
    sqlLines.push('');
    sqlLines.push('  -- Get IDs');
    sqlLines.push('  SELECT id INTO shared_household_id FROM public.households LIMIT 1;');
    sqlLines.push(`  SELECT id INTO user1_id FROM public.users WHERE email = '${config.users.user1.email}';`);
    sqlLines.push('');
    sqlLines.push('  -- Idempotency: skip if data already imported');
    sqlLines.push('  IF EXISTS (SELECT 1 FROM public.expenses WHERE household_id = shared_household_id) THEN');
    sqlLines.push('    RAISE NOTICE \'  → Data already imported, skipping\';');
    sqlLines.push('    RETURN;');
    sqlLines.push('  END IF;');
    sqlLines.push('');
    sqlLines.push('  -- ============================================================================');
    sqlLines.push('  -- Import Budget Allocations');
    sqlLines.push('  -- ============================================================================');
    sqlLines.push('  RAISE NOTICE \'  Importing budget allocations...\';');
    sqlLines.push('');
    sqlLines.push(generateBudgetSql(budgetResult.data, VALID_CATEGORIES));
    sqlLines.push('');
    sqlLines.push('  GET DIAGNOSTICS imported_count = ROW_COUNT;');
    sqlLines.push('  RAISE NOTICE \'  ✓ Imported % budget allocations\', imported_count;');
    sqlLines.push('');
    sqlLines.push('  -- ============================================================================');
    sqlLines.push('  -- Import Expenses');
    sqlLines.push('  -- ============================================================================');
    sqlLines.push('  RAISE NOTICE \'  Importing expenses...\';');
    sqlLines.push('');
    sqlLines.push(generateExpensesSql(expenseResult.data, VALID_CATEGORIES));
    sqlLines.push('');
    sqlLines.push('  GET DIAGNOSTICS imported_count = ROW_COUNT;');
    sqlLines.push('  RAISE NOTICE \'  ✓ Imported % expenses\', imported_count;');
    sqlLines.push('');
    sqlLines.push('  -- ============================================================================');
    sqlLines.push('  -- Summary');
    sqlLines.push('  -- ============================================================================');
    sqlLines.push('  RAISE NOTICE \'========================================\';');
    sqlLines.push('  RAISE NOTICE \'[5/5] Data import complete!\';');
    sqlLines.push('  RAISE NOTICE \'========================================\';');
    sqlLines.push('END $$;');
    sqlLines.push('');

    fs.writeFileSync(outputFile, sqlLines.join('\n'), 'utf-8');

    console.log('\n========================================');
    console.log('✅ Transformation complete!');
    console.log('========================================');
    console.log(`📁 Output: ${outputFile}`);
    console.log(`  • ${budgetResult.stats.valid} budget allocations`);
    console.log(`  • ${expenseResult.stats.valid} expenses`);
    console.log('========================================\n');

    // Exit with error if there were validation errors
    if (expenseResult.stats.errors > 0 || budgetResult.stats.errors > 0) {
      console.error('❌ Transformation completed with errors');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error during transformation:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, transformExpenses, transformBudgetAllocations };
