const RETRYABLE_TOKEN_SWAP_STATUSES = new Set([401, 403, 429, 500, 503]);

function getTokenSwapRetryType(statusCode) {
  const status = Number(statusCode);
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 429 || status === 503) return "quota";
  if (status === 500) return "server_error";
  return null;
}

function isRetryableTokenSwapStatus(statusCode) {
  return RETRYABLE_TOKEN_SWAP_STATUSES.has(Number(statusCode));
}

module.exports = {
  getTokenSwapRetryType,
  isRetryableTokenSwapStatus,
};
