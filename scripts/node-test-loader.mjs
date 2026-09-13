// Node's --test runner resolves ESM strictly (no bundler-style extension
// guessing), but the app's own source uses extensionless relative imports
// throughout (correct for Vite/tsc's "bundler" moduleResolution — see
// tsconfig.node.json/tsconfig.web.json), so a module under test can import
// a sibling like `./question-frameworks` with no extension. This hook lets
// the test runner resolve those the same way Vite already does, without
// changing any source file's import style for test-tooling's sake.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
    if (isRelative && error?.code === 'ERR_MODULE_NOT_FOUND' && !specifier.endsWith('.ts')) {
      return nextResolve(`${specifier}.ts`, context)
    }
    throw error
  }
}
