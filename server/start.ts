const runtimeServerEntry = new URL('../../server/index.js', import.meta.url);

await import(runtimeServerEntry.href);
