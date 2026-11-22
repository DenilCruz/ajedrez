import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const Module = require('node:module') as {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options: unknown,
  ) => string;
};

const webReactDir = path.resolve(
  import.meta.dirname,
  '../../node_modules/react',
);

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown,
): string {
  if (request === 'react' || request.startsWith('react/')) {
    const subpath =
      request === 'react' ? 'index.js' : `${request.slice('react/'.length)}.js`;
    return path.join(webReactDir, subpath);
  }
  return originalResolve.call(this, request, parent, isMain, options);
};
