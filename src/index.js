const {
  parseCacheControl,
  parseVary,
  shouldCacheResponse,
  isCacheValid
} = require("./utils/cacheControlUtils.js");
const modInfo = require("../modInfo.json");

// Simple in-memory cache
const cache = new Map();
const varyCache = new Map();

module.exports = function (req, res, logFacilities, config, next) {
  // Cache configuration
  const cacheVaryHeadersConfigured = config.cacheVaryHeaders
    ? config.cacheVaryHeaders
    : [];
  const maximumCachedResponseSize = config.maximumCachedResponseSize
    ? config.maximumCachedResponseSize
    : null;

  const cacheKey =
    req.method +
    " " +
    (req.socket.encrypted ? "https://" : "http://") +
    (req.headers.host ? req.headers.host : "") +
    req.url;
  const requestCacheControl = parseCacheControl(req.headers["cache-control"]);

  if (
    (req.method != "GET" && req.method != "HEAD") ||
    requestCacheControl["no-store"]
  ) {
    res.setHeader("X-SVRJS-Cache", "BYPASS");
    return next(); // Skip cache and proceed to the next middleware
  }

  // Check cache
  if (!requestCacheControl["no-cache"] && varyCache.has(cacheKey)) {
    const processedVary = varyCache.get(cacheKey);
    const cacheKeyWithVary =
      cacheKey +
      "\n" +
      processedVary
        .map((headerName) =>
          req.headers[headerName]
            ? `${headerName}: ${req.headers[headerName]}`
            : ""
        )
        .join("\n");
    varyCache.set(cacheKey, processedVary);

    if (cache.has(cacheKeyWithVary)) {
      const cachedEntry = cache.get(cacheKeyWithVary);
      if (isCacheValid(cachedEntry, req.headers)) {
        logFacilities.resmessage("The response is cached.");
        res.getHeaderNames().forEach((headerName) => {
          res.removeHeader(headerName);
        });
        res.setHeader("X-SVRJS-Cache", "HIT");
        res.writeHead(cachedEntry.statusCode, cachedEntry.headers);
        res.end(Buffer.from(cachedEntry.body, "latin1"));
        return; // Serve cached response and stop further execution
      } else {
        cache.delete(cacheKey); // Cache expired
      }
    }
  }

  // Capture the response
  const originalSetHeader = res.setHeader.bind(res);
  const originalRemoveHeader = res.removeHeader.bind(res);
  const originalWriteHead = res.writeHead.bind(res);
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let writtenHeaders = res.getHeaders();
  let writtenStatusCode = 200;
  let responseBody = "";
  let maximumCachedResponseSizeExceeded = false;
  let piping = false;

  res.setHeader = function (name, value) {
    writtenHeaders[name.toLowerCase()] = value;
    originalSetHeader(name, value);
  };

  res.removeHeader = function (name) {
    delete writtenHeaders[name.toLowerCase()];
    originalRemoveHeader(name);
  };

  res.writeHead = function (statusCode, statusCodeDescription, headers) {
    const properHeaders = headers ? headers : statusCodeDescription;
    if (typeof properHeaders === "object" && properHeaders !== null) {
      Object.keys(properHeaders).forEach((key) => {
        writtenHeaders[key.toLowerCase()] = properHeaders[key];
      });
    }
    writtenStatusCode = statusCode;
    originalSetHeader("X-SVRJS-Cache", "MISS");
    if (headers || typeof statusCodeDescription !== "object") {
      originalWriteHead(
        writtenStatusCode,
        statusCodeDescription,
        writtenHeaders
      );
    } else {
      originalWriteHead(writtenStatusCode, writtenHeaders);
    }
  };

  res.end = function (chunk, encoding, callback) {
    if (req.method != "HEAD" && chunk && !maximumCachedResponseSizeExceeded) {
      const processedChunk = Buffer.from(
        chunk,
        typeof encoding === "string" ? encoding : undefined
      ).toString("latin1");
      if (
        maximumCachedResponseSize !== null &&
        maximumCachedResponseSize !== undefined &&
        responseBody.length + processedChunk.length > maximumCachedResponseSize
      ) {
        maximumCachedResponseSizeExceeded = true;
      } else {
        try {
          responseBody += processedChunk;
          // eslint-disable-next-line no-unused-vars
        } catch (err) {
          maximumCachedResponseSizeExceeded = true;
        }
      }
    }

    const responseCacheControl = parseCacheControl(
      writtenHeaders[
        Object.keys(writtenHeaders).find(
          (key) => key.toLowerCase() == "cache-control"
        )
      ]
    );

    if (
      !maximumCachedResponseSizeExceeded &&
      shouldCacheResponse(
        responseCacheControl,
        req.headers.authorization !== undefined
      )
    ) {
      if (!responseCacheControl["max-age"])
        responseCacheControl["max-age"] = "300"; // Set the default max-age to 300 seconds (5 minutes)

      const responseVary = parseVary(
        writtenHeaders[
          Object.keys(writtenHeaders).find((key) => key.toLowerCase() == "vary")
        ]
      );
      const processedVary = [
        ...new Set(
          [...cacheVaryHeadersConfigured, ...responseVary].map((headerName) =>
            headerName.toLowerCase()
          )
        )
      ];
      if (!responseVary.find((headerName) => headerName == "*")) {
        const cacheKeyWithVary =
          cacheKey +
          "\n" +
          processedVary
            .map((headerName) =>
              req.headers[headerName]
                ? `${headerName}: ${req.headers[headerName]}`
                : ""
            )
            .join("\n");

        varyCache.set(cacheKey, processedVary);
        cache.set(cacheKeyWithVary, {
          body: responseBody,
          headers: writtenHeaders,
          timestamp: Date.now(),
          statusCode: writtenStatusCode,
          cacheControl: responseCacheControl
        });
      }
    }

    originalEnd(chunk, encoding, callback);
  };

  if (req.method != "HEAD") {
    res.write = function (chunk, encoding, callback) {
      if (!piping && chunk && !maximumCachedResponseSizeExceeded) {
        const processedChunk = Buffer.from(
          chunk,
          typeof encoding === "string" ? encoding : undefined
        ).toString("latin1");
        if (
          maximumCachedResponseSize !== null &&
          maximumCachedResponseSize !== undefined &&
          responseBody.length + processedChunk.length >
            maximumCachedResponseSize
        ) {
          maximumCachedResponseSizeExceeded = true;
        } else {
          try {
            responseBody += processedChunk;
            // eslint-disable-next-line no-unused-vars
          } catch (err) {
            maximumCachedResponseSizeExceeded = true;
          }
        }
      }

      originalWrite(chunk, encoding, callback);
    };

    res.on("pipe", (src) => {
      piping = true;
      src.on("data", (chunk) => {
        if (!maximumCachedResponseSizeExceeded) {
          const processedChunk = Buffer.from(chunk).toString("latin1");
          if (
            maximumCachedResponseSize !== null &&
            maximumCachedResponseSize !== undefined &&
            responseBody.length + processedChunk.length >
              maximumCachedResponseSize
          ) {
            maximumCachedResponseSizeExceeded = true;
          } else {
            try {
              responseBody += processedChunk;
              // eslint-disable-next-line no-unused-vars
            } catch (err) {
              maximumCachedResponseSizeExceeded = true;
            }
          }
        }
      });
    });

    res.on("unpipe", () => {
      piping = false;
    });
  }

  next(); // Continue with normal processing
};

module.exports.commands = {
  purgecache: (args, log) => {
    // All commands are executed on workers
    cache.clear();
    varyCache.clear();
    log("Cache cleared successfully.");
  }
};

module.exports.configValidators = {
  cacheVaryHeaders: (value) =>
    Array.isArray(value) &&
    value.every((element) => typeof element === "string"),
  maximumCachedResponseSize: (value) =>
    typeof value === "number" || value === null
};

module.exports.modInfo = modInfo;
