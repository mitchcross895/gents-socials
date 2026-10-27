(function () {
  'use strict';

  const MAX_POST = 500;
  const CATEGORIES = ['General', 'Style', 'Fitness', 'Career', 'Off-topic'];
  const AVATAR_COLORS = ['#9a6b1f', '#2f6f8f', '#5b7f3a', '#8a4b8f', '#b4492f', '#3d4a5c'];
  const PROFILE_BUCKET = 'profile-images';
  const POST_BUCKET = 'post-images';
  const IMAGE_SIZES = { avatar: [400, 400], banner: [1500, 500] }; // profile uploads are cropped to these
  const POST_IMAGE_MAX_SIDE = 1600; // post photos are shrunk to fit, not cropped
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // before resizing
  const TITLES = { posts: 'Posts', forum: 'Forum', profile: 'Profile' };

  const ICONS = {
    heart: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    comment: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    sun: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    moon: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    image: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    close: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
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
  let reloading = null;  // in-flight reload, shared so overlapping calls make one request
  let lastLoadedAt = 0;
  const RELOAD_AFTER_MS = 60 * 1000; // minimum gap between refreshes when returning to the tab
  const pendingLikes = new Set(); // ids of posts/comments with a like request in flight

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
    drafts: {},
    postImage: null,       // File chosen for the post being written
    postImagePreview: ''   // object URL for its preview
  };

  function setPostImage(file) {
    if (ui.postImagePreview) URL.revokeObjectURL(ui.postImagePreview);
    ui.postImage = file;
    ui.postImagePreview = file ? URL.createObjectURL(file) : '';
  }

  async function query(request) {
    const result = await request;
    if (result.error) throw result.error;
    return result.data;
  }

  // Columns fetched for each row type. Inserts and updates ask for the same columns back,
  // so new rows can go straight into state without reloading everything.
  const COLUMNS = {
    profile: 'id, name, handle, bio, color, avatar_path, banner_path',
    post: 'id, author_id, body, image_path, created_at',
    comment: 'id, author_id, body, created_at',
    thread: 'id, author_id, category, title, body, created_at'
  };

  // ---------- Database rows → app objects ----------

  function likerIds(rows) {
    return (rows || []).map(function (l) { return l.user_id; });
  }

  function toEntry(row) {
    return { id: row.id, authorId: row.author_id, text: row.body, createdAt: Date.parse(row.created_at) };
  }

  function toUser(row) {
    return Object.assign(row, { avatarUrl: imageUrl(PROFILE_BUCKET, row.avatar_path), bannerUrl: imageUrl(PROFILE_BUCKET, row.banner_path) });
  }

  function toComment(row) {
    return Object.assign(toEntry(row), { likes: likerIds(row.comment_likes) });
  }

  function toPost(row) {
    return Object.assign(toEntry(row), {
      imagePath: row.image_path,
      imageUrl: imageUrl(POST_BUCKET, row.image_path),
      likes: likerIds(row.post_likes),
      comments: (row.comments || []).map(toComment)
    });
  }

  function toThread(row) {
    return Object.assign(toEntry(row), { category: row.category, title: row.title, replies: (row.replies || []).map(toEntry) });
  }

  async function loadRemoteState() {
    const results = await Promise.all([
      query(sb.from('profiles').select(COLUMNS.profile)),
      query(sb.from('posts')
        .select(COLUMNS.post + ', post_likes(user_id), comments(' + COLUMNS.comment + ', comment_likes(user_id))')
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'comments', ascending: true })
        .limit(200)),
      query(sb.from('threads')
        .select(COLUMNS.thread + ', replies(' + COLUMNS.comment + ')')
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'replies', ascending: true })
        .limit(200))
    ]);

    state = {
      users: Object.fromEntries(results[0].map(function (p) { return [p.id, toUser(p)]; })),
      posts: results[1].map(toPost), // newest first; kept that way as posts are added
      threads: results[2].map(toThread)
    };
    lastLoadedAt = Date.now();
  }

  function imageUrl(bucket, path) {
    return path ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : '';
  }

  // Returns an error message if the file can't be used as an image upload, or '' if it's fine
  function checkImageFile(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return 'Please choose a JPG, PNG or WebP image.';
    if (file.size > MAX_UPLOAD_BYTES) return 'That image is over 10 MB. Please choose a smaller one.';
    return '';
  }

  // Draws an image file onto a canvas laid out by layout(width, height) and re-encodes it as JPEG.
  // Keeps uploads small and drops hidden metadata such as photo GPS location.
  async function processImage(file, layout) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise(function (resolve, reject) {
        const i = new Image();
        i.onload = function () { resolve(i); };
        i.onerror = function () { reject(new Error('That image couldn\'t be read. Try a JPG or PNG.')); };
        i.src = url;
      });
      const box = layout(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = box.width;
      canvas.height = box.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // background for transparent PNGs
      ctx.fillRect(0, 0, box.width, box.height);
      ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, 0, 0, box.width, box.height);
      return await new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('That image couldn\'t be processed.'));
        }, 'image/jpeg', 0.85);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Center-crops to exactly width×height (profile pictures and banners)
  function cropImage(file, width, height) {
    return processImage(file, function (w, h) {
      const scale = Math.max(width / w, height / h);
      const sw = width / scale, sh = height / scale;
      return { width: width, height: height, sx: (w - sw) / 2, sy: (h - sh) / 2, sw: sw, sh: sh };
    });
  }

  // Shrinks so the longest side is at most maxSide, keeping the whole picture (post photos)
  function fitImage(file, maxSide) {
    return processImage(file, function (w, h) {
      const scale = Math.min(1, maxSide / Math.max(w, h));
      return { width: Math.round(w * scale), height: Math.round(h * scale), sx: 0, sy: 0, sw: w, sh: h };
    });
  }

  // Fetches everything fresh. Overlapping calls share one request.
  function reload() {
    if (!reloading) {
      reloading = loadRemoteState()
        .catch(function (err) { ui.error = describeError(err); })
        .finally(function () { reloading = null; loading = false; render(); });
    }
    return reloading;
  }

  async function uploadImage(bucket, path, blob) {
    await query(sb.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
  }

  // Deletes files without waiting; a leftover file is harmless, so failures are ignored
  function removeFiles(bucket, paths) {
    if (paths.length) sb.storage.from(bucket).remove(paths);
  }

  // Each operation writes to the database and then updates the local copy of state to match,
  // so the page doesn't have to reload everything after every action.
  const api = {
    createPost: async function (text, imageFile) {
      let path = null;
      if (imageFile) {
        path = meId + '/' + Date.now() + '.jpg';
        await uploadImage(POST_BUCKET, path, await fitImage(imageFile, POST_IMAGE_MAX_SIDE));
      }
      try {
        const row = await query(sb.from('posts').insert({ body: text, image_path: path }).select(COLUMNS.post).single());
        state.posts.unshift(toPost(row));
      } catch (err) {
        if (path) removeFiles(POST_BUCKET, [path]); // don't leave an orphaned photo
        throw err;
      }
    },
    // table/column name the likes table and its foreign key, e.g. 'post_likes'/'post_id'
    setLiked: function (table, column, id, liked) {
      const match = {};
      match[column] = id;
      if (liked) return query(sb.from(table).insert(match));
      match.user_id = meId;
      return query(sb.from(table).delete().match(match));
    },
    deletePost: async function (post) {
      await query(sb.from('posts').delete().eq('id', post.id));
      state.posts = state.posts.filter(function (p) { return p !== post; });
      if (post.imagePath) removeFiles(POST_BUCKET, [post.imagePath]);
    },
    addComment: async function (post, text) {
      const row = await query(sb.from('comments').insert({ post_id: post.id, body: text }).select(COLUMNS.comment).single());
      post.comments.push(toComment(row));
    },
    createThread: async function (fields) {
      const row = await query(sb.from('threads').insert(fields).select(COLUMNS.thread).single());
      state.threads.unshift(toThread(row));
      return row.id;
    },
    addReply: async function (thread, text) {
      const row = await query(sb.from('replies').insert({ thread_id: thread.id, body: text }).select(COLUMNS.comment).single());
      thread.replies.push(toEntry(row));
    },
    deleteThread: async function (thread) {
      await query(sb.from('threads').delete().eq('id', thread.id));
      state.threads = state.threads.filter(function (t) { return t !== thread; });
    },
    // images: { avatar, banner }, each a File to upload, 'remove', or undefined to keep
    saveProfile: async function (fields, images) {
      const me = getUser(meId);
      const uploaded = [];
      const replaced = [];
      try {
        for (const kind of ['avatar', 'banner']) {
          const image = images[kind];
          const column = kind + '_path';
          if (!image) continue;
          if (me[column]) replaced.push(me[column]);
          if (image === 'remove') {
            fields[column] = null;
          } else {
            const path = meId + '/' + kind + '-' + Date.now() + '.jpg';
            await uploadImage(PROFILE_BUCKET, path, await cropImage(image, IMAGE_SIZES[kind][0], IMAGE_SIZES[kind][1]));
            uploaded.push(path);
            fields[column] = path;
          }
        }
        const row = await query(sb.from('profiles').update(fields).eq('id', meId).select(COLUMNS.profile).single());
        state.users[meId] = toUser(row);
      } catch (err) {
        removeFiles(PROFILE_BUCKET, uploaded); // don't leave orphaned files
        throw err;
      }
      removeFiles(PROFILE_BUCKET, replaced); // old files are no longer referenced
    }
  };

  // Runs a data operation and re-renders. Resolves true on success.
  async function run(task) {
    ui.error = '';
    try {
      await task();
      return true;
    } catch (err) {
      ui.error = describeError(err);
      return false;
    } finally {
      render();
    }
  }

  // Likes show up straight away; if saving fails they're put back and the error shown.
  // Clicks on an item are ignored while its previous like is still saving.
  async function toggleLike(item, table, column) {
    if (!requireSignIn() || pendingLikes.has(item.id)) return;
    const before = item.likes;
    const liked = !before.includes(meId);
    item.likes = liked ? before.concat(meId) : before.filter(function (id) { return id !== meId; });
    ui.error = '';
    pendingLikes.add(item.id);
    render();
    try {
      await api.setLiked(table, column, item.id, liked);
    } catch (err) {
      item.likes = before;
      ui.error = describeError(err);
      render();
    } finally {
      pendingLikes.delete(item.id);
    }
  }

  function describeError(err) {
    if (err && err.code === '23505' && /handle/.test(err.message)) return 'That handle is already taken.';
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

  function findById(list, id) {
    return list.find(function (item) { return item.id === id; });
  }

  // Only known colors go into style attributes
  function safeColor(color, fallback) {
    return AVATAR_COLORS.includes(color) ? color : fallback;
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
    if (user.avatarUrl) {
      return '<img class="avatar avatar-' + (size || 'md') + '" src="' + esc(user.avatarUrl) + '" alt="" loading="lazy">';
    }
    const color = safeColor(user.color, AVATAR_COLORS[5]);
    return '<span class="avatar avatar-' + (size || 'md') + '" style="--avatar:' + color + '" aria-hidden="true">' + esc(initials(user.name)) + '</span>';
  }

  // Avatar that links to the member's profile. Skipped by keyboard and screen readers,
  // since the name beside it is the same link.
  function avatarLink(user, size) {
    return '<a class="avatar-link" href="' + esc(profileHref(user.id)) + '" tabindex="-1" aria-hidden="true">' + avatar(user, size) + '</a>';
  }

  // Your own profile lives at #/profile; everyone else's at #/user/<id>
  function profileHref(id) {
    return meId && id === meId ? '#/profile' : '#/user/' + encodeURIComponent(id);
  }

  function byline(user, ts) {
    const name = '<a class="byline-name" href="' + esc(profileHref(user.id)) + '">' + esc(user.name) + '</a>';
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
    const posts = state.posts; // already newest first
    const composer = meId
      ? '<form class="card composer" data-submit="create-post">' +
          avatar(getUser(meId)) +
          '<div class="composer-main">' +
            '<label class="sr-only" for="composer-text">Write a post</label>' +
            '<textarea id="composer-text" name="text" rows="3" maxlength="' + MAX_POST + '" data-draft="post" data-counter="post-count" placeholder="What\'s on your mind?">' + draft('post') + '</textarea>' +
            (ui.postImagePreview
              ? '<div class="composer-preview"><img src="' + esc(ui.postImagePreview) + '" alt="Selected photo">' +
                  '<button type="button" class="preview-remove" data-action="remove-post-image" aria-label="Remove photo">' + ICONS.close + '</button></div>'
              : '') +
            '<div class="composer-foot">' +
              '<div class="composer-tools">' +
                '<label class="icon-btn composer-photo" title="Add a photo">' + ICONS.image +
                  '<span class="sr-only">Add a photo</span>' +
                  '<input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" data-image-input="post">' +
                '</label>' +
                '<span class="muted small" id="post-count">' + (ui.drafts.post || '').length + '/' + MAX_POST + '</span>' +
              '</div>' +
              '<button class="btn btn-primary" type="submit">Post</button>' +
            '</div>' +
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
      '<header class="post-head">' + avatarLink(author) + byline(author, post.createdAt) +
        (meId && post.authorId === meId ? '<button class="icon-btn" data-action="delete-post" aria-label="Delete post">' + ICONS.trash + '</button>' : '') +
      '</header>' +
      (post.text ? '<p class="post-body">' + esc(post.text) + '</p>' : '') +
      (post.imageUrl
        ? '<a class="post-image" href="' + esc(post.imageUrl) + '" target="_blank" rel="noopener noreferrer">' +
            '<img src="' + esc(post.imageUrl) + '" alt="Photo shared by ' + esc(author.name) + '" loading="lazy"></a>'
        : '') +
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
        return '<div class="comment">' + avatarLink(u, 'sm') +
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
    // The title link stretches over the whole row; the author links sit above it
    return '<div class="thread-row">' +
      avatarLink(author) +
      '<div class="thread-row-main">' +
        '<span class="badge">' + esc(thread.category) + '</span>' +
        '<h3><a class="thread-link" href="#/forum/' + encodeURIComponent(thread.id) + '">' + esc(thread.title) + '</a></h3>' +
        '<span class="muted small"><a class="thread-author" href="' + esc(profileHref(author.id)) + '">' + esc(author.name) + '</a> · active ' + timeAgo(lastActivity(thread)) + '</span>' +
      '</div>' +
      '<div class="thread-row-count"><strong>' + thread.replies.length + '</strong><span class="muted small">' + (thread.replies.length === 1 ? 'reply' : 'replies') + '</span></div>' +
    '</div>';
  }

  function renderThread(route) {
    const thread = findById(state.threads, route.id);
    const back = '<a class="back-link" href="#/forum">' + ICONS.back + '<span>Back to forum</span></a>';
    if (!thread) return back + emptyState('That thread could not be found. It may have been deleted.');

    const author = getUser(thread.authorId);
    const key = 'reply-' + thread.id;

    return back +
      '<article class="card thread" data-thread="' + esc(thread.id) + '">' +
        '<span class="badge">' + esc(thread.category) + '</span>' +
        '<h1 class="thread-title">' + esc(thread.title) + '</h1>' +
        '<header class="post-head">' + avatarLink(author) + byline(author, thread.createdAt) +
          (meId && thread.authorId === meId ? '<button class="icon-btn" data-action="delete-thread" aria-label="Delete thread">' + ICONS.trash + '</button>' : '') +
        '</header>' +
        '<p class="post-body">' + esc(thread.text) + '</p>' +
      '</article>' +
      '<h2 class="section-title">' + plural(thread.replies.length, 'reply', 'replies') + '</h2>' +
      '<div class="stack">' +
        thread.replies.map(function (r) {
          const u = getUser(r.authorId);
          return '<div class="card reply"><header class="post-head">' + avatarLink(u, 'sm') + byline(u, r.createdAt) + '</header><p class="post-body">' + esc(r.text) + '</p></div>';
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
    return profilePage(getUser(meId), true);
  }

  function renderMember(route) {
    if (meId && route.id === meId) return renderProfile();
    const user = state.users[route.id];
    if (!user) return viewHeader('Member') + emptyState('This member couldn\'t be found.');
    return profilePage(user, false);
  }

  // Profile header, stats and the member's posts/threads. isMe adds editing and sign-out.
  function profilePage(user, isMe) {
    function byUser(item) { return item.authorId === user.id; }
    const posts = state.posts.filter(byUser); // both lists are already newest first
    const threads = state.threads.filter(byUser);
    const likes = posts.reduce(function (sum, p) { return sum + p.likes.length; }, 0);
    const color = safeColor(user.color, AVATAR_COLORS[0]);
    const editing = isMe && ui.editingProfile;

    let list;
    if (ui.profileTab === 'posts') {
      list = posts.length
        ? '<div class="stack">' + posts.map(postCard).join('') + '</div>'
        : emptyState(isMe ? 'You haven\'t posted yet. Head to <a href="#/posts">Posts</a> to share something.' : esc(user.name) + ' hasn\'t posted yet.');
    } else {
      list = threads.length
        ? '<div class="card thread-list">' + threads.map(threadRow).join('') + '</div>'
        : emptyState(isMe ? 'You haven\'t started any threads. Visit the <a href="#/forum">Forum</a> to begin one.' : esc(user.name) + ' hasn\'t started any threads yet.');
    }

    const footer = isMe ? '<p class="reset-note"><button class="btn" data-action="sign-out">Sign out</button></p>' : '';

    return viewHeader(isMe ? 'Profile' : 'Member') +
      '<section class="card profile">' +
        '<div class="profile-cover" style="--avatar:' + color + '">' +
          (user.bannerUrl ? '<img src="' + esc(user.bannerUrl) + '" alt="">' : '') +
        '</div>' +
        '<div class="profile-body">' +
          '<div class="profile-top">' + avatar(user, 'xl') +
            (isMe && !editing ? '<button class="btn" data-action="edit-profile">Edit profile</button>' : '') +
          '</div>' +
          (editing ? profileForm(user) :
            '<h2 class="profile-name">' + esc(user.name) + '</h2>' +
            '<p class="muted">@' + esc(user.handle) + '</p>' +
            (user.bio ? '<p class="profile-bio">' + esc(user.bio) + '</p>' : '')) +
          '<dl class="stats">' +
            '<div><dt>Posts</dt><dd>' + posts.length + '</dd></div>' +
            '<div><dt>Threads</dt><dd>' + threads.length + '</dd></div>' +
            '<div><dt>Likes</dt><dd>' + likes + '</dd></div>' +
          '</dl>' +
        '</div>' +
      '</section>' +
      '<div class="tabs" role="tablist">' +
        '<button class="tab" role="tab" data-action="profile-tab" data-tab-name="posts" aria-selected="' + (ui.profileTab === 'posts') + '">' + (isMe ? 'My posts' : 'Posts') + '</button>' +
        '<button class="tab" role="tab" data-action="profile-tab" data-tab-name="threads" aria-selected="' + (ui.profileTab === 'threads') + '">' + (isMe ? 'My threads' : 'Threads') + '</button>' +
      '</div>' +
      list + footer;
  }

  function profileForm(me) {
    return '<form class="form profile-form" data-submit="save-profile">' +
      '<label class="field"><span>Name</span><input name="name" maxlength="40" required value="' + esc(me.name) + '"></label>' +
      '<label class="field"><span>Handle</span><input name="handle" maxlength="20" pattern="[A-Za-z0-9_]+" title="Letters, numbers and underscores only" required value="' + esc(me.handle) + '"></label>' +
      '<label class="field"><span>Bio</span><textarea name="bio" rows="3" maxlength="160">' + esc(me.bio || '') + '</textarea></label>' +
      imageField('avatar', 'Profile picture', 'Square works best. Cropped to fit.', me.avatar_path) +
      imageField('banner', 'Banner', 'Wide images work best (3:1). Cropped to fit.', me.banner_path) +
      '<fieldset class="field"><legend>Color</legend><div class="swatches">' +
        AVATAR_COLORS.map(function (c) {
          return '<label class="swatch" style="--avatar:' + c + '"><input type="radio" name="color" value="' + c + '"' + (c === me.color ? ' checked' : '') + '><span class="sr-only">' + c + '</span></label>';
        }).join('') +
      '</div></fieldset>' +
      '<div class="form-actions"><button class="btn" type="button" data-action="cancel-edit">Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>' +
    '</form>';
  }

  function imageField(kind, label, hint, currentPath) {
    return '<div class="field">' +
      '<label class="field-label" for="image-' + kind + '">' + label + '</label>' +
      '<input id="image-' + kind + '" class="file-input" type="file" name="' + kind + '" accept="image/jpeg,image/png,image/webp">' +
      '<span class="muted small">' + hint + '</span>' +
      (currentPath ? '<label class="check"><input type="checkbox" name="remove_' + kind + '"> Remove current ' + label.toLowerCase() + '</label>' : '') +
    '</div>';
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
              return '<li><a class="member-link" href="' + esc(profileHref(u.id)) + '">' + avatar(u, 'sm') + '<div><strong>' + esc(u.name) + '</strong><span class="muted small">@' + esc(u.handle) + '</span></div></a></li>';
            }).join('') + '</ul>'
          : '<p class="muted small">No other members yet.</p>') +
      '</section>';
  }

  function emptyState(html) {
    return '<div class="empty">' + html + '</div>';
  }

  // ---------- Routing & rendering ----------

  const viewEl = document.getElementById('view');
  const viewBodyEl = document.getElementById('view-body'); // page content; the footer after it stays put
  const asideEl = document.getElementById('aside');
  const titleEl = document.getElementById('topbar-title');
  const navMeEl = document.getElementById('nav-me');

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const name = parts[0] || 'posts';
    if (name === 'forum' && parts[1]) return { name: 'thread', tab: 'forum', id: decodeURIComponent(parts[1]) };
    if (name === 'user' && parts[1]) return { name: 'member', tab: null, id: decodeURIComponent(parts[1]) };
    if (TITLES[name]) return { name: name, tab: name };
    return { name: 'posts', tab: 'posts' };
  }

  const views = { posts: renderPosts, forum: renderForum, thread: renderThread, profile: renderProfile, member: renderMember };

  function render() {
    const route = parseRoute();
    const error = ui.error ? '<p class="notice notice-error" role="alert">' + esc(ui.error) + '</p>' : '';
    let body;
    if (!sb) {
      body = emptyState(window.supabase
        ? "gentcore isn't connected to its database yet. Add the Supabase URL and key to <code>js/config.js</code>."
        : "Couldn't load the Supabase library. Check your connection and refresh the page.");
    } else {
      body = loading ? emptyState('Loading…') : views[route.name](route);
    }
    viewBodyEl.innerHTML = error + body;
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
    let title = TITLES[route.tab];
    if (route.name === 'member') title = state.users[route.id] && route.id !== meId ? state.users[route.id].name : 'Profile';
    titleEl.textContent = title;
    document.title = title + ' · gentcore';
  }

  // ---------- Actions ----------

  function findPost(el) {
    return findById(state.posts, el.closest('[data-post]').dataset.post);
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
      toggleLike(findPost(el), 'post_likes', 'post_id');
    },
    'like-comment': function (el) {
      toggleLike(findById(findPost(el).comments, el.dataset.comment), 'comment_likes', 'comment_id');
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
    'remove-post-image': function () {
      setPostImage(null);
      render();
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
      const thread = findById(state.threads, el.closest('[data-thread]').dataset.thread);
      if (await run(function () { return api.deleteThread(thread); })) location.hash = '#/forum';
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
      const imageFile = ui.postImage;
      if (!text && !imageFile) {
        ui.error = 'Write something or add a photo to post.';
        render();
        return;
      }
      lockForm(form);
      if (imageFile) form.querySelector('[type="submit"]').textContent = 'Posting…';
      if (await run(function () { return api.createPost(text, imageFile); })) {
        delete ui.drafts.post;
        setPostImage(null);
        render();
      }
    },
    'add-comment': async function (form, data) {
      const text = data.get('text').trim();
      const post = findById(state.posts, form.dataset.post);
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
      const thread = findById(state.threads, form.dataset.thread);
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

      const images = {};
      for (const kind of ['avatar', 'banner']) {
        const file = data.get(kind);
        if (file && file.size) {
          const problem = checkImageFile(file);
          if (problem) {
            ui.error = problem;
            render();
            return;
          }
          images[kind] = file;
        } else if (data.get('remove_' + kind)) {
          images[kind] = 'remove';
        }
      }

      lockForm(form);
      form.querySelector('[type="submit"]').textContent = 'Saving…';
      ui.editingProfile = false;
      if (!(await run(function () { return api.saveProfile(fields, images); }))) {
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

  // Photo picked in the post composer: check it and show a preview
  document.addEventListener('change', function (e) {
    const input = e.target;
    if (input.dataset.imageInput !== 'post' || !input.files.length) return;
    const file = input.files[0];
    ui.error = checkImageFile(file);
    if (!ui.error) setPostImage(file);
    render();
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

    // Pick up new posts when someone comes back to the tab, at most once a minute
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !loading && !ui.editingProfile && Date.now() - lastLoadedAt > RELOAD_AFTER_MS) reload();
    });
  }

  render();
  syncThemeControls();
})();
