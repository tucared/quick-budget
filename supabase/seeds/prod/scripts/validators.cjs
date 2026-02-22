/**
 * Data validation and cleaning utilities
 * Pure functions for transforming CSV data to database format
 */

// Load config.local.cjs if it exists, otherwise use config.cjs template
let config;
try {
  config = require('./config.local.cjs');
} catch (e) {
  config = require('./config.cjs');
}

/**
 * Detects currency from amount string
 * @param {string} amountStr - Amount string like "€11.50" or "R$45,30"
 * @returns {string} - Currency code like "EUR" or "BRL"
 */
function detectCurrency(amountStr) {
  if (!amountStr) return config.defaults.currency;

  for (const [symbol, code] of Object.entries(config.currencySymbols)) {
    if (amountStr.includes(symbol)) {
      return code;
    }
  }

  return config.defaults.currency;
}

/**
 * Parses amount string to decimal number
 * Handles both European (€11,50) and Brazilian (R$45,30) formats
 * @param {string} amountStr - Amount string with currency symbol
 * @returns {number|null} - Parsed decimal amount
 */
function parseAmount(amountStr) {
  if (!amountStr || amountStr.trim() === '') return null;

  // Remove currency symbols and negative signs
  let cleaned = amountStr
    .replace(/€/g, '')
    .replace(/R\$/g, '')
    .replace(/-/g, '')
    .trim();

  // Brazilian format uses comma as decimal separator (R$45,30)
  // European format can have comma as thousands separator (€1,234.50) or decimal (€11,50)
  const currency = detectCurrency(amountStr);

  if (currency === 'BRL') {
    // Brazilian: comma is decimal separator
    cleaned = cleaned.replace(',', '.');
  } else {
    // European: remove commas (could be thousands or decimal)
    // If there's a period after the comma, comma is thousands separator
    // If there's no period, comma might be decimal separator
    if (cleaned.includes(',') && !cleaned.includes('.')) {
      // No period, comma is likely decimal separator (€11,50)
      cleaned = cleaned.replace(',', '.');
    } else {
      // Has period, comma is thousands separator (€1,234.50)
      cleaned = cleaned.replace(',', '');
    }
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : Math.abs(parsed);
}

/**
 * Parses date string from DD/MM/YYYY to YYYY-MM-DD
 * @param {string} dateStr - Date string like "01/03/2021"
 * @returns {string|null} - ISO date string like "2021-03-01"
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;

  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;
  const dayNum = parseInt(day, 10);
  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  if (isNaN(dayNum) || isNaN(monthNum) || isNaN(yearNum)) return null;
  if (dayNum < 1 || dayNum > 31) return null;
  if (monthNum < 1 || monthNum > 12) return null;
  if (yearNum < 2000 || yearNum > 2100) return null;

  // Format as YYYY-MM-DD with zero padding
  const isoDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  return isoDate;
}

/**
 * Calculates converted amount and exchange rate
 * @param {number} amount - Original amount
 * @param {string} currency - Original currency code
 * @param {string|null} expenseDate - ISO date string YYYY-MM-DD (used to look up per-date rate for BRL)
 * @param {Map<string, number>|null} rateMap - Map of YYYY-MM-DD → EUR/BRL rate (e.g. 6.099); optional
 * @returns {Object} - {convertedAmount, exchangeRate, rateSource}
 */
function calculateConversion(amount, currency, expenseDate = null, rateMap = null) {
  if (!amount || !currency) {
    return { convertedAmount: null, exchangeRate: null, rateSource: null };
  }

  let eurToCurrencyRate;
  let rateSource = 'config';

  if (currency === 'BRL' && rateMap && expenseDate) {
    // Look up exact date first, then walk back up to 3 days for weekends/holidays
    let lookupDate = expenseDate;
    let found = false;
    for (let i = 0; i <= 3; i++) {
      if (rateMap.has(lookupDate)) {
        eurToCurrencyRate = rateMap.get(lookupDate);
        rateSource = i === 0 ? 'csv' : 'csv-prev-day';
        found = true;
        break;
      }
      // Step back one day
      const d = new Date(lookupDate + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      lookupDate = d.toISOString().split('T')[0];
    }
  }

  if (!eurToCurrencyRate) {
    // Fallback: config stores rate_to_eur (e.g. BRL: 6.2267 means 1 EUR = 6.2267 BRL)
    eurToCurrencyRate = config.exchangeRates[currency] || 1.0;
  }

  // rate_to_eur = how many EUR per 1 unit of currency = 1 / eurToCurrencyRate
  const rateToEur = 1 / eurToCurrencyRate;
  const convertedAmount = amount * rateToEur;

  return {
    convertedAmount: Math.round(convertedAmount * 100) / 100,  // Round to 2 decimals
    exchangeRate: parseFloat(rateToEur.toFixed(6)),
    rateSource
  };
}

/**
 * Validates and transforms expense row from CSV
 * @param {Object} row - Raw CSV row
 * @param {Map<string, number>|null} rateMap - Optional per-date EUR/BRL rate map
 * @returns {Object} - {valid, data, errors}
 */
function validateExpense(row, rateMap = null) {
  const errors = [];

  // Required fields
  if (!row.Name || row.Name.trim() === '') {
    errors.push('Missing description');
  }

  if (!row.Date) {
    errors.push('Missing date');
  }

  // Check exclusion criteria
  if (row.Credit === config.excludeTransactions.credit) {
    return { valid: false, skip: true, reason: 'Credit transaction excluded' };
  }

  if (config.excludeCategories.includes(row.Category)) {
    return { valid: false, skip: true, reason: `Category "${row.Category}" excluded` };
  }

  // Determine currency and amount
  let amount, currency;

  if (row.Amount_BRL && row.Amount_BRL.trim() !== '') {
    // BRL transaction
    amount = parseAmount(row.Amount_BRL);
    currency = 'BRL';
  } else if (row.Amount) {
    // EUR transaction
    amount = parseAmount(row.Amount);
    currency = 'EUR';
  } else {
    errors.push('Missing amount');
  }

  const expenseDate = parseDate(row.Date);
  if (!expenseDate) {
    errors.push('Invalid date format');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Calculate conversion
  const { convertedAmount, exchangeRate, rateSource } = calculateConversion(amount, currency, expenseDate, rateMap);

  // Transform to DB schema
  const data = {
    description: row.Name.trim(),
    amount: amount,
    currency: currency,
    converted_amount: convertedAmount,
    converted_currency: 'EUR',
    exchange_rate: exchangeRate,
    expense_date: expenseDate,
    category: row.Category?.trim() || null,
    account: row.Mean?.trim() || null
  };

  return { valid: true, data, rateSource };
}

/**
 * Validates and transforms budget allocation row from CSV
 * @param {Object} row - Raw CSV row
 * @returns {Object} - {valid, data, errors}
 */
function validateBudgetAllocation(row) {
  const errors = [];

  // Required fields
  if (!row.month) {
    errors.push('Missing month');
  }

  if (!row.category || row.category.trim() === '') {
    errors.push('Missing category');
  }

  if (!row.budget_eur) {
    errors.push('Missing budget amount');
  }

  // Check exclusion criteria
  if (config.excludeCategories.includes(row.category)) {
    return { valid: false, skip: true, reason: `Category "${row.category}" excluded` };
  }

  // Parse budget amount (format: "1,234.50" or "1234.50")
  const budgetStr = row.budget_eur.replace(/,/g, '');
  const allocatedAmount = parseFloat(budgetStr);

  if (isNaN(allocatedAmount)) {
    errors.push('Invalid budget amount');
  }

  // Validate date format (should already be YYYY-MM-DD from CSV)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(row.month)) {
    errors.push('Invalid month format (expected YYYY-MM-DD)');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Transform to DB schema
  const data = {
    budget_month: row.month,
    category: row.category.trim(),
    allocated_amount: allocatedAmount,
    currency: 'EUR'
  };

  return { valid: true, data };
}

module.exports = {
  detectCurrency,
  parseAmount,
  parseDate,
  calculateConversion,
  validateExpense,
  validateBudgetAllocation
};
