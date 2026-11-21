export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(
      new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href,
      context,
    );
  }
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.(?:[cm]?js|mjs|json|ts|tsx)$/.test(specifier);
  if (isRelative && !hasExtension && context.parentURL) {
    return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
}
