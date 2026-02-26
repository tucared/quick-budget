import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchExchangeRate, adjustToWorkingDay } from '@/lib/exchange-rate-api'
import { createRateLimiter } from '@/lib/rate-limit'
import { FALLBACK_RATES_TO_EUR } from '@/lib/currency'

// 20 requests per user per minute — generous for normal use,
// but prevents runaway loops from hammering Frankfurter.
const rateLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 })

/**
 * GET /api/exchange-rates?currency=BRL&date=2024-01-15
 *
 * Fetches exchange rate for a currency on a specific date.
 * Checks database cache first, fetches from API and caches if not found.
 * Weekend dates are automatically adjusted to the previous Friday.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const currency = searchParams.get('currency')
    const requestedDate = searchParams.get('date') || new Date().toISOString().split('T')[0]

    // Adjust weekend dates to previous working day
    const date = adjustToWorkingDay(requestedDate)

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
        source: 'fixed',
        ...(date !== requestedDate && { adjustedFrom: requestedDate })
      })
    }

    const supabase = await createServerSupabaseClient()

    // Verify the user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Rate-limit by authenticated user ID
    const { allowed, retryAfterMs } = rateLimiter(user.id)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((retryAfterMs ?? 1000) / 1000)),
          },
        }
      )
    }

    // Check if rate exists in database
    const { data: cachedRate, error: selectError } = await supabase
      .from('exchange_rates')
      .select('rate_to_eur, created_at')
      .eq('currency', currency)
      .eq('rate_date', date)
      .maybeSingle()

    if (selectError) {
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
        cachedAt: cachedRate.created_at,
        ...(date !== requestedDate && { adjustedFrom: requestedDate })
      })
    }

    // Not in cache — try Frankfurter
    let rate: number

    try {
      rate = await fetchExchangeRate(currency, date)
    } catch (apiError) {
      console.error(`Frankfurter API failed for ${currency} on ${date}:`, apiError)

      // Use hardcoded fallback so the expense can still be saved.
      // Do NOT cache this rate — next request will retry Frankfurter.
      rate = FALLBACK_RATES_TO_EUR[currency] ?? 1.0
      console.warn(`Using fallback rate for ${currency}: ${rate}`)

      return NextResponse.json({
        currency,
        date,
        rate,
        source: 'fallback',
        ...(date !== requestedDate && { adjustedFrom: requestedDate })
      })
    }

    // Cache confirmed rates from Frankfurter
    const { error: insertError } = await supabase
      .from('exchange_rates')
      .insert({
        currency,
        rate_date: date,
        rate_to_eur: rate
      })

    if (insertError) {
      // Log but don't fail — we still have the rate
      console.error('Failed to cache exchange rate:', insertError)
    }

    return NextResponse.json({
      currency,
      date,
      rate,
      source: 'api',
      ...(date !== requestedDate && { adjustedFrom: requestedDate })
    })

  } catch (error) {
    console.error('Exchange rate API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch exchange rate' },
      { status: 500 }
    )
  }
}
