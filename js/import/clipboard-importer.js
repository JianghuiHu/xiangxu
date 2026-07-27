export async function filesFromClipboard(event) {
  const files = [];
  const items = Array.from(event?.clipboardData?.items || []);
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length) return files;
  if (!navigator.clipboard?.read) return [];
  const clipboardItems = await navigator.clipboard.read();
  for (const clipboardItem of clipboardItems) {
    const type = clipboardItem.types.find((candidate) => candidate.startsWith('image/'));
    if (!type) continue;
    const blob = await clipboardItem.getType(type);
    files.push(new File([blob], `clipboard-${Date.now()}.${type.split('/')[1] || 'png'}`, { type }));
  }
  return files;
}
