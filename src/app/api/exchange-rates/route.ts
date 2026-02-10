import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchExchangeRate } from '@/lib/exchange-rate-api'

/**
 * GET /api/exchange-rates?currency=BRL&date=2024-01-15
 *
 * Fetches exchange rate for a currency on a specific date.
 * Checks database cache first, fetches from API and caches if not found.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const currency = searchParams.get('currency')
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    if (!currency) {
      return NextResponse.json(
        { error: 'Currency parameter is required' },
        { status: 400 }
      )
    }

    // Validate currency format (3 uppercase letters)
    if (!/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json(
        { error: 'Currency must be a 3-letter ISO code (e.g., BRL, USD)' },
        { status: 400 }
      )
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Date must be in YYYY-MM-DD format' },
        { status: 400 }
      )
    }

    // EUR to EUR is always 1.0
    if (currency === 'EUR') {
      return NextResponse.json({
        currency,
        date,
        rate: 1.0,
        source: 'fixed'
      })
    }

    const supabase = await createServerSupabaseClient()

    // Check if rate exists in database
    const { data: cachedRate, error: selectError } = await supabase
      .from('exchange_rates')
      .select('rate_to_eur, created_at')
      .eq('currency', currency)
      .eq('rate_date', date)
      .maybeSingle()

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 is "not found", which is expected
      console.error('Database error fetching exchange rate:', selectError)
      throw selectError
    }

    if (cachedRate) {
      // Found in cache
      return NextResponse.json({
        currency,
        date,
        rate: Number(cachedRate.rate_to_eur),
        source: 'cache',
        cachedAt: cachedRate.created_at
      })
    }

    // Not in cache, fetch from API
    const rate = await fetchExchangeRate(currency, date)

    // Store in database for future use
    const { error: insertError } = await supabase
      .from('exchange_rates')
      .insert({
        currency,
        rate_date: date,
        rate_to_eur: rate
      })

    if (insertError) {
      // Log but don't fail - we still have the rate
      console.error('Failed to cache exchange rate:', insertError)
    }

    return NextResponse.json({
      currency,
      date,
      rate,
      source: 'api'
    })

  } catch (error) {
    console.error('Exchange rate API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch exchange rate' },
      { status: 500 }
    )
  }
}
