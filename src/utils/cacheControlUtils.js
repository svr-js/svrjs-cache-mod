function parseCacheControl(header) {
  const directives = {};
  if (!header) return directives;
  header.split(",").forEach((directive) => {
    const [key, value] = directive.trim().split("=");
    directives[key.toLowerCase().trim()] = value ? value.trim() : true;
  });
  return directives;
}

function parseVary(header) {
  if (!header) return [];
  return header.split(",").map((headerName) => headerName.trim());
}

function shouldCacheResponse(cacheControl, isAuthenticated) {
  if (cacheControl["no-store"] || cacheControl["private"]) {
    return false;
  }
  if (cacheControl["public"]) {
    return true;
  }
  return (
    !isAuthenticated &&
    (cacheControl["max-age"] !== undefined ||
      cacheControl["s-maxage"] !== undefined)
  );
}

function isCacheValid(entry, requestHeaders) {
  const { timestamp, cacheControl } = entry;
  const maxAge = cacheControl["s-maxage"]
    ? parseInt(cacheControl["s-maxage"], 10)
    : parseInt(cacheControl["max-age"], 10);
  if (Date.now() - timestamp > maxAge * 1000) {
    return false;
  }

  if (
    requestHeaders["cache-control"] &&
    requestHeaders["cache-control"].includes("no-cache")
  ) {
    return false;
  }

  return true;
}

module.exports = {
  parseCacheControl: parseCacheControl,
  parseVary: parseVary,
  shouldCacheResponse: shouldCacheResponse,
  isCacheValid: isCacheValid
};
