(() => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const banner = document.querySelector('#updateBanner');
  const message = document.querySelector('#updateMessage');
  const refresh = document.querySelector('#refreshApp');
  const later = document.querySelector('#dismissUpdate');
  let registration, offeredWorker, dismissedWorker, requested = false;
  let hadController = !!navigator.serviceWorker.controller;
  let activationTimer;
  const canRefresh = () => typeof window.stockTakeCanRefresh === 'function' && window.stockTakeCanRefresh();
  function offer(worker) {
    if (!worker || worker === dismissedWorker) return;
    offeredWorker = worker;
    banner.hidden = false;
    message.textContent = 'Refresh to get the latest StockTake improvements.';
  }
  function resetButton() {
    clearTimeout(activationTimer);
    requested = false;
    refresh.disabled = false;
    refresh.textContent = 'Refresh';
  }
  function blocked() {
    resetButton();
    banner.hidden = false;
    message.textContent = 'Some entries could not be saved. Retry saving before refreshing, or copy them for safekeeping.';
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (requested) {
      if (canRefresh()) { clearTimeout(activationTimer); location.reload(); }
      else blocked();
    } else {
      offer(navigator.serviceWorker.controller);
    }
  });
  refresh.addEventListener('click', () => {
    if (!canRefresh()) { blocked(); return; }
    const waiting = registration?.waiting;
    if (!waiting) { location.reload(); return; }
    requested = true;
    refresh.disabled = true;
    refresh.textContent = 'Refreshing…';
    activationTimer = setTimeout(() => {
      resetButton();
      message.textContent = 'The update is taking longer than expected. Tap Refresh to try again.';
    }, 15000);
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  later.addEventListener('click', () => {
    dismissedWorker = offeredWorker;
    banner.hidden = true;
  });
  const check = () => {
    if (!registration || document.visibilityState === 'hidden' || navigator.onLine === false) return;
    registration.update().catch(() => {});
    offer(registration.waiting);
  };
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      const watch = worker => {
        if (!worker) return;
        const changed = () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(registration.waiting || worker);
        };
        worker.addEventListener('statechange', changed);
        changed();
      };
      registration.addEventListener('updatefound', () => watch(registration.installing));
      watch(registration.installing);
      offer(registration.waiting);
      check();
      setInterval(check, 60000);
      window.addEventListener('focus', check);
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', check);
    } catch (_) {
      // Counting remains available when offline or service workers are blocked.
    }
  });
})();
