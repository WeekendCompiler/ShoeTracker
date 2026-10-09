/* Runs render-blocking in <head>, before first paint:
   1. apply the stored theme,
   2. hide the onboarding block for returning users (it is in the HTML for crawlers),
   3. pick the UI language (app page) or redirect to the page in the chosen language (FAQ, privacy),
   4. capture beforeinstallprompt.
   WARNING: (4) must stay here – on repeat visits Chrome can fire the event before a
   deferred script runs, and a missed event means the app can never be installed. */
(function () {
  try {
    var theme = localStorage.getItem('shoe_tracker_theme');
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.dataset.theme = theme;
    }
  } catch (e) {
    /* ignore: system theme stays active */
  }

  try {
    if (localStorage.getItem('shoe_tracker_onboarded') === '1') {
      document.documentElement.dataset.onboarded = '1';
    }
  } catch (e) {
    /* ignore: better to show onboarding once too often */
  }

  // INFO: The HTML is German; for English the page stays hidden until app.js has
  // translated it, so German never flashes.
  // WARNING: Detection logic must match detectLanguage() in app.js.
  var script = document.currentScript;
  if (!script || !script.hasAttribute('data-app')) {
    staticPageLanguage();
  } else try {
    var lang = localStorage.getItem('shoe_tracker_lang');
    // INFO: Data without a stored language means an install from the German-only era.
    if (lang !== 'de' && lang !== 'en' && localStorage.getItem('shoe_tracker_data') !== null) {
      lang = 'de';
    }
    if (lang !== 'de' && lang !== 'en') {
      var wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
      lang = 'en';
      for (var i = 0; i < wanted.length; i++) {
        var code = String(wanted[i]).slice(0, 2).toLowerCase();
        if (code === 'de' || code === 'en') { lang = code; break; }
      }
    }
    if (lang === 'en') {
      var root = document.documentElement;
      root.lang = 'en';
      root.dataset.i18nPending = '1';
      // INFO: Safety net if app.js fails to load – German content beats a blank page.
      setTimeout(function () { delete root.dataset.i18nPending; }, 1500);
    }
  } catch (e) {
    /* ignore: keep the German HTML */
  }

  // INFO: FAQ and privacy exist as one static page per language (German at the root,
  // English under en/). The app stores its language on first start (detected or
  // chosen), which redirects to the matching version; without a stored language
  // nothing happens, so crawlers get the URL they asked for.
  function staticPageLanguage() {
    try {
      var chosen = localStorage.getItem('shoe_tracker_lang');
      if ((chosen === 'de' || chosen === 'en') && chosen !== document.documentElement.lang) {
        // WARNING: hreflang hrefs are absolute production URLs; data-href is the
        // relative twin so local and preview hosts stay on their own origin.
        var alt = document.querySelector('link[rel="alternate"][hreflang="' + chosen + '"][data-href]');
        if (alt) location.replace(new URL(alt.getAttribute('data-href'), location.href).href + location.hash);
      }
    } catch (e) {
      /* ignore: stay on the requested page */
    }
    // INFO: The language links in the footer store the choice, so the app follows it.
    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[data-lang]');
      if (!link) return;
      try {
        localStorage.setItem('shoe_tracker_lang', link.getAttribute('data-lang'));
      } catch (e) {
        /* ignore: the link still navigates */
      }
    });
  }

  window.__installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    window.__installPrompt = event;
  });
})();
