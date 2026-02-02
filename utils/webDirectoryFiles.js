/**
 * Web helpers for selecting/dropping folders.
 *
 * Output is a flat list of { file, relativePath } where relativePath includes
 * folder segments (e.g. "MyFolder/Sub/file.pdf").
 */

function safeText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function joinRelPath(a, b) {
  const left = safeText(a).replace(/^\/+/, '').replace(/\/+$/, '');
  const right = safeText(b).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

export function filesFromFileList(fileList) {
  const list = Array.from(fileList || []);
  return list
    .map((file) => {
      const rel = safeText(file?.webkitRelativePath) || safeText(file?.name);
      return { file, relativePath: rel.replace(/^\/+/, '') };
    })
    .filter((x) => x?.file);
}

function readEntriesBatch(reader) {
  return new Promise((resolve, reject) => {
    try {
      reader.readEntries(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

function fileFromFileEntry(fileEntry) {
  return new Promise((resolve, reject) => {
    try {
      fileEntry.file(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

async function walkEntry(entry, prefix) {
  if (!entry) return [];

  if (entry.isFile) {
    const file = await fileFromFileEntry(entry);
    const relativePath = joinRelPath(prefix, entry.name);
    return [{ file, relativePath }];
  }

  if (entry.isDirectory) {
    const dirPrefix = joinRelPath(prefix, entry.name);
    const reader = entry.createReader();
    const out = [];

    // readEntries returns up to 100 entries per call; repeat until empty.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await readEntriesBatch(reader);
      if (!Array.isArray(batch) || batch.length === 0) break;
      // Depth-first traversal
      for (const child of batch) {
        // eslint-disable-next-line no-await-in-loop
        out.push(...(await walkEntry(child, dirPrefix)));
      }
    }

    return out;
  }

  return [];
}

export async function filesFromDataTransfer(dataTransfer) {
  const dt = dataTransfer;
  if (!dt) return [];

  const items = Array.from(dt.items || []);
  const hasEntries = items.some((it) => typeof it?.webkitGetAsEntry === 'function');

  if (!hasEntries) {
    return filesFromFileList(dt.files || []);
  }

  const out = [];

  for (const it of items) {
    const getEntry = it?.webkitGetAsEntry;
    const entry = typeof getEntry === 'function' ? getEntry.call(it) : null;

    if (entry) {
      // eslint-disable-next-line no-await-in-loop
      out.push(...(await walkEntry(entry, '')));
      continue;
    }

    const file = typeof it?.getAsFile === 'function' ? it.getAsFile() : null;
    if (file) {
      out.push({ file, relativePath: safeText(file?.name) });
    }
  }

  return out.filter((x) => x?.file);
}
