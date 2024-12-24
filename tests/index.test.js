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
  let req, res, logFacilities, config, next;

  beforeEach(() => {
    req = {
      method: "GET",
      headers: {},
      url: "/test",
      socket: { encrypted: false }
    };

    res = {
      headers: {},
      writeHead: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      setHeader: jest.fn(),
      getHeaderNames: jest.fn(() => []),
      getHeaders: jest.fn(() => ({})),
      removeHeader: jest.fn(),
      on: jest.fn()
    };

    logFacilities = { resmessage: jest.fn() };

    config = {
      cacheVaryHeaders: ["accept"],
      cacheIgnoreHeaders: [],
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
    res.setHeader = jest.fn();
    res.removeHeader = jest.fn();
    res.writeHead = jest.fn();
    res.write = jest.fn();
    res.end = jest.fn();

    // Second request: retrieve from cache
    parseCacheControl.mockReturnValue({});
    isCacheValid.mockReturnValue(true); // Simulate a valid cache entry

    mod(req, res, logFacilities, config, next);

    // Assertions for the second request
    expect(logFacilities.resmessage).toHaveBeenCalledWith(
      "The response is cached."
    );
    expect(res.setHeader).toHaveBeenCalledWith("X-SVRJS-Cache", "HIT");
    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "cache-control": "max-age=300",
      "content-type": "application/json"
    });
    expect(res.end).toHaveBeenCalledWith(
      Buffer.from("cached response body", "latin1")
    );
    expect(next).not.toHaveBeenCalled(); // No middleware should be called
  });

  test("should cache the response and serve it on subsequent requests, while ignoring some headers", () => {
    req.headers.host = "ignore.test.com";
    req.headers.accept = "application/json";

    // Headers to ignore
    config.cacheIgnoreHeaders = ["x-header-ignored"];

    parseCacheControl.mockReturnValue({});
    parseVary.mockReturnValue(["accept"]);
    shouldCacheResponse.mockReturnValue(true);

    // Mock cache-control headers
    res.getHeaders.mockReturnValue({ "cache-control": "max-age=300" });

    // First request: cache the response
    mod(req, res, logFacilities, config, next);

    // Simulate the first response
    res.writeHead(200, {
      "content-type": "application/json",
      "x-header-ignored": "no"
    });
    res.end("cached response body");

    // Assertions for the first request
    expect(next).toHaveBeenCalled(); // Proceed to next middleware during first request

    // Reset mocks for the second invocation
    jest.clearAllMocks();
    next.mockReset();
    res.setHeader = jest.fn();
    res.removeHeader = jest.fn();
    res.writeHead = jest.fn();
    res.write = jest.fn();
    res.end = jest.fn();

    // Second request: retrieve from cache
    parseCacheControl.mockReturnValue({});
    isCacheValid.mockReturnValue(true); // Simulate a valid cache entry

    mod(req, res, logFacilities, config, next);

    // Assertions for the second request
    expect(logFacilities.resmessage).toHaveBeenCalledWith(
      "The response is cached."
    );
    expect(res.setHeader).toHaveBeenCalledWith("X-SVRJS-Cache", "HIT");
    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "cache-control": "max-age=300",
      "content-type": "application/json"
    });
    expect(res.end).toHaveBeenCalledWith(
      Buffer.from("cached response body", "latin1")
    );
    expect(next).not.toHaveBeenCalled(); // No middleware should be called
  });

  test("should validate config values correctly", () => {
    const validConfig = {
      cacheVaryHeaders: ["accept", "user-agent"],
      cacheIgnoreHeaders: ["set-cookie"],
      maximumCachedResponseSize: 2048
    };

    expect(
      mod.configValidators.cacheVaryHeaders(validConfig.cacheVaryHeaders)
    ).toBe(true);
    expect(
      mod.configValidators.cacheIgnoreHeaders(validConfig.cacheIgnoreHeaders)
    ).toBe(true);
    expect(
      mod.configValidators.maximumCachedResponseSize(
        validConfig.maximumCachedResponseSize
      )
    ).toBe(true);

    const invalidConfig = {
      cacheVaryHeaders: "invalid",
      cacheIgnoreHeaders: "invalid",
      maximumCachedResponseSize: "invalid"
    };

    expect(
      mod.configValidators.cacheVaryHeaders(invalidConfig.cacheVaryHeaders)
    ).toBe(false);
    expect(
      mod.configValidators.cacheIgnoreHeaders(invalidConfig.cacheIgnoreHeaders)
    ).toBe(false);
    expect(
      mod.configValidators.maximumCachedResponseSize(
        invalidConfig.maximumCachedResponseSize
      )
    ).toBe(false);
  });
});
