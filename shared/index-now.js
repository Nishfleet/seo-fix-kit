// upstream: https://www.indexnow.org/documentation — the key file must be publicly fetchable at the host root and the .well-known alias.
export const INDEX_NOW_KEY = "3219d564f9f914772e178f33ae543e60";

export const INDEX_NOW_ENDPOINTS = ["https://api.indexnow.org/indexnow", "https://www.bing.com/indexnow"];

export const INDEX_NOW_HOST = "seofixkit.com";

export function indexNowKeyFilePaths() {
  return [`/${INDEX_NOW_KEY}.txt`, `/.well-known/${INDEX_NOW_KEY}.txt`];
}

export function indexNowKeyFileBody() {
  return `${INDEX_NOW_KEY}\n`;
}

export function indexNowKeyLocation() {
  return `https://${INDEX_NOW_HOST}/${INDEX_NOW_KEY}.txt`;
}

export function buildIndexNowPayload(urls, { host = INDEX_NOW_HOST } = {}) {
  return {
    host,
    key: INDEX_NOW_KEY,
    keyLocation: indexNowKeyLocation(),
    urlList: [...urls]
  };
}
