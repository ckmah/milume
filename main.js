(() => {
  const buttons = document.querySelectorAll("[data-copy]");
  for (const button of buttons) {
    button.addEventListener("click", async () => {
      const selector = button.getAttribute("data-copy");
      const target = selector ? document.querySelector(selector) : null;
      const text = target?.textContent?.trim() ?? "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        button.dataset.copied = "true";
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.dataset.copied = "false";
          button.textContent = "Copy";
        }, 1600);
      } catch {
        button.textContent = "Select & copy";
      }
    });
  }
})();

// #337: only one thing moves at a time. No autoplay: the user starts the video.
// The field animates until play, freezes in place while the video plays, and
// resumes from that frame on pause or end. Reference wiring for Developer.
(() => {
  const media = document.querySelector(".hero-media");
  const video = media?.querySelector("video");
  const play = media?.querySelector(".hero-media__play");
  if (!media || !video || !play) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const handles = () => window.__milumeHeroHandles || [];
  const setVideoHold = (held) => {
    for (const h of handles()) h.setHeldByVideo?.(held);
  };
  const freeze = () => {
    for (const h of handles()) h.setTime(h.getLoopTime());
    setVideoHold(true);
  };
  const thaw = () => {
    setVideoHold(false);
    if (reduced) return;
    for (const h of handles()) h.resume();
  };
  // Poster + play button until the first play; native controls after that.
  video.controls = false;
  play.hidden = false;
  play.addEventListener("click", () => video.play().catch(() => {}));
  video.addEventListener("play", () => {
    media.dataset.state = "playing";
    video.controls = true;
    freeze();
  });
  video.addEventListener("pause", () => {
    if (video.ended) return;
    media.dataset.state = "paused";
    thaw();
  });
  video.addEventListener("ended", () => {
    media.dataset.state = "idle";
    video.controls = false;
    play.hidden = false;
    thaw();
  });
})();
