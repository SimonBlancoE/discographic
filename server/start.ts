const sourceServerEntry = new URL('../../server/index.js', import.meta.url);

await import(sourceServerEntry.href);
