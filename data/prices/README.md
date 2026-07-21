# data/prices/ 마스터 단가 DB

표준시장단가 **운영용 Single Source of Truth** 입니다.  
Google Sheets `단가DB` 탭·플랫폼 내장 DB는 이 파일에서 **빌드**합니다 (② `build_prices.ps1` 예정).

## 파일

| 파일 | 설명 |
|---|---|
| `schema.json` | 컬럼 정의·타입·연간 갱신 절차 |
| `group-map.json` | `group`(A~P, MAT) → `cat`(가설공사 등) |
| `2026-H2.csv` | 현재 운영 마스터 (약 160품목) |
| `_seed-2026-H2.tsv` | 시트에서 복사한 원본 TSV (편집용) |

## 컬럼 (2026-H2.csv)

```
code, group, subGroup, name, spec, unit, price, laborRate, matExclude, note, version, active, updatedAt
```

- **code** — 국토부 공종코드 (`AA162.30350`) 또는 재료비 코드 (`MAT_REMICON_240`)
- **matExclude** — `TRUE` = 재료비 제외(노무비·경비만), `FALSE` = 재료비 포함
- **version** — `2026-H2` (적산설정 VERSION 과 맞출 것)
- **active** — `Y` / `N`

## 편집 방법

1. Excel/Sheets에서 `_seed-2026-H2.tsv` 를 탭 구분으로 열기
2. 행 추가·단가 수정
3. 빌드:
   ```powershell
   powershell -File scripts\import_master_seed.ps1   # TSV 수정 시
   powershell -File scripts\build_prices.ps1           # Sheets CSV 생성
   ```
4. Google Sheets `단가DB` 탭 ← `templates/단가DB.csv` 붙여넣기
5. `적산설정` 탭 VERSION 확인 (build_prices.ps1 이 자동 갱신)

프론트/GAS URL·배포: 루트 `DEPLOY.md`, `config.js` 참고.

## PDF 반영 (향후)

- `scripts/parse_building_price.ps1` → PDF 초안 CSV
- 마스터와 diff 후 **price / laborRate** 만 선택 갱신 (전체 교체 X)
- `MAT_*` 재료비 행은 시중단가로 별도 관리
