/**
 * Configuration for CSV transformation and seeding
 * Centralizes all hardcoded values for maintainability
 */

module.exports = {
  // User configuration
  users: {
    user1: {
      email: 'max.perdrigeat@gmail.com',
      password: 'CHANGE_ME_PASSWORD_1',
      fullName: 'Max'
    },
    user2: {
      email: 'clarissaaburocha@gmail.com',
      password: 'CHANGE_ME_PASSWORD_2',
      fullName: 'Clarissa'
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
    account: 'Green-Got Commun'
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
