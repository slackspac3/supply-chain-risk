'use strict';

const AdminDocumentLibrarySection = (() => {
  function renderRoute() {
    if (!requireAdmin()) return;
    const docList = getDocList();
    setPage(adminLayout('docs', `
      ${UI.adminSectionHeader({
        title: 'Document Library',
        description: 'Maintain the internal references used for AI retrieval, citation chips, and richer scenario grounding.',
        actions: `<button class="btn btn--ghost btn--sm" id="btn-reset-docs">Reset Defaults</button><button class="btn btn--secondary btn--sm" id="btn-reindex">Re-index Library</button><button class="btn btn--primary" id="btn-add-doc">Add Document</button>`
      })}
      <div class="admin-overview-grid mb-6">
        <div class="admin-overview-card">
          <div class="admin-overview-label">Indexed documents</div>
          <div class="admin-overview-value">${docList.length}</div>
          <div class="admin-overview-foot">Available for AI retrieval and citation.</div>
        </div>
        <div class="admin-overview-card">
          <div class="admin-overview-label">Updated this year</div>
          <div class="admin-overview-value">${docList.filter(doc => String(doc.lastUpdated || '').startsWith(String(new Date().getFullYear()))).length}</div>
          <div class="admin-overview-foot">Helpful for checking how fresh the library is.</div>
        </div>
        <div class="admin-overview-card">
          <div class="admin-overview-label">Most common use</div>
          <div class="admin-overview-value">AI grounding</div>
          <div class="admin-overview-foot">Used in scenario drafting, citations, and richer context generation.</div>
        </div>
      </div>
      ${UI.adminTableCard({
        title: 'Documents in the library',
        description: 'Keep titles, tags, and update dates current so the AI can choose better supporting references.',
        table: `<table class="data-table">
            <thead><tr><th>Document</th><th>Tags</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody>${docList.map(doc => `<tr>
              <td><strong style="color:var(--text-primary);font-size:.875rem">${doc.title}</strong><br><span style="font-size:.68rem;color:var(--text-muted)">${doc.id}</span></td>
              <td>${(doc.tags || []).slice(0, 3).map(t => `<span class="badge badge--primary" style="font-size:.6rem;margin:2px">${t}</span>`).join('')}</td>
              <td style="font-size:.8rem;white-space:nowrap">${doc.lastUpdated || '—'}</td>
              <td><button class="btn btn--ghost btn--sm" data-id="${doc.id}" id="edit-doc-${doc.id}">Edit</button> <button class="btn btn--ghost btn--sm" data-id="${doc.id}" id="del-doc-${doc.id}" style="color:var(--color-danger-400)">Delete</button></td>
            </tr>`).join('')}</tbody>
          </table>`
      })}`));

    document.getElementById('btn-admin-logout').addEventListener('click', () => { performLogout(); });
    document.getElementById('btn-reindex').addEventListener('click', () => { RAGService.init(getDocList(), getBUList()); UI.toast('Index rebuilt.', 'success'); });
    document.getElementById('btn-reset-docs').addEventListener('click', async () => {
      if (await UI.confirm('Reset docs to defaults?')) {
        localStorage.removeItem('rq_doc_override');
        AppState.docList = await loadJSON('./data/docs.json');
        RAGService.init(AppState.docList, getBUList());
        Router.resolve();
        UI.toast('Reset to defaults.', 'success');
      }
    });
    document.getElementById('btn-add-doc').addEventListener('click', () => openEditor(null));
    docList.forEach(doc => {
      document.getElementById(`edit-doc-${doc.id}`)?.addEventListener('click', () => openEditor(doc));
      document.getElementById(`del-doc-${doc.id}`)?.addEventListener('click', async () => {
        if (await UI.confirm(`Delete "${doc.title}"?`)) {
          saveDocList(getDocList().filter(d => d.id !== doc.id));
          Router.resolve();
          UI.toast('Deleted.', 'success');
        }
      });
    });
  }

  function openEditor(doc) {
    const isNew = !doc;
    let tiTags;
    const m = UI.modal({
      title: isNew ? 'Add Document' : `Edit: ${doc.title}`,
      body: `<form id="doc-form">
        <div class="form-group"><label class="form-label">ID</label><input class="form-input" id="doc-id" value="${doc?.id || ''}" ${!isNew ? 'readonly' : ''}></div>
        <div class="form-group mt-3"><label class="form-label">Title</label><input class="form-input" id="doc-title" value="${doc?.title || ''}"></div>
        <div class="form-group mt-3"><label class="form-label">URL</label><input class="form-input" id="doc-url" type="url" value="${doc?.url || '#/admin/docs'}" placeholder="https://…"></div>
        <div class="form-group mt-3"><label class="form-label">Last Updated</label><input class="form-input" id="doc-updated" type="date" value="${doc?.lastUpdated || ''}"></div>
        <div class="form-group mt-3"><label class="form-label">Tags</label><div class="tag-input-wrap" id="ti-doc-tags"></div></div>
        <div class="form-group mt-3"><label class="form-label">Content Excerpt</label><textarea class="form-textarea" id="doc-excerpt" rows="4">${doc?.contentExcerpt || ''}</textarea></div>
      </form>`,
      footer: `<button class="btn btn--ghost" id="doc-cancel">Cancel</button><button class="btn btn--primary" id="doc-save">Save</button>`
    });
    requestAnimationFrame(() => { tiTags = UI.tagInput('ti-doc-tags', doc?.tags || []); });
    document.getElementById('doc-cancel').addEventListener('click', () => m.close());
    document.getElementById('doc-save').addEventListener('click', () => {
      const id = document.getElementById('doc-id').value.trim();
      const title = document.getElementById('doc-title').value.trim();
      if (!id || !title) { UI.toast('ID and Title required.', 'warning'); return; }
      const updated = {
        id,
        title,
        url: document.getElementById('doc-url').value || '#',
        tags: tiTags.getTags(),
        lastUpdated: document.getElementById('doc-updated').value,
        contentExcerpt: document.getElementById('doc-excerpt').value
      };
      const list = getDocList();
      const idx = list.findIndex(d => d.id === id);
      if (idx > -1) list[idx] = updated; else list.push(updated);
      saveDocList(list);
      m.close();
      Router.resolve();
      UI.toast(`Doc "${title}" ${isNew ? 'added' : 'updated'}.`, 'success');
    });
  }

  return { renderRoute, openEditor };
})();
