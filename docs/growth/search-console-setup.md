# Search Console Setup

Canonical origin configured for this build: https://irishtheorycoach.ie

## Launch Steps

1. Connect the final custom domain in Vercel.
2. Set `PUBLIC_CANONICAL_ORIGIN` or `PUBLIC_SITE_URL` to the final HTTPS origin.
3. Rebuild and verify no production canonical metadata points to the Vercel preview domain.
4. Verify a domain property in Google Search Console.
5. Submit `https://irishtheorycoach.ie/sitemap.xml`.
6. Inspect priority URLs:
   - `https://irishtheorycoach.ie/`
   - `https://irishtheorycoach.ie/app`
   - `https://irishtheorycoach.ie/pricing`
   - `https://irishtheorycoach.ie/mock-exam`
   - `https://irishtheorycoach.ie/road-signs`
   - `https://irishtheorycoach.ie/learn`
   - `https://irishtheorycoach.ie/category-b-theory-test-ireland.html`
7. In URL Inspection, check rendered HTML, canonical URL, mobile usability, and screenshot.
8. Request indexing for priority pages after the production deployment is stable.
9. Review indexing, impressions, clicks, CTR, and average position weekly.

## Guardrails

- Do not request indexing for admin/private pages.
- Do not add review/rating schema without real visible reviews.
- Keep independent RSA/Prometric non-affiliation visible.
- Do not mass-produce near-identical pages.

## References

- Google Search Console ownership verification: https://support.google.com/webmasters/answer/9008080
- Google sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google canonical guidance: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
