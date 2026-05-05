// 防 clickjacking：若頁面被嵌入 iframe，自動跳出至頂層
// 取代無法在 <meta> CSP 生效的 frame-ancestors 指令
(function () {
  if (window.top !== window.self) {
    try {
      window.top.location = window.self.location;
    } catch (e) {
      // 跨域被擋時，至少把當前頁清空避免被點選
      document.documentElement.innerHTML = '';
    }
  }
})();
