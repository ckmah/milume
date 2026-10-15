// "Tools & modes" loops: pick the dark/light source that matches the docs theme,
// and never autoplay under prefers-reduced-motion (poster only).
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  function theme() {
    var scheme = document.body && document.body.getAttribute("data-md-color-scheme");
    return scheme === "default" ? "light" : "dark";
  }

  function apply() {
    var t = theme();
    document.querySelectorAll("video.ml-loop[data-src]").forEach(function (v) {
      var base = v.getAttribute("data-src");
      if (v.getAttribute("data-theme") === t) return;
      v.setAttribute("data-theme", t);
      v.poster = base + "." + t + ".poster.webp";
      v.innerHTML =
        '<source src="' + base + "." + t + '.webm" type="video/webm">' +
        '<source src="' + base + "." + t + '.mp4" type="video/mp4">';
      var poster = v.parentNode.querySelector("img.ml-loop-poster");
      if (poster) poster.src = v.poster;
      if (reduce.matches) {
        v.removeAttribute("autoplay");
        v.preload = "none";
        v.pause();
        return;
      }
      v.load();
      var played = v.play();
      if (played && played.catch) played.catch(function () {});
    });
  }

  function init() {
    apply();
    if (window.__mlToolsObserver) return;
    window.__mlToolsObserver = new MutationObserver(apply);
    window.__mlToolsObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-md-color-scheme"],
    });
  }

  if (typeof window.document$ !== "undefined" && window.document$.subscribe) {
    window.document$.subscribe(init);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
