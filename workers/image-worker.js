self.addEventListener('message', async (event) => {
  const { id, type, files } = event.data || {};
  if (type !== 'hash-files') return;
  try {
    const hashes = [];
    for (const file of files) {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      hashes.push([...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''));
    }
    self.postMessage({ id, hashes });
  } catch (error) { self.postMessage({ id, error: error.message }); }
});
