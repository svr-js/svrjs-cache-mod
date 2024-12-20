const mod = require("../src/index.js");
const {
  parseCacheControl,
  parseVary,
  shouldCacheResponse,
  isCacheValid
} = require("../src/utils/cacheControlUtils.js");

jest.mock("../src/utils/cacheControlUtils.js", () => ({
  parseCacheControl: jest.fn(),
  parseVary: jest.fn(),
  shouldCacheResponse: jest.fn(),
  isCacheValid: jest.fn()
}));

describe("SVR.JS Cache mod", () => {
  let req, res, logFacilities, config, next, resWriteHead, resEnd;

  beforeEach(() => {
    resWriteHead = jest.fn();
    resEnd = jest.fn();

    req = {
      method: "GET",
      headers: {},
      url: "/test",
      socket: { encrypted: false }
    };

    res = {
      headers: {},
      writeHead: resWriteHead,
      write: jest.fn(),
      end: resEnd,
      setHeader: jest.fn(),
      getHeaderNames: jest.fn(() => []),
      getHeaders: jest.fn(() => ({})),
      removeHeader: jest.fn(),
      on: jest.fn()
    };

    logFacilities = { resmessage: jest.fn() };

    config = {
      cacheVaryHeaders: ["accept"],
      maximumCachedResponseSize: 1024
    };

    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should bypass caching for non-GET requests", () => {
    req.method = "POST";

    mod(req, res, logFacilities, config, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-SVRJS-Cache", "BYPASS");
    expect(next).toHaveBeenCalled();
  });

  test("should bypass caching if Cache-Control contains no-store", () => {
    req.headers["cache-control"] = "no-store";
    parseCacheControl.mockReturnValue({ "no-store": true });

    mod(req, res, logFacilities, config, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-SVRJS-Cache", "BYPASS");
    expect(next).toHaveBeenCalled();
  });

  test("should cache the response and serve it on subsequent requests", () => {
    req.headers.host = "test.com";
    req.headers.accept = "application/json";

    parseCacheControl.mockReturnValue({});
    parseVary.mockReturnValue(["accept"]);
    shouldCacheResponse.mockReturnValue(true);

    // Mock cache-control headers
    res.getHeaders.mockReturnValue({ "cache-control": "max-age=300" });

    // First request: cache the response
    mod(req, res, logFacilities, config, next);

    // Simulate the first response
    res.writeHead(200, { "content-type": "application/json" });
    res.end("cached response body");

    // Assertions for the first request
    expect(next).toHaveBeenCalled(); // Proceed to next middleware during first request

    // Reset mocks for the second invocation
    jest.clearAllMocks();
    next.mockReset();

    // Second request: retrieve from cache
    parseCacheControl.mockReturnValue({});
    isCacheValid.mockReturnValue(true); // Simulate a valid cache entry

    mod(req, res, logFacilities, config, next);

    // Assertions for the second request
    expect(logFacilities.resmessage).toHaveBeenCalledWith(
      "The response is cached."
    );
    expect(res.setHeader).toHaveBeenCalledWith("X-SVRJS-Cache", "HIT");
    expect(resWriteHead).toHaveBeenCalledWith(200, {
      "cache-control": "max-age=300",
      "content-type": "application/json"
    });
    expect(resEnd).toHaveBeenCalledWith(
      Buffer.from("cached response body", "latin1"),
      undefined,
      undefined
    );
    expect(next).not.toHaveBeenCalled(); // No middleware should be called
  });

  test("should validate config values correctly", () => {
    const validConfig = {
      cacheVaryHeaders: ["accept", "user-agent"],
      maximumCachedResponseSize: 2048
    };

    expect(
      mod.configValidators.cacheVaryHeaders(validConfig.cacheVaryHeaders)
    ).toBe(true);
    expect(
      mod.configValidators.maximumCachedResponseSize(
        validConfig.maximumCachedResponseSize
      )
    ).toBe(true);

    const invalidConfig = {
      cacheVaryHeaders: "invalid",
      maximumCachedResponseSize: "invalid"
    };

    expect(
      mod.configValidators.cacheVaryHeaders(invalidConfig.cacheVaryHeaders)
    ).toBe(false);
    expect(
      mod.configValidators.maximumCachedResponseSize(
        invalidConfig.maximumCachedResponseSize
      )
    ).toBe(false);
  });
});
