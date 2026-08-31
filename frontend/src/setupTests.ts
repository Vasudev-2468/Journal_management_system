// Jest setup file loaded automatically by react-scripts before every test
// module. Back-fills a couple of Node globals that jsdom's older environment
// does not ship on its own, and flips React 18's `act` environment flag so
// asynchronous effects can be flushed cleanly from test bodies.
//
// NOTE — the task spec asks for `import '@testing-library/jest-dom'` here,
// but that package is not installed in this repo's node_modules and the
// task's own guardrail forbids adding new npm packages. The tests below
// therefore avoid the jest-dom matcher surface (they use plain expect + DOM
// queries), and this file omits the import so `react-scripts test` runs
// cleanly out of the box.

import { TextEncoder, TextDecoder } from 'util';

// jsdom (used by Jest) ships without TextEncoder/TextDecoder on older
// Node runtimes. Several transitive dependencies (react-router internals,
// axios URL parsing, JSON-LD schema serialisation in SEO) walk into them,
// so we install the built-in Node polyfills when they're absent. Guarded so
// we never overwrite the platform globals when a newer Node already
// provides them.
if (typeof (globalThis as unknown as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
    (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}
if (typeof (globalThis as unknown as { TextDecoder?: unknown }).TextDecoder === 'undefined') {
    (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}

// React 18's `act` warns loudly unless the test host explicitly claims to
// be an "act environment" — @testing-library/react normally sets this, but
// we do it manually so the vanilla ReactDOM.createRoot path used by our
// tests works without noise.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
