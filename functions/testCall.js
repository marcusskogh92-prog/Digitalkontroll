// Local tester that invokes the exported function via the emulator-style
// Express handler. This creates a fake `req`/`res` where `res` is a stream
// so the firebase-functions wrapper behaves the same as in the emulator.
// Usage: node testCall.js

const fnModule = require('./index');
const { PassThrough } = require('stream');

async function callOnCallFunction(fnName, data, authContext = null) {
  return new Promise((resolve, reject) => {
    const fn = fnModule[fnName];
    if (!fn) return reject(new Error('Function not found: ' + fnName));

    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5000' },
      body: { data },
      query: {},
      path: '/',
    };
    // support Express-style header getters used by middleware
    req.header = req.get = function (name) {
      if (!name) return undefined;
      const key = String(name).toLowerCase();
      return this.headers[key] || this.headers[name] || undefined;
    };

    // Underlying stream for collecting output
    const resStream = new PassThrough();

    // Minimal Express-like response object backed by the stream
    const headers = {};
    const originalEnd = resStream.end.bind(resStream);
    const res = Object.assign(resStream, {
      headers,
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = String(v); },
      getHeader(k) { return headers[k.toLowerCase()]; },
      getHeaders() { return headers; },
      removeHeader(k) { delete headers[k.toLowerCase()]; },
      writeHead(status, h) { this.statusCode = status; if (h) Object.assign(headers, h); },
      status(code) { this.statusCode = code; return this; },
      json(obj) { this.setHeader('Content-Type', 'application/json'); const s = JSON.stringify(obj); this.end(s); },
      send(body) { if (typeof body === 'object') return this.json(body); this.end(String(body)); },
      end(chunk) { if (chunk) resStream.write(typeof chunk === 'string' ? chunk : JSON.stringify(chunk)); originalEnd(); },
    });

    let body = '';
    resStream.on('data', (chunk) => { body += chunk.toString(); });
    resStream.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : null;
        resolve(parsed);
      } catch (e) {
        resolve(body);
      }
    });

    // Call the exported function as the emulator would (req, res)
    try {
      fn(req, res);
    } catch (e) {
      reject(e);
    }
  });
}

(async () => {
  try {
    console.log('Calling provisionCompanyImpl directly with fake auth...');
    // Call the implementation directly and simulate an authenticated superadmin
    const impl = fnModule.provisionCompanyImpl || fnModule.provisionCompany;
    if (!impl) throw new Error('provisionCompany implementation not exported');

    const fakeContext = { auth: { uid: 'local_test_user', token: { superadmin: true, email: 'local@local' } } };
    const res = await impl({ companyId: 'testco_local', companyName: 'Test Company Local' }, fakeContext);
    console.log('provisionCompany returned (impl):', res);
    process.exit(0);
  } catch (e) {
    console.error('provisionCompany error:', e);
    process.exit(1);
  }
})();
