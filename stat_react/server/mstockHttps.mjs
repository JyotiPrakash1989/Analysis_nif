import https from 'https';

/**
 * mStock Type B is documented as GET + JSON body (see Flutter `MstockApiClient`).
 * Node's global `fetch()` rejects GET requests that include a body, so we use `https`.
 */
export function httpsJsonRequest(method, path, bodyObject, headerFields) {
  const bodyStr = JSON.stringify(bodyObject ?? {});
  const upper = method.toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(bodyStr),
    ...headerFields,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.mstock.trade',
        port: 443,
        path,
        method: upper,
        headers,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          text += c;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, text });
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/** GET with no body (option chain master, GetOptionChain, etc.). */
export function httpsGet(path, headerFields) {
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          hostname: 'api.mstock.trade',
          port: 443,
          path,
          headers: headerFields,
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (c) => {
            text += c;
          });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode ?? 0, text });
          });
        }
      )
      .on('error', reject);
  });
}
