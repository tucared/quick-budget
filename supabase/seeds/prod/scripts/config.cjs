/**
 * Configuration for CSV transformation and seeding
 * Centralizes all hardcoded values for maintainability
 *
 * IMPORTANT: Copy this file to config.local.js and update with your real values.
 * config.local.js is git-ignored and will be used if present.
 */

module.exports = {
  // User configuration
  users: {
    user1: {
      email: 'user1@example.com',
      fullName: 'User One'
    },
    user2: {
      email: 'user2@example.com',
      fullName: 'User Two'
    }
  },

  // Exchange rates (historical averages for conversions)
  exchangeRates: {
    'EUR': 1.0,
    'BRL': 6.2267  // Average BRL to EUR rate
  },

  // Categories to exclude from import
  // Note: savings pot categories (Safety Net, Holidays Pot, Brazil Pot, Home Buy, Retirement)
  // are intentionally excluded — they are not tracked as spending in this app.
  excludeCategories: [],

  // Transaction filters
  // Credits (refunds, reimbursements) are imported as negative-amount expenses.
  // In the new app, use edit/delete instead of credit entries.
  excludeTransactions: {},

  // Default values
  defaults: {
    currency: 'EUR',
    account: 'Checking Account'
  },

  // File paths
  paths: {
    raw: './raw',
    normalized: './normalized'
  },

  // Currency symbol mappings
  currencySymbols: {
    '€': 'EUR',
    'R$': 'BRL'
  },

  // Date format (DD/MM/YYYY from CSV)
  dateFormat: {
    separator: '/',
    order: ['day', 'month', 'year']
  }
};
