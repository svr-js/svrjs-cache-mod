const {
  parseCacheControl,
  parseVary,
  shouldCacheResponse,
  isCacheValid
} = require("../../src/utils/cacheControlUtils.js");

describe("parseCacheControl", () => {
  test("should return an empty object if header is null or undefined", () => {
    expect(parseCacheControl(null)).toEqual({});
    expect(parseCacheControl(undefined)).toEqual({});
  });

  test("should parse cache-control header correctly", () => {
    const header = "max-age=3600, no-cache, private";
    expect(parseCacheControl(header)).toEqual({
      "max-age": "3600",
      "no-cache": true,
      private: true
    });
  });

  test("should handle directives without values", () => {
    const header = "no-store, public";
    expect(parseCacheControl(header)).toEqual({
      "no-store": true,
      public: true
    });
  });

  test("should trim whitespace correctly", () => {
    const header = " max-age = 3600 , no-cache , private ";
    expect(parseCacheControl(header)).toEqual({
      "max-age": "3600",
      "no-cache": true,
      private: true
    });
  });
});

describe("parseVary", () => {
  test("should return an empty array if header is null or undefined", () => {
    expect(parseVary(null)).toEqual([]);
    expect(parseVary(undefined)).toEqual([]);
  });

  test("should parse vary header correctly", () => {
    const header = "Accept-Encoding, User-Agent";
    expect(parseVary(header)).toEqual(["Accept-Encoding", "User-Agent"]);
  });

  test("should trim whitespace correctly", () => {
    const header = " Accept-Encoding , User-Agent ";
    expect(parseVary(header)).toEqual(["Accept-Encoding", "User-Agent"]);
  });
});

describe("shouldCacheResponse", () => {
  test("should return false if no-store is present", () => {
    const cacheControl = { "no-store": true };
    expect(shouldCacheResponse(cacheControl, false)).toBe(false);
  });

  test("should return false if private is present", () => {
    const cacheControl = { private: true };
    expect(shouldCacheResponse(cacheControl, false)).toBe(false);
  });

  test("should return true if public is present", () => {
    const cacheControl = { public: true };
    expect(shouldCacheResponse(cacheControl, false)).toBe(true);
  });

  test("should return true if max-age is present and not authenticated", () => {
    const cacheControl = { "max-age": "3600" };
    expect(shouldCacheResponse(cacheControl, false)).toBe(true);
  });

  test("should return false if max-age is present and authenticated", () => {
    const cacheControl = { "max-age": "3600" };
    expect(shouldCacheResponse(cacheControl, true)).toBe(false);
  });

  test("should return true if s-maxage is present and not authenticated", () => {
    const cacheControl = { "s-maxage": "3600" };
    expect(shouldCacheResponse(cacheControl, false)).toBe(true);
  });

  test("should return false if s-maxage is present and authenticated", () => {
    const cacheControl = { "s-maxage": "3600" };
    expect(shouldCacheResponse(cacheControl, true)).toBe(false);
  });

  test("should return false if no relevant directives are present", () => {
    const cacheControl = {};
    expect(shouldCacheResponse(cacheControl, false)).toBe(false);
  });
});

describe("isCacheValid", () => {
  test("should return false if cache is expired", () => {
    const entry = {
      timestamp: Date.now() - 4000,
      cacheControl: { "max-age": "3" }
    };
    const requestHeaders = {};
    expect(isCacheValid(entry, requestHeaders)).toBe(false);
  });

  test("should return false if no-cache is present in request headers", () => {
    const entry = {
      timestamp: Date.now(),
      cacheControl: { "max-age": "3600" }
    };
    const requestHeaders = { "cache-control": "no-cache" };
    expect(isCacheValid(entry, requestHeaders)).toBe(false);
  });

  test("should return true if cache is valid", () => {
    const entry = {
      timestamp: Date.now(),
      cacheControl: { "max-age": "3600" }
    };
    const requestHeaders = {};
    expect(isCacheValid(entry, requestHeaders)).toBe(true);
  });
});
