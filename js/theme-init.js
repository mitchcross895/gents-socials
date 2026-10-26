// Apply a saved theme before first paint to avoid a flash of the wrong colors.
// Loaded in <head> as its own file so the Content-Security-Policy can block inline scripts.
try {
  var savedTheme = localStorage.getItem('gents-socials:theme');
  if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
} catch (e) {}
