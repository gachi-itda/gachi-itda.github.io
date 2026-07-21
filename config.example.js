/**
 * config.js 템플릿 — 복사: cp config.example.js config.js
 */
(function (global) {
  global.APP_CONFIG = {
    SHEET_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
    SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
    PRICE_VERSION: '2026-H2',
    SITE_NAME: '가치잇다컨설팅'
  };
  global.SHEET_URL = global.APP_CONFIG.SHEET_URL;
})(typeof window !== 'undefined' ? window : this);
