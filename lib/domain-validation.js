import dns from "node:dns/promises";

export async function inspectCommercialDomain(origin, options = {}) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return result(false, "Canonical origin is not a valid URL.");
  }
  if (url.protocol !== "https:" || /\.vercel\.app$/i.test(url.hostname)) {
    return result(false, "Canonical origin must use the custom HTTPS domain.");
  }

  const resolve4 = options.resolve4 || dns.resolve4;
  const fetchImpl = options.fetch || fetch;
  let addresses = [];
  try {
    addresses = await resolve4(url.hostname);
  } catch {
    return result(false, "The apex domain is not available through public DNS.");
  }
  if (!addresses.length) return result(false, "The apex domain has no public A record.");

  let apexResponse;
  try {
    apexResponse = await fetchImpl(url.origin, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return result(false, "The apex HTTPS endpoint is not reachable.", { addresses });
  }
  if (apexResponse.status < 200 || apexResponse.status >= 400) {
    return result(false, `The apex HTTPS endpoint returned ${apexResponse.status}.`, {
      addresses,
      apexStatus: apexResponse.status,
    });
  }

  const wwwOrigin = `${url.protocol}//www.${url.hostname}`;
  let wwwResponse;
  try {
    wwwResponse = await fetchImpl(wwwOrigin, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return result(false, "The www HTTPS endpoint is not reachable.", {
      addresses,
      apexStatus: apexResponse.status,
    });
  }
  const location = wwwResponse.headers.get("location") || "";
  const redirectValid = [301, 308].includes(wwwResponse.status) && redirectTarget(location, url.origin);
  if (!redirectValid) {
    return result(false, "The www domain does not permanently redirect to the apex origin.", {
      addresses,
      apexStatus: apexResponse.status,
      wwwStatus: wwwResponse.status,
    });
  }

  return result(true, "Public DNS, apex HTTPS, and the www permanent redirect are valid.", {
    addresses,
    apexStatus: apexResponse.status,
    wwwStatus: wwwResponse.status,
  });
}

function redirectTarget(location, origin) {
  try {
    return new URL(location, origin).origin === origin;
  } catch {
    return false;
  }
}

function result(valid, reason, details = {}) {
  return { valid, reason, ...details };
}
