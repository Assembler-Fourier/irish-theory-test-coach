# Conversion Dashboard Guide

The admin analytics section reports directional growth metrics without pretending small samples are conclusive.

## Core Rates

- Landing to preview: `start_free_practice / landing_view`
- Preview to paywall: `paywall_viewed / preview_started`
- Paywall to checkout: `checkout_started / paywall_viewed`
- Checkout to purchase: `checkout_completed / checkout_started`
- Purchase to first paid session: `first_paid_session / checkout_completed`
- Mock completion: `first_mock_completed / first_mock_started`
- Restore success: `access_restored / restore_access_started`

Rates below 30 denominator events are labelled directional. Do not make pricing or marketing claims from tiny samples.

## Source And Referral Conversion

Use first-touch and last-touch attribution to compare:

- UTM source/medium/campaign/content
- Referral code
- Instructor code
- Landing page

The dashboard must not expose card data, secrets, raw tokens, or full personal query values.
