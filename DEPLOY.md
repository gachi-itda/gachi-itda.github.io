# 배포 가이드 — GitHub Pages + clasp (GAS)

정적 HTML은 **GitHub Pages**, API·Sheets 연동은 **Google Apps Script** 로 분리합니다.  
단가 갱신은 `build_prices.ps1` → Sheets 붙여넣기만 하면 되고 **HTML 재업로드는 필요 없습니다.**

---

## 1. 사전 준비

| 항목 | 설명 |
|---|---|
| GitHub 저장소 | `main` 브랜치 |
| Pages | Settings → Pages → Source: **GitHub Actions** |
| Node.js | clasp 설치용 (LTS) |
| Google 계정 | Apps Script + 스프레드시트 소유 |

---

## 2. 프론트 (GitHub Pages)

### 최초 1회

1. 저장소에 push (아래 파일 포함)
   - `index.html`, `platform_v11.html`, `feasibility.html`
   - `config.js`, `.nojekyll`
   - `.github/workflows/pages.yml`
2. GitHub → **Settings → Pages → Build and deployment → GitHub Actions**
3. `main` 에 push 시 자동 배포

### GAS URL 변경

`config.js` 만 수정 후 push:

```javascript
APP_CONFIG.SHEET_URL = 'https://script.google.com/macros/s/새배포ID/exec';
```

HTML 3개 파일을 다시 올릴 필요 없음.

---

## 3. 백엔드 (clasp → GAS)

### 최초 1회

```powershell
npm install
copy .clasp.json.example .clasp.json
# .clasp.json 의 scriptId 를 Apps Script 프로젝트 ID로 변경
# (스크립트 편집기 → 프로젝트 설정 → 스크립트 ID)

npm run gas:push
```

Apps Script 편집기에서 **배포 → 새 배포 → 웹 앱**  
- 실행: 나  
- 액세스: **모든 사용자**

배포 URL을 `config.js` 의 `SHEET_URL` 에 반영 후 push.

### 코드 수정 후 (push + 웹앱 재배포)

```powershell
npm run gas:push          # Code.gs → GAS 업로드
npm run gas:deploy        # 기존 URL 유지하며 버전만 갱신 (@39 …)
```

**`config.js` URL은 바꿀 필요 없습니다** (배포 ID 동일):

```
https://script.google.com/macros/s/AKfycbxNtFJYq6dBtdcPGdSZPBSysoA2ePeYoe3gMNiPBAisVoGqzwAjR4PiiEpI4H0jLizn/exec
```

### 웹앱 404 일 때 (편집기에서 복구 — 권장)

clasp만으로 배포 타입이 API로 바뀌면 URL이 404가 날 수 있습니다. 이때:

1. [Apps Script 편집기](https://script.google.com/d/1Dkpr71GV7umiF9Ck-cLLkSzpVVSEdff7ZlXLOBv3PGP4EuuoTF-GjTdH/edit) 열기
2. **배포 → 배포 관리**
3. 운영 배포(위 URL의 deployment ID) **✏️ 수정**
4. **버전: 새 버전** → **배포**
5. 실행: **나** / 액세스: **모든 사용자** 확인

로컬 `gas/appsscript.json` 에 `webapp` 설정을 넣어 두었으므로, 이후 `npm run gas:push` 시 유지됩니다.

---

## 4. 단가 DB 갱신 (연 2회)

```powershell
# 1) 마스터 편집: data/prices/_seed-2026-H2.tsv 또는 2026-H2.csv
powershell -File scripts\import_master_seed.ps1   # TSV 수정 시
powershell -File scripts\build_prices.ps1

# 2) Google Sheets
#    - 단가DB 탭 ← templates/단가DB.csv 붙여넣기
#    - 적산설정 VERSION ← build_prices.ps1 이 2026-H2 로 갱신됨
```

플랫폼 → **Sheets에서 새로고침** (HTML/GAS 재배포 불필요).

---

## 5. 디렉터리

```
index.html / platform_v11.html / feasibility.html  ← Pages
config.js                                          ← GAS URL (공통)
Code_final.gs                                      ← GAS 소스 (편집용)
gas/Code.gs                                        ← clasp push 대상
data/prices/2026-H2.csv                            ← 단가 마스터
templates/단가DB.csv                               ← Sheets import
scripts/build_prices.ps1                           ← 마스터 → Sheets CSV
```

---

## 6. 스프레드시트 ID

`config.js` → `SPREADSHEET_ID`: `18M8UivS6_RtPwXfgo_IP0pYTCp40u1gMLQivTXDUk4w`  
(GAS는 바인딩된 스프레드시트를 사용 — ID는 문서·참조용)

---

## 7. 트러블슈팅

| 증상 | 확인 |
|---|---|
| CORS / fetch 실패 | GAS 웹앱 액세스 «모든 사용자», URL `config.js` 일치 |
| 단가 안 바뀜 | Sheets `단가DB` 교체 + `적산설정` VERSION |
| clasp push 실패 | `.clasp.json` scriptId, `npm run sync:gas` 후 재시도 |
| Pages 404 | 저장소 Settings → Pages → Actions 사용 중인지 |
