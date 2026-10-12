/**
 * 上善如水 壁量計算WEB
 * ファネルイベント計測 ＆ 行動トラッカー (funnel_tracker.js)
 * 
 * 目的:
 * 1. 無料利用開始、主要機能クリック、プラン選択(週額/月額/年額)のファネル転換率を計測
 * 2. GA4 (gtag) が存在する場合はカスタムイベントとして自動送信
 * 3. ユーザーの直近アクションを保持し、質疑チケット送信時に文脈として自動付与
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'eie_funnel_recent_actions';
  const MAX_RECENT_ACTIONS = 10;

  // 直近アクションの記録
  function logAction(actionName, meta = {}) {
    try {
      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      history.push({
        action: actionName,
        path: window.location.pathname,
        meta: meta,
        timestamp: new Date().toISOString()
      });
      while (history.length > MAX_RECENT_ACTIONS) {
        history.shift();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      // localStorage 無効時などは無視
    }

    // GA4 (gtag) への自動転送
    if (typeof window.gtag === 'function') {
      try {
        window.gtag('event', actionName, meta);
      } catch (e) {
        console.warn('[FunnelTracker] gtag error:', e);
      }
    }
  }

  // グローバル公開API
  window.FunnelTracker = {
    track: function (actionName, meta = {}) {
      logAction(actionName, meta);
    },
    getRecentActions: function () {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      } catch (e) {
        return [];
      }
    }
  };

  // ページ初期化時の自動トラッキング
  document.addEventListener('DOMContentLoaded', () => {
    // 1. ページ訪問イベント
    const currentPath = window.location.pathname;
    let pageType = 'portal_top';
    if (currentPath.includes('/mac/')) pageType = 'cluster_mac';
    else if (currentPath.includes('/jww/')) pageType = 'cluster_jww';
    else if (currentPath.includes('/foundation/')) pageType = 'cluster_foundation';
    else if (currentPath.includes('compare.html')) pageType = 'page_compare';
    else if (currentPath.includes('/evidence/')) pageType = 'cluster_evidence';
    else if (currentPath.includes('/qa/')) pageType = 'cluster_qa';
    else if (currentPath.includes('/enterprise/')) pageType = 'cluster_enterprise';

    window.FunnelTracker.track('funnel_page_view', { page_type: pageType, path: currentPath });

    // 2. data-funnel 属性のクリック自動検知
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-funnel], [data-plan], a[href*="2025.eie.jp"]');
      if (!target) return;

      const funnelName = target.getAttribute('data-funnel');
      const planName = target.getAttribute('data-plan');
      const href = target.getAttribute('href');

      if (planName) {
        // プラン選択クリック
        window.FunnelTracker.track('funnel_plan_click', {
          plan: planName,
          element_text: (target.innerText || '').slice(0, 30).trim()
        });
      } else if (funnelName) {
        // 明示的なファネルイベント
        window.FunnelTracker.track(funnelName, {
          element_text: (target.innerText || '').slice(0, 30).trim()
        });
      } else if (href && href.includes('2025.eie.jp')) {
        // 計算アプリ本体への遷移クリック
        window.FunnelTracker.track('funnel_app_launch', {
          href: href,
          location: target.closest('header') ? 'header' : (target.closest('footer') ? 'footer' : 'body')
        });
      }
    }, { passive: true });
  });
})();
