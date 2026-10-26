(function () {
  'use strict';

  const STORAGE_KEY = 'gents-socials:v1';
  const ME = 'me';
  const MAX_POST = 500;
  const CATEGORIES = ['General', 'Style', 'Fitness', 'Career', 'Off-topic'];
  const AVATAR_COLORS = ['#9a6b1f', '#2f6f8f', '#5b7f3a', '#8a4b8f', '#b4492f', '#3d4a5c'];
  const TITLES = { posts: 'Posts', forum: 'Forum', profile: 'Profile' };

  const ICONS = {
    heart: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    comment: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>'
  };

  // ---------- Storage (browser-only until a database exists) ----------

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.version === 1) return saved;
    } catch (e) { /* storage unavailable or corrupt */ }
    return window.createSeedData();
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  let state = loadState();

  // Transient UI state (not persisted)
  const ui = {
    openComments: new Set(),
    forumCategory: 'All',
    showNewThread: false,
    editingProfile: false,
    profileTab: 'posts',
    drafts: {}
  };

  // ---------- Helpers ----------

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getUser(id) {
    return state.users[id] || { id: id, name: 'Unknown', handle: 'unknown', color: AVATAR_COLORS[5] };
  }

  function timeAgo(ts) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    const d = Math.floor(h / 24);
    if (d < 7) return d + 'd';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase() || '?';
  }

  function avatar(user, size) {
    const color = AVATAR_COLORS.includes(user.color) ? user.color : AVATAR_COLORS[5];
    return '<span class="avatar avatar-' + (size || 'md') + '" style="--avatar:' + color + '" aria-hidden="true">' + esc(initials(user.name)) + '</span>';
  }

  function byline(user, ts) {
    const name = user.id === ME
      ? '<a class="byline-name" href="#/profile">' + esc(user.name) + '</a>'
      : '<span class="byline-name">' + esc(user.name) + '</span>';
    return '<div class="byline">' + name +
      '<span class="muted">@' + esc(user.handle) + ' · ' + timeAgo(ts) + '</span></div>';
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function lastActivity(thread) {
    const last = thread.replies[thread.replies.length - 1];
    return last ? last.createdAt : thread.createdAt;
  }

  function draft(key) {
    return esc(ui.drafts[key] || '');
  }

  // ---------- Views ----------

  function viewHeader(title, extra) {
    return '<header class="view-header"><h1>' + esc(title) + '</h1>' + (extra || '') + '</header>';
  }

  function renderPosts() {
    const me = getUser(ME);
    const posts = state.posts.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });

    return viewHeader('Posts') +
      '<form class="card composer" data-submit="create-post">' +
        avatar(me) +
        '<div class="composer-main">' +
          '<label class="sr-only" for="composer-text">Write a post</label>' +
          '<textarea id="composer-text" name="text" rows="3" maxlength="' + MAX_POST + '" data-draft="post" data-counter="post-count" placeholder="What\'s on your mind?" required>' + draft('post') + '</textarea>' +
          '<div class="composer-foot"><span class="muted small" id="post-count">' + (ui.drafts.post || '').length + '/' + MAX_POST + '</span>' +
          '<button class="btn btn-primary" type="submit">Post</button></div>' +
        '</div>' +
      '</form>' +
      '<div class="stack">' + (posts.length ? posts.map(postCard).join('') : emptyState('No posts yet. Be the first to share something.')) + '</div>';
  }

  function postCard(post) {
    const author = getUser(post.authorId);
    const liked = post.likes.includes(ME);
    const open = ui.openComments.has(post.id);

    return '<article class="card post" data-post="' + esc(post.id) + '">' +
      '<header class="post-head">' + avatar(author) + byline(author, post.createdAt) +
        (post.authorId === ME ? '<button class="icon-btn" data-action="delete-post" aria-label="Delete post">' + ICONS.trash + '</button>' : '') +
      '</header>' +
      '<p class="post-body">' + esc(post.text) + '</p>' +
      '<footer class="post-actions">' +
        '<button class="action' + (liked ? ' liked' : '') + '" data-action="like" aria-pressed="' + liked + '" aria-label="Like">' + ICONS.heart + '<span>' + post.likes.length + '</span></button>' +
        '<button class="action" data-action="toggle-comments" aria-expanded="' + open + '" aria-label="Comments">' + ICONS.comment + '<span>' + post.comments.length + '</span></button>' +
      '</footer>' +
      (open ? commentsSection(post) : '') +
    '</article>';
  }

  function commentsSection(post) {
    const key = 'comment-' + post.id;
    return '<section class="comments">' +
      post.comments.map(function (c) {
        const u = getUser(c.authorId);
        return '<div class="comment">' + avatar(u, 'sm') + '<div class="comment-bubble">' + byline(u, c.createdAt) + '<p>' + esc(c.text) + '</p></div></div>';
      }).join('') +
      '<form class="inline-form" data-submit="add-comment" data-post="' + esc(post.id) + '">' +
        avatar(getUser(ME), 'sm') +
        '<label class="sr-only" for="' + esc(key) + '">Write a comment</label>' +
        '<input id="' + esc(key) + '" name="text" maxlength="300" autocomplete="off" placeholder="Write a comment…" data-draft="' + esc(key) + '" value="' + draft(key) + '" required>' +
        '<button class="btn btn-small" type="submit">Reply</button>' +
      '</form>' +
    '</section>';
  }

  function renderForum() {
    const threads = state.threads
      .filter(function (t) { return ui.forumCategory === 'All' || t.category === ui.forumCategory; })
      .sort(function (a, b) { return lastActivity(b) - lastActivity(a); });

    const newBtn = '<button class="btn btn-primary" data-action="toggle-new-thread" aria-expanded="' + ui.showNewThread + '">' + ICONS.plus + '<span>New thread</span></button>';

    return viewHeader('Forum', newBtn) +
      (ui.showNewThread ? newThreadForm() : '') +
      '<div class="chips" role="group" aria-label="Filter by category">' +
        ['All'].concat(CATEGORIES).map(function (c) {
          return '<button class="chip" data-action="filter-category" data-category="' + esc(c) + '" aria-pressed="' + (ui.forumCategory === c) + '">' + esc(c) + '</button>';
        }).join('') +
      '</div>' +
      '<div class="card thread-list">' +
        (threads.length ? threads.map(threadRow).join('') : emptyState('No threads in this category yet.')) +
      '</div>';
  }

  function newThreadForm() {
    return '<form class="card form" data-submit="create-thread">' +
      '<h2>Start a discussion</h2>' +
      '<label class="field"><span>Title</span><input name="title" maxlength="120" required data-draft="thread-title" value="' + draft('thread-title') + '"></label>' +
      '<label class="field"><span>Category</span><select name="category">' +
        CATEGORIES.map(function (c) { return '<option' + (c === ui.forumCategory ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="field"><span>Message</span><textarea name="body" rows="4" maxlength="2000" required data-draft="thread-body">' + draft('thread-body') + '</textarea></label>' +
      '<div class="form-actions"><button class="btn" type="button" data-action="toggle-new-thread">Cancel</button><button class="btn btn-primary" type="submit">Post thread</button></div>' +
    '</form>';
  }

  function threadRow(thread) {
    const author = getUser(thread.authorId);
    return '<a class="thread-row" href="#/forum/' + encodeURIComponent(thread.id) + '">' +
      avatar(author) +
      '<div class="thread-row-main">' +
        '<span class="badge">' + esc(thread.category) + '</span>' +
        '<h3>' + esc(thread.title) + '</h3>' +
        '<span class="muted small">' + esc(author.name) + ' · active ' + timeAgo(lastActivity(thread)) + '</span>' +
      '</div>' +
      '<div class="thread-row-count"><strong>' + thread.replies.length + '</strong><span class="muted small">' + (thread.replies.length === 1 ? 'reply' : 'replies') + '</span></div>' +
    '</a>';
  }

  function renderThread(route) {
    const thread = state.threads.find(function (t) { return t.id === route.id; });
    const back = '<a class="back-link" href="#/forum">' + ICONS.back + '<span>Back to forum</span></a>';
    if (!thread) return back + emptyState('That thread could not be found. It may have been deleted.');

    const author = getUser(thread.authorId);
    const key = 'reply-' + thread.id;

    return back +
      '<article class="card thread" data-thread="' + esc(thread.id) + '">' +
        '<span class="badge">' + esc(thread.category) + '</span>' +
        '<h1 class="thread-title">' + esc(thread.title) + '</h1>' +
        '<header class="post-head">' + avatar(author) + byline(author, thread.createdAt) +
          (thread.authorId === ME ? '<button class="icon-btn" data-action="delete-thread" aria-label="Delete thread">' + ICONS.trash + '</button>' : '') +
        '</header>' +
        '<p class="post-body">' + esc(thread.body) + '</p>' +
      '</article>' +
      '<h2 class="section-title">' + plural(thread.replies.length, 'reply', 'replies') + '</h2>' +
      '<div class="stack">' +
        thread.replies.map(function (r) {
          const u = getUser(r.authorId);
          return '<div class="card reply"><header class="post-head">' + avatar(u, 'sm') + byline(u, r.createdAt) + '</header><p class="post-body">' + esc(r.text) + '</p></div>';
        }).join('') +
      '</div>' +
      '<form class="card form" data-submit="add-reply" data-thread="' + esc(thread.id) + '">' +
        '<label class="field"><span>Your reply</span><textarea name="text" rows="3" maxlength="2000" required data-draft="' + esc(key) + '">' + draft(key) + '</textarea></label>' +
        '<div class="form-actions"><button class="btn btn-primary" type="submit">Post reply</button></div>' +
      '</form>';
  }

  function renderProfile() {
    const me = getUser(ME);
    const myPosts = state.posts.filter(function (p) { return p.authorId === ME; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    const myThreads = state.threads.filter(function (t) { return t.authorId === ME; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    const likes = myPosts.reduce(function (sum, p) { return sum + p.likes.length; }, 0);
    const joined = new Date(me.joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const color = AVATAR_COLORS.includes(me.color) ? me.color : AVATAR_COLORS[0];

    let list;
    if (ui.profileTab === 'posts') {
      list = myPosts.length ? '<div class="stack">' + myPosts.map(postCard).join('') + '</div>' : emptyState('You haven\'t posted yet. Head to <a href="#/posts">Posts</a> to share something.');
    } else {
      list = myThreads.length ? '<div class="card thread-list">' + myThreads.map(threadRow).join('') + '</div>' : emptyState('You haven\'t started any threads. Visit the <a href="#/forum">Forum</a> to begin one.');
    }

    return viewHeader('Profile') +
      '<section class="card profile">' +
        '<div class="profile-cover" style="--avatar:' + color + '"></div>' +
        '<div class="profile-body">' +
          '<div class="profile-top">' + avatar(me, 'xl') +
            (ui.editingProfile ? '' : '<button class="btn" data-action="edit-profile">Edit profile</button>') +
          '</div>' +
          (ui.editingProfile ? profileForm(me) :
            '<h2 class="profile-name">' + esc(me.name) + '</h2>' +
            '<p class="muted">@' + esc(me.handle) + '</p>' +
            (me.bio ? '<p class="profile-bio">' + esc(me.bio) + '</p>' : '') +
            '<p class="muted small">Joined ' + esc(joined) + '</p>') +
          '<dl class="stats">' +
            '<div><dt>Posts</dt><dd>' + myPosts.length + '</dd></div>' +
            '<div><dt>Threads</dt><dd>' + myThreads.length + '</dd></div>' +
            '<div><dt>Likes</dt><dd>' + likes + '</dd></div>' +
          '</dl>' +
        '</div>' +
      '</section>' +
      '<div class="tabs" role="tablist">' +
        '<button class="tab" role="tab" data-action="profile-tab" data-tab-name="posts" aria-selected="' + (ui.profileTab === 'posts') + '">My posts</button>' +
        '<button class="tab" role="tab" data-action="profile-tab" data-tab-name="threads" aria-selected="' + (ui.profileTab === 'threads') + '">My threads</button>' +
      '</div>' +
      list +
      '<p class="reset-note muted small">Data is saved in this browser only. <button class="link-btn" data-action="reset-data">Reset demo data</button></p>';
  }

  function profileForm(me) {
    return '<form class="form profile-form" data-submit="save-profile">' +
      '<label class="field"><span>Name</span><input name="name" maxlength="40" required value="' + esc(me.name) + '"></label>' +
      '<label class="field"><span>Handle</span><input name="handle" maxlength="20" pattern="[A-Za-z0-9_]+" title="Letters, numbers and underscores only" required value="' + esc(me.handle) + '"></label>' +
      '<label class="field"><span>Bio</span><textarea name="bio" rows="3" maxlength="160">' + esc(me.bio || '') + '</textarea></label>' +
      '<fieldset class="field"><legend>Color</legend><div class="swatches">' +
        AVATAR_COLORS.map(function (c) {
          return '<label class="swatch" style="--avatar:' + c + '"><input type="radio" name="color" value="' + c + '"' + (c === me.color ? ' checked' : '') + '><span class="sr-only">' + c + '</span></label>';
        }).join('') +
      '</div></fieldset>' +
      '<p class="form-error" id="profile-error" role="alert"></p>' +
      '<div class="form-actions"><button class="btn" type="button" data-action="cancel-edit">Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>' +
    '</form>';
  }

  function renderAside() {
    const popular = state.threads.slice().sort(function (a, b) { return b.replies.length - a.replies.length; }).slice(0, 3);
    const members = Object.values(state.users).filter(function (u) { return u.id !== ME; });

    return '<section class="card aside-card"><h2>Popular threads</h2><ol class="aside-list">' +
        popular.map(function (t) {
          return '<li><a href="#/forum/' + encodeURIComponent(t.id) + '">' + esc(t.title) + '</a><span class="muted small">' + esc(t.category) + ' · ' + plural(t.replies.length, 'reply', 'replies') + '</span></li>';
        }).join('') +
      '</ol></section>' +
      '<section class="card aside-card"><h2>Members</h2><ul class="member-list">' +
        members.map(function (u) {
          return '<li>' + avatar(u, 'sm') + '<div><strong>' + esc(u.name) + '</strong><span class="muted small">@' + esc(u.handle) + '</span></div></li>';
        }).join('') +
      '</ul></section>';
  }

  function emptyState(html) {
    return '<div class="empty">' + html + '</div>';
  }

  // ---------- Routing & rendering ----------

  const viewEl = document.getElementById('view');
  const asideEl = document.getElementById('aside');
  const titleEl = document.getElementById('topbar-title');
  const navMeEl = document.getElementById('nav-me');

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const name = parts[0] || 'posts';
    if (name === 'forum' && parts[1]) return { name: 'thread', tab: 'forum', id: decodeURIComponent(parts[1]) };
    if (TITLES[name]) return { name: name, tab: name };
    return { name: 'posts', tab: 'posts' };
  }

  function render() {
    const route = parseRoute();
    const views = { posts: renderPosts, forum: renderForum, thread: renderThread, profile: renderProfile };
    viewEl.innerHTML = views[route.name](route);
    asideEl.innerHTML = renderAside();

    const me = getUser(ME);
    navMeEl.innerHTML = '<a class="nav-me-link" href="#/profile">' + avatar(me, 'sm') + '<div><strong>' + esc(me.name) + '</strong><span class="muted small">@' + esc(me.handle) + '</span></div></a>';

    document.querySelectorAll('[data-tab]').forEach(function (link) {
      if (link.dataset.tab === route.tab) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    titleEl.textContent = TITLES[route.tab];
    document.title = TITLES[route.tab] + ' · Gents Socials';
  }

  function commit() {
    saveState();
    render();
  }

  // ---------- Actions ----------

  function findPost(el) {
    const id = el.closest('[data-post]').dataset.post;
    return state.posts.find(function (p) { return p.id === id; });
  }

  const actions = {
    like: function (el) {
      const post = findPost(el);
      const i = post.likes.indexOf(ME);
      if (i === -1) post.likes.push(ME); else post.likes.splice(i, 1);
      commit();
    },
    'toggle-comments': function (el) {
      const id = findPost(el).id;
      if (ui.openComments.has(id)) ui.openComments.delete(id); else ui.openComments.add(id);
      render();
      if (ui.openComments.has(id)) {
        const input = document.getElementById('comment-' + id);
        if (input) input.focus();
      }
    },
    'delete-post': function (el) {
      if (!confirm('Delete this post?')) return;
      const post = findPost(el);
      state.posts = state.posts.filter(function (p) { return p !== post; });
      commit();
    },
    'toggle-new-thread': function () {
      ui.showNewThread = !ui.showNewThread;
      render();
      if (ui.showNewThread) viewEl.querySelector('[name="title"]').focus();
    },
    'filter-category': function (el) {
      ui.forumCategory = el.dataset.category;
      render();
    },
    'delete-thread': function (el) {
      if (!confirm('Delete this thread and all its replies?')) return;
      const id = el.closest('[data-thread]').dataset.thread;
      state.threads = state.threads.filter(function (t) { return t.id !== id; });
      saveState();
      location.hash = '#/forum';
    },
    'edit-profile': function () {
      ui.editingProfile = true;
      render();
      viewEl.querySelector('[name="name"]').focus();
    },
    'cancel-edit': function () {
      ui.editingProfile = false;
      render();
    },
    'profile-tab': function (el) {
      ui.profileTab = el.dataset.tabName;
      render();
    },
    'reset-data': function () {
      if (!confirm('Reset all posts, threads and your profile to the demo data?')) return;
      state = window.createSeedData();
      ui.drafts = {};
      ui.editingProfile = false;
      commit();
    }
  };

  const submits = {
    'create-post': function (form, data) {
      const text = data.get('text').trim();
      if (!text) return;
      state.posts.push({ id: uid('p'), authorId: ME, text: text, createdAt: Date.now(), likes: [], comments: [] });
      delete ui.drafts.post;
      commit();
    },
    'add-comment': function (form, data) {
      const text = data.get('text').trim();
      const post = state.posts.find(function (p) { return p.id === form.dataset.post; });
      if (!text || !post) return;
      post.comments.push({ id: uid('c'), authorId: ME, text: text, createdAt: Date.now() });
      delete ui.drafts['comment-' + post.id];
      commit();
    },
    'create-thread': function (form, data) {
      const title = data.get('title').trim();
      const body = data.get('body').trim();
      if (!title || !body) return;
      const thread = { id: uid('t'), category: data.get('category'), authorId: ME, title: title, body: body, createdAt: Date.now(), replies: [] };
      state.threads.push(thread);
      delete ui.drafts['thread-title'];
      delete ui.drafts['thread-body'];
      ui.showNewThread = false;
      saveState();
      location.hash = '#/forum/' + encodeURIComponent(thread.id);
    },
    'add-reply': function (form, data) {
      const text = data.get('text').trim();
      const thread = state.threads.find(function (t) { return t.id === form.dataset.thread; });
      if (!text || !thread) return;
      thread.replies.push({ id: uid('r'), authorId: ME, text: text, createdAt: Date.now() });
      delete ui.drafts['reply-' + thread.id];
      commit();
    },
    'save-profile': function (form, data) {
      const name = data.get('name').trim();
      const handle = data.get('handle').trim().toLowerCase();
      const taken = Object.values(state.users).some(function (u) { return u.id !== ME && u.handle === handle; });
      if (taken) {
        form.querySelector('#profile-error').textContent = '@' + handle + ' is already taken.';
        return;
      }
      const me = state.users[ME];
      me.name = name;
      me.handle = handle;
      me.bio = data.get('bio').trim();
      if (AVATAR_COLORS.includes(data.get('color'))) me.color = data.get('color');
      ui.editingProfile = false;
      commit();
    }
  };

  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) {
      e.preventDefault();
      actions[el.dataset.action](el);
    }
  });

  document.addEventListener('submit', function (e) {
    const form = e.target.closest('[data-submit]');
    if (form && submits[form.dataset.submit]) {
      e.preventDefault();
      submits[form.dataset.submit](form, new FormData(form));
    }
  });

  // Keep in-progress text so re-renders (e.g. liking a post) don't wipe it
  document.addEventListener('input', function (e) {
    const el = e.target;
    if (el.dataset.draft) ui.drafts[el.dataset.draft] = el.value;
    if (el.dataset.counter) document.getElementById(el.dataset.counter).textContent = el.value.length + '/' + el.maxLength;
  });

  window.addEventListener('hashchange', function () {
    ui.editingProfile = false;
    render();
    window.scrollTo(0, 0);
    viewEl.focus({ preventScroll: true });
  });

  render();
})();
