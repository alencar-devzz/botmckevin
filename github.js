const GH = {
  token: '', base: 'https://api.github.com',
  async req(path, opts = {}) {
    const r = await fetch(this.base + path, { ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' } });
    if (!r.ok) { let m = r.statusText; try { m = (await r.json()).message } catch {} throw new Error(r.status + ' ' + m) }
    return r.status === 204 ? null : r.json();
  },
  user() { return this.req('/user') },
  repos() { return this.req('/user/repos?per_page=100&sort=pushed') },
  branches(o, r) { return this.req(`/repos/${o}/${r}/branches?per_page=100`) },
  tree(o, r, b) { return this.req(`/repos/${o}/${r}/git/trees/${encodeURIComponent(b)}?recursive=1`) },
  // Um unico commit com todos os arquivos (Git Data API)
  async commit(o, r, b, files, message, onProgress) {
    const p = `/repos/${o}/${r}/git`;
    const ref = await this.req(`${p}/ref/heads/${encodeURIComponent(b)}`);
    const parent = await this.req(`${p}/commits/${ref.object.sha}`);
    const tree = []; let i = 0;
    for (const f of files) {
      const blob = await this.req(`${p}/blobs`, { method: 'POST', body: JSON.stringify({ content: await f.b64(), encoding: 'base64' }) });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      onProgress(++i, files.length, f.path);
    }
    const t = await this.req(`${p}/trees`, { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
    const c = await this.req(`${p}/commits`, { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [ref.object.sha] }) });
    await this.req(`${p}/refs/heads/${encodeURIComponent(b)}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
    return c;
  },
  commits(o, r, b) { return this.req(`/repos/${o}/${r}/commits?sha=${encodeURIComponent(b)}&per_page=30`) },
  file(o, r, p, b) { return this.req(`/repos/${o}/${r}/contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(b)}`) },
  async remove(o, r, b, paths, message) {
    const p = `/repos/${o}/${r}/git`;
    const ref = await this.req(`${p}/ref/heads/${encodeURIComponent(b)}`);
    const parent = await this.req(`${p}/commits/${ref.object.sha}`);
    const t = await this.req(`${p}/trees`, { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree: paths.map(x => ({ path: x, mode: '100644', type: 'blob', sha: null })) }) });
    const c = await this.req(`${p}/commits`, { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [ref.object.sha] }) });
    await this.req(`${p}/refs/heads/${encodeURIComponent(b)}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
    return c;
  }
};
