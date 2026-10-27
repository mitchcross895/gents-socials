(function () {
  'use strict';

  const MAX_POST = 500;
  const CATEGORIES = ['General', 'Style', 'Fitness', 'Career', 'Off-topic'];
  const AVATAR_COLORS = ['#9a6b1f', '#2f6f8f', '#5b7f3a', '#8a4b8f', '#b4492f', '#3d4a5c'];
  const TITLES = { posts: 'Posts', forum: 'Forum', profile: 'Profile' };

  const ICONS = {
    heart: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    comment: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    sun: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    moon: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  };

  // ---------- Theme (light/dark, remembered per browser) ----------

  const THEME_KEY = 'gents-socials:theme';
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    return document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
  }

  function syncThemeControls() {
    const dark = currentTheme() === 'dark';
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(function (btn) {
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.innerHTML = (dark ? ICONS.sun : ICONS.moon) + '<span class="theme-label">' + (dark ? 'Light mode' : 'Dark mode') + '</span>';
    });
    const bg = getComputedStyle(document.body).backgroundColor;
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) { meta.content = bg; });
  }

  darkQuery.addEventListener('change', syncThemeControls);

  // ---------- Data source (Supabase, configured in js/config.js) ----------

  const config = window.GENTS_CONFIG || {};
  const sb = config.supabaseUrl && config.supabaseKey && window.supabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey)
    : null;

  let state = { users: {}, posts: [], threads: [] };
  let meId = null; // signed-in user's id; null when signed out
  let loading = !!sb;

  // Transient UI state (not persisted)
  const ui = {
    openComments: new Set(),
    forumCategory: 'All',
    showNewThread: false,
    editingProfile: false,
    profileTab: 'posts',
    authMode: 'signin',
    authNotice: '',
    error: '',
    drafts: {}
  };

  async function query(request) {
    const result = await request;
    if (result.error) throw result.error;
    return result.data;
  }

  function toEntry(row) {
    return { id: row.id, authorId: row.author_id, text: row.body, createdAt: Date.parse(row.created_at) };
  }

  async function loadRemoteState() {
    const results = await Promise.all([
      query(sb.from('profiles').select('id, name, handle, bio, color')),
      query(sb.from('posts')
        .select('id, author_id, body, created_at, post_likes(user_id), comments(id, author_id, body, created_at, comment_likes(user_id))')
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'comments', ascending: true })
        .limit(200)),
      query(sb.from('threads')
        .select('id, author_id, category, title, body, created_at, replies(id, author_id, body, created_at)')
        .order('created_at', { referencedTable: 'replies', ascending: true }))
    ]);
    const profiles = results[0], posts = results[1], threads = results[2];

    state = {
      users: Object.fromEntries(profiles.map(function (p) { return [p.id, p]; })),
      posts: posts.map(function (p) {
        return Object.assign(toEntry(p), {
          likes: p.post_likes.map(function (l) { return l.user_id; }),
          comments: p.comments.map(function (c) {
            return Object.assign(toEntry(c), { likes: c.comment_likes.map(function (l) { return l.user_id; }) });
          })
        });
      }),
      threads: threads.map(function (t) {
        return { id: t.id, authorId: t.author_id, category: t.category, title: t.title, body: t.body, createdAt: Date.parse(t.created_at), replies: t.replies.map(toEntry) };
      })
    };
  }

  function reload() {
    return loadRemoteState()
      .catch(function (err) { ui.error = describeError(err); })
      .finally(function () { loading = false; render(); });
  }

  const api = {
    createPost: function (text) {
      return query(sb.from('posts').insert({ body: text }));
    },
    toggleLike: function (post) {
      return post.likes.includes(meId)
        ? query(sb.from('post_likes').delete().match({ post_id: post.id, user_id: meId }))
        : query(sb.from('post_likes').insert({ post_id: post.id }));
    },
    toggleCommentLike: function (comment) {
      return comment.likes.includes(meId)
        ? query(sb.from('comment_likes').delete().match({ comment_id: comment.id, user_id: meId }))
        : query(sb.from('comment_likes').insert({ comment_id: comment.id }));
    },
    deletePost: function (post) {
      return query(sb.from('posts').delete().eq('id', post.id));
    },
    addComment: function (post, text) {
      return query(sb.from('comments').insert({ post_id: post.id, body: text }));
    },
    createThread: async function (fields) {
      const row = await query(sb.from('threads').insert(fields).select('id').single());
      return row.id;
    },
    addReply: function (thread, text) {
      return query(sb.from('replies').insert({ thread_id: thread.id, body: text }));
    },
    deleteThread: function (id) {
      return query(sb.from('threads').delete().eq('id', id));
    },
    saveProfile: function (fields) {
      return query(sb.from('profiles').update(fields).eq('id', meId));
    }
  };

  // Runs a data operation, refreshes from the database, and re-renders. Resolves true on success.
  async function run(task) {
    ui.error = '';
    try {
      await task();
      await loadRemoteState();
      return true;
    } catch (err) {
      ui.error = describeError(err);
      return false;
    } finally {
      render();
    }
  }

  function describeError(err) {
    if (err && err.code === '23505') return 'That handle is already taken.';
    return (err && err.message) || 'Something went wrong. Please try again.';
  }

  // ---------- Helpers ----------

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getUser(id) {
    return state.users[id] || { id: id, name: 'Unknown', handle: 'unknown', bio: '', color: AVATAR_COLORS[5] };
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
    const name = meId && user.id === meId
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

  // Sends signed-out visitors to the sign-in form. Returns true if already signed in.
  function requireSignIn() {
    if (meId) return true;
    ui.authMode = 'signin';
    ui.authNotice = 'Sign in to join the conversation.';
    if (location.hash === '#/profile') render(); else location.hash = '#/profile';
    return false;
  }

  // ---------- Views ----------

  function viewHeader(title, extra) {
    return '<header class="view-header"><h1>' + esc(title) + '</h1>' + (extra || '') + '</header>';
  }

  function signInPrompt(message) {
    return '<div class="card signin-prompt"><p>' + esc(message) + '</p><a class="btn btn-primary" href="#/profile">Sign in</a></div>';
  }

  function renderPosts() {
    const posts = state.posts.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    const composer = meId
      ? '<form class="card composer" data-submit="create-post">' +
          avatar(getUser(meId)) +
          '<div class="composer-main">' +
            '<label class="sr-only" for="composer-text">Write a post</label>' +
            '<textarea id="composer-text" name="text" rows="3" maxlength="' + MAX_POST + '" data-draft="post" data-counter="post-count" placeholder="What\'s on your mind?" required>' + draft('post') + '</textarea>' +
            '<div class="composer-foot"><span class="muted small" id="post-count">' + (ui.drafts.post || '').length + '/' + MAX_POST + '</span>' +
            '<button class="btn btn-primary" type="submit">Post</button></div>' +
          '</div>' +
        '</form>'
      : signInPrompt('Sign in to share a post with the community.');

    return viewHeader('Posts') + composer +
      '<div class="stack">' + (posts.length ? posts.map(postCard).join('') : emptyState('No posts yet. Be the first to share something.')) + '</div>';
  }

  function postCard(post) {
    const author = getUser(post.authorId);
    const liked = !!meId && post.likes.includes(meId);
    const open = ui.openComments.has(post.id);

    return '<article class="card post" data-post="' + esc(post.id) + '">' +
      '<header class="post-head">' + avatar(author) + byline(author, post.createdAt) +
        (meId && post.authorId === meId ? '<button class="icon-btn" data-action="delete-post" aria-label="Delete post">' + ICONS.trash + '</button>' : '') +
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
        const liked = !!meId && c.likes.includes(meId);
        return '<div class="comment">' + avatar(u, 'sm') +
          '<div class="comment-main">' +
            '<div class="comment-bubble">' + byline(u, c.createdAt) + '<p>' + esc(c.text) + '</p></div>' +
            '<button class="action action-sm' + (liked ? ' liked' : '') + '" data-action="like-comment" data-comment="' + esc(c.id) + '" aria-pressed="' + liked + '" aria-label="Like comment">' + ICONS.heart + '<span>' + c.likes.length + '</span></button>' +
          '</div>' +
        '</div>';
      }).join('') +
      (meId
        ? '<form class="inline-form" data-submit="add-comment" data-post="' + esc(post.id) + '">' +
            avatar(getUser(meId), 'sm') +
            '<label class="sr-only" for="' + esc(key) + '">Write a comment</label>' +
            '<input id="' + esc(key) + '" name="text" maxlength="300" autocomplete="off" placeholder="Write a comment…" data-draft="' + esc(key) + '" value="' + draft(key) + '" required>' +
            '<button class="btn btn-small" type="submit">Reply</button>' +
          '</form>'
        : '<p class="muted small"><a href="#/profile">Sign in</a> to comment.</p>') +
    '</section>';
  }

  function renderForum() {
    const threads = state.threads
      .filter(function (t) { return ui.forumCategory === 'All' || t.category === ui.forumCategory; })
      .sort(function (a, b) { return lastActivity(b) - lastActivity(a); });

    const newBtn = '<button class="btn btn-primary" data-action="toggle-new-thread" aria-expanded="' + ui.showNewThread + '">' + ICONS.plus + '<span>New thread</span></button>';

    return viewHeader('Forum', newBtn) +
      (ui.showNewThread && meId ? newThreadForm() : '') +
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
          (meId && thread.authorId === meId ? '<button class="icon-btn" data-action="delete-thread" aria-label="Delete thread">' + ICONS.trash + '</button>' : '') +
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
      (meId
        ? '<form class="card form" data-submit="add-reply" data-thread="' + esc(thread.id) + '">' +
            '<label class="field"><span>Your reply</span><textarea name="text" rows="3" maxlength="2000" required data-draft="' + esc(key) + '">' + draft(key) + '</textarea></label>' +
            '<div class="form-actions"><button class="btn btn-primary" type="submit">Post reply</button></div>' +
          '</form>'
        : signInPrompt('Sign in to reply to this thread.'));
  }

  function renderProfile() {
    if (!meId) return renderAuth();

    const me = getUser(meId);
    const myPosts = state.posts.filter(function (p) { return p.authorId === meId; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    const myThreads = state.threads.filter(function (t) { return t.authorId === meId; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    const likes = myPosts.reduce(function (sum, p) { return sum + p.likes.length; }, 0);
    const color = AVATAR_COLORS.includes(me.color) ? me.color : AVATAR_COLORS[0];

    let list;
    if (ui.profileTab === 'posts') {
      list = myPosts.length ? '<div class="stack">' + myPosts.map(postCard).join('') + '</div>' : emptyState('You haven\'t posted yet. Head to <a href="#/posts">Posts</a> to share something.');
    } else {
      list = myThreads.length ? '<div class="card thread-list">' + myThreads.map(threadRow).join('') + '</div>' : emptyState('You haven\'t started any threads. Visit the <a href="#/forum">Forum</a> to begin one.');
    }

    const footer = '<p class="reset-note"><button class="btn" data-action="sign-out">Sign out</button></p>';

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
            (me.bio ? '<p class="profile-bio">' + esc(me.bio) + '</p>' : '')) +
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
      list + footer;
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
      '<div class="form-actions"><button class="btn" type="button" data-action="cancel-edit">Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>' +
    '</form>';
  }

  function renderAuth() {
    const signup = ui.authMode === 'signup';
    return viewHeader('Profile') +
      '<form class="card form auth-form" data-submit="' + (signup ? 'sign-up' : 'sign-in') + '">' +
        '<h2>' + (signup ? 'Create your account' : 'Sign in') + '</h2>' +
        '<p class="muted">' + (signup ? 'Join to post, comment and start forum threads.' : 'Welcome back. Sign in to post and reply.') + '</p>' +
        (ui.authNotice ? '<p class="notice">' + esc(ui.authNotice) + '</p>' : '') +
        (signup
          ? '<label class="field"><span>Name</span><input name="name" maxlength="40" autocomplete="name" required></label>' +
            '<label class="field"><span>Handle</span><input name="handle" maxlength="15" pattern="[A-Za-z0-9_]+" title="Letters, numbers and underscores only" autocomplete="username" required></label>'
          : '') +
        '<label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>' +
        '<label class="field"><span>Password</span><input name="password" type="password" minlength="6" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" required></label>' +
        '<div class="form-actions"><button class="btn btn-primary" type="submit">' + (signup ? 'Create account' : 'Sign in') + '</button></div>' +
        '<p class="small muted auth-switch">' + (signup ? 'Already have an account? ' : 'New here? ') +
          '<button type="button" class="link-btn" data-action="auth-mode" data-mode="' + (signup ? 'signin' : 'signup') + '">' + (signup ? 'Sign in' : 'Create an account') + '</button></p>' +
      '</form>';
  }

  function renderAside() {
    const popular = state.threads.slice().sort(function (a, b) { return b.replies.length - a.replies.length; }).slice(0, 3);
    const members = Object.values(state.users).filter(function (u) { return u.id !== meId; });

    return '<section class="card aside-card"><h2>Popular threads</h2>' +
        (popular.length
          ? '<ol class="aside-list">' + popular.map(function (t) {
              return '<li><a href="#/forum/' + encodeURIComponent(t.id) + '">' + esc(t.title) + '</a><span class="muted small">' + esc(t.category) + ' · ' + plural(t.replies.length, 'reply', 'replies') + '</span></li>';
            }).join('') + '</ol>'
          : '<p class="muted small">No threads yet.</p>') +
      '</section>' +
      '<section class="card aside-card"><h2>Members</h2>' +
        (members.length
          ? '<ul class="member-list">' + members.map(function (u) {
              return '<li>' + avatar(u, 'sm') + '<div><strong>' + esc(u.name) + '</strong><span class="muted small">@' + esc(u.handle) + '</span></div></li>';
            }).join('') + '</ul>'
          : '<p class="muted small">No other members yet.</p>') +
      '</section>';
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
    const error = ui.error ? '<p class="notice notice-error" role="alert">' + esc(ui.error) + '</p>' : '';
    let body;
    if (!sb) {
      body = emptyState(window.supabase
        ? "gentcore isn't connected to its database yet. Add the Supabase URL and key to <code>js/config.js</code>."
        : "Couldn't load the Supabase library. Check your connection and refresh the page.");
    } else {
      body = loading ? emptyState('Loading…') : views[route.name](route);
    }
    viewEl.innerHTML = error + body;
    asideEl.innerHTML = loading || !sb ? '' : renderAside();

    if (!sb) {
      navMeEl.innerHTML = '';
    } else if (meId) {
      const me = getUser(meId);
      navMeEl.innerHTML = '<a class="nav-me-link" href="#/profile">' + avatar(me, 'sm') + '<div><strong>' + esc(me.name) + '</strong><span class="muted small">@' + esc(me.handle) + '</span></div></a>';
    } else {
      navMeEl.innerHTML = loading ? '' : '<a class="btn btn-primary nav-signin" href="#/profile">Sign in</a>';
    }

    document.querySelectorAll('[data-tab]').forEach(function (link) {
      if (link.dataset.tab === route.tab) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    titleEl.textContent = TITLES[route.tab];
    document.title = TITLES[route.tab] + ' · gentcore';
  }

  // ---------- Actions ----------

  function findPost(el) {
    const id = el.closest('[data-post]').dataset.post;
    return state.posts.find(function (p) { return p.id === id; });
  }

  function lockForm(form) {
    form.querySelectorAll('button, input, textarea, select').forEach(function (el) { el.disabled = true; });
  }

  const actions = {
    'toggle-theme': function () {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      syncThemeControls();
    },
    like: function (el) {
      if (!requireSignIn()) return;
      const post = findPost(el);
      el.disabled = true;
      run(function () { return api.toggleLike(post); });
    },
    'like-comment': function (el) {
      if (!requireSignIn()) return;
      const comment = findPost(el).comments.find(function (c) { return c.id === el.dataset.comment; });
      el.disabled = true;
      run(function () { return api.toggleCommentLike(comment); });
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
      run(function () { return api.deletePost(post); });
    },
    'toggle-new-thread': function () {
      if (!requireSignIn()) return;
      ui.showNewThread = !ui.showNewThread;
      render();
      if (ui.showNewThread) viewEl.querySelector('[name="title"]').focus();
    },
    'filter-category': function (el) {
      ui.forumCategory = el.dataset.category;
      render();
    },
    'delete-thread': async function (el) {
      if (!confirm('Delete this thread and all its replies?')) return;
      const id = el.closest('[data-thread]').dataset.thread;
      if (await run(function () { return api.deleteThread(id); })) location.hash = '#/forum';
    },
    'edit-profile': function () {
      ui.editingProfile = true;
      render();
      viewEl.querySelector('[name="name"]').focus();
    },
    'cancel-edit': function () {
      ui.editingProfile = false;
      ui.error = '';
      render();
    },
    'profile-tab': function (el) {
      ui.profileTab = el.dataset.tabName;
      render();
    },
    'auth-mode': function (el) {
      ui.authMode = el.dataset.mode;
      ui.authNotice = '';
      ui.error = '';
      render();
    },
    'sign-out': async function () {
      await sb.auth.signOut();
    }
  };

  const submits = {
    'create-post': async function (form, data) {
      const text = data.get('text').trim();
      if (!text) return;
      lockForm(form);
      if (await run(function () { return api.createPost(text); })) {
        delete ui.drafts.post;
        render();
      }
    },
    'add-comment': async function (form, data) {
      const text = data.get('text').trim();
      const post = state.posts.find(function (p) { return p.id === form.dataset.post; });
      if (!text || !post) return;
      lockForm(form);
      if (await run(function () { return api.addComment(post, text); })) {
        delete ui.drafts['comment-' + post.id];
        render();
      }
    },
    'create-thread': async function (form, data) {
      const fields = { category: data.get('category'), title: data.get('title').trim(), body: data.get('body').trim() };
      if (!fields.title || !fields.body) return;
      lockForm(form);
      let id;
      if (await run(async function () { id = await api.createThread(fields); })) {
        delete ui.drafts['thread-title'];
        delete ui.drafts['thread-body'];
        ui.showNewThread = false;
        location.hash = '#/forum/' + encodeURIComponent(id);
      }
    },
    'add-reply': async function (form, data) {
      const text = data.get('text').trim();
      const thread = state.threads.find(function (t) { return t.id === form.dataset.thread; });
      if (!text || !thread) return;
      lockForm(form);
      if (await run(function () { return api.addReply(thread, text); })) {
        delete ui.drafts['reply-' + thread.id];
        render();
      }
    },
    'save-profile': async function (form, data) {
      const fields = {
        name: data.get('name').trim(),
        handle: data.get('handle').trim().toLowerCase(),
        bio: data.get('bio').trim()
      };
      if (AVATAR_COLORS.includes(data.get('color'))) fields.color = data.get('color');
      ui.editingProfile = false;
      if (!(await run(function () { return api.saveProfile(fields); }))) {
        ui.editingProfile = true; // keep the form open so the error can be fixed
        render();
      }
    },
    'sign-in': async function (form, data) {
      lockForm(form);
      const result = await sb.auth.signInWithPassword({ email: data.get('email'), password: data.get('password') });
      if (result.error) {
        ui.error = result.error.message;
        render();
      }
      // On success, onAuthStateChange loads the signed-in view
    },
    'sign-up': async function (form, data) {
      lockForm(form);
      const result = await sb.auth.signUp({
        email: data.get('email'),
        password: data.get('password'),
        options: {
          data: { name: data.get('name').trim(), handle: data.get('handle').trim().toLowerCase() },
          emailRedirectTo: location.origin + location.pathname
        }
      });
      if (result.error) {
        ui.error = result.error.message;
      } else if (!result.data.session) {
        ui.error = '';
        ui.authMode = 'signin';
        ui.authNotice = 'Almost there! Check your email for a confirmation link, then sign in.';
      }
      render();
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
    ui.error = '';
    render();
    window.scrollTo(0, 0);
    viewEl.focus({ preventScroll: true });
  });

  if (sb) {
    sb.auth.onAuthStateChange(function (event, session) {
      const id = session ? session.user.id : null;
      if (!loading && id === meId) return; // e.g. token refresh
      meId = id;
      ui.editingProfile = false;
      ui.error = '';
      if (id) ui.authNotice = '';
      // Defer: calling Supabase from inside this callback can deadlock
      setTimeout(reload, 0);
    });

    // Pick up new posts when someone comes back to the tab
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !loading && !ui.editingProfile) reload();
    });
  }

  render();
  syncThemeControls();
})();
