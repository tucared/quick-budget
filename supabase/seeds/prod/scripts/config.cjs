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
  excludeCategories: ['Helper'],

  // Transaction filters
  excludeTransactions: {
    credit: 'Yes'  // Exclude credit transactions (only import expenses)
  },

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
