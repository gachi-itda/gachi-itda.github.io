/**
 * 가치잇다 플랫폼 런타임 설정
 * GAS 배포 URL 변경 시 이 파일만 수정하면 HTML 재배포 없이 Pages 새로고침으로 반영됩니다.
 * (HTML은 config.example.js 를 복사해 config.js 로 두고 SHEET_URL 만 맞추면 됩니다.)
 */
(function (global) {
  global.APP_CONFIG = {
    SHEET_URL: 'https://script.google.com/macros/s/AKfycbxNtFJYq6dBtdcPGdSZPBSysoA2ePeYoe3gMNiPBAisVoGqzwAjR4PiiEpI4H0jLizn/exec',
    SPREADSHEET_ID: '18M8UivS6_RtPwXfgo_IP0pYTCp40u1gMLQivTXDUk4w',
    PRICE_VERSION: '2026-H2',
    SITE_NAME: '가치잇다컨설팅'
  };
  global.SHEET_URL = global.APP_CONFIG.SHEET_URL;
})(typeof window !== 'undefined' ? window : this);
