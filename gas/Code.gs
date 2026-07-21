// ════════════════════════════════════════════════════════════════
// 가치잇다컨설팅 — Google Apps Script 통합 완전판
// 시트 ID : 18M8UivS6_RtPwXfgo_IP0pYTCp40u1gMLQivTXDUk4w
// 배포방법 : 확장프로그램 → Apps Script → 배포 → 웹 앱
//            실행 계정 : 본인, 액세스 : 모든 사용자
// 수정일   : 2026-05-03
// ════════════════════════════════════════════════════════════════

// ── 관리자 이메일 (알림 수신)
var ADMIN_EMAIL = '7707fire@gmail.com';

// ── 구글 드라이브 견적 폴더 ID
var PARENT_FOLDER_ID = '1rFb2Jwd14wJZckSt7wRAB5s7NCzeiUWZ';


// ════════════════════════════════════════════════════════════════
// doGet : 모든 요청 진입점
// ════════════════════════════════════════════════════════════════
function doGet(e) {
  var type = e && e.parameter && e.parameter.type;

  // ── 협력업체 가입신청 (type 없이 company 파라미터로 판단)
  if (e && e.parameter && e.parameter.company && !type) {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var data = {};
    for (var key in e.parameter) { data[key] = e.parameter[key]; }
    if (data.regions) {
      try { data.regions = JSON.parse(data.regions); }
      catch(ex) { data.regions = [data.regions]; }
    }
    handleContractorJoin(ss, data);
    return jsonResponse({ status: 'success' });
  }

  // ── 구글 드라이브 폴더 생성
  if (type === 'create_folder') {
    var reqId      = e.parameter.reqId      || '';
    var clientName = e.parameter.clientName || '';
    var folderName = reqId + (clientName ? '_' + clientName : '');
    try {
      var parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
      var existing = parentFolder.getFoldersByName(folderName);
      var folder   = existing.hasNext() ? existing.next()
                                        : parentFolder.createFolder(folderName);
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return jsonResponse({ status: 'success', folderUrl: folder.getUrl(), folderId: folder.getId() });
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.toString() });
    }
  }

  // ── 관리자 견적 항목 저장
  if (type === 'save_aq_items') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ws = getOrCreate(ss, '견적항목', ['저장일시','접수번호','항목JSON','시방','제출기한','공사시기','파일링크']);
    ws.appendRow([
      e.parameter.savedAt  || '',
      e.parameter.reqId    || '',
      e.parameter.items    || '',
      e.parameter.spec     || '',
      e.parameter.deadline || '',
      e.parameter.schedule || '',
      e.parameter.fileLink || ''
    ]);
    return jsonResponse({ status: 'success' });
  }

  // ── 협력업체 견적 제출
  if (type === 'quote_submit') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 비교표 시트에 단가 반영
    var targetSheet = null;
    var ws = ss.getSheetByName('견적신청');
    if (ws) {
      var rows = ws.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === String(e.parameter.reqId).trim()) {
          var sheets = ss.getSheets();
          for (var j = 0; j < sheets.length; j++) {
            if (sheets[j].getName().indexOf(rows[i][0]) === 0) {
              targetSheet = sheets[j]; break;
            }
          }
          break;
        }
      }
    }

    // 견적 제출 내역 시트에 저장
    var submitWs = getOrCreate(ss, '견적제출', ['제출일시','접수번호','업체명','견적총액','VAT포함총액','상세내용']);
    submitWs.appendRow([
      e.parameter.submittedAt || '',
      e.parameter.reqId       || '',
      e.parameter.company     || '',
      e.parameter.total       || '',
      e.parameter.totalVat    || '',
      e.parameter.detail      || ''
    ]);

    // 비교표 시트 단가 업데이트
    if (targetSheet) {
      try {
        var detail  = JSON.parse(e.parameter.detail || '{}');
        var company = e.parameter.company || '';
        var allRows = targetSheet.getDataRange().getValues();
        var companyCol = -1;
        for (var c = 1; c < allRows[14].length; c++) {
          if (String(allRows[14][c]).trim() === company) { companyCol = c + 1; break; }
        }
        if (companyCol > 0) {
          for (var row = 16; row <= allRows.length; row++) {
            var label = String(allRows[row-1][0]).replace(' *','').trim();
            if (detail[label]) targetSheet.getRange(row, companyCol).setValue(detail[label]);
          }
        }
      } catch(e2) {}
    }

    // 관리자 알림
    try {
      MailApp.sendEmail(ADMIN_EMAIL,
        '[가치잇다] 견적 제출 — ' + e.parameter.company + ' / ' + e.parameter.reqId,
        e.parameter.company + '에서 견적을 제출했습니다.\n총액: ' + e.parameter.total + '\n접수번호: ' + e.parameter.reqId
      );
    } catch(e3) {}

    return jsonResponse({ status: 'success' });
  }

  // ── 고객 견적 조회
  if (type === 'quote_check') {
    var reqId = e.parameter.reqId || '';
    if (!reqId) return jsonResponse({ status: 'not_found' });
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var reqWs = ss.getSheetByName('견적신청');
    if (!reqWs) return jsonResponse({ status: 'not_found' });
    var reqRows = reqWs.getDataRange().getValues();
    var reqData = null;
    for (var i = 1; i < reqRows.length; i++) {
      if (String(reqRows[i][0]).trim() === reqId.trim()) {
        reqData = {
          id:         reqRows[i][0],
          createdAt:  reqRows[i][1],
          category:   reqRows[i][2],
          typeName:   reqRows[i][3],
          area:       reqRows[i][4],
          addr:       reqRows[i][5],
          budget:     reqRows[i][6],
          clientName: reqRows[i][7],
          status:     reqRows[i][9],
          assigned:   reqRows[i][10]
        };
        break;
      }
    }
    if (!reqData) return jsonResponse({ status: 'not_found' });

    var quoteWs = ss.getSheetByName('견적제출');
    var quotes  = [];
    if (quoteWs) {
      var qRows = quoteWs.getDataRange().getValues();
      for (var j = 1; j < qRows.length; j++) {
        if (String(qRows[j][1]).trim() === reqId.trim()) {
          quotes.push({
            company:     qRows[j][2],
            total:       qRows[j][3],
            totalVat:    qRows[j][4],
            submittedAt: qRows[j][0],
            detail:      qRows[j][5]
          });
        }
      }
    }
    return jsonResponse({ status: 'ok', req: reqData, quotes: quotes });
  }

  // ── 고객 견적신청 (GET 방식)
  if (type === 'client_request') {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var data = {
      id:        e.parameter.id        || '',
      createdAt: e.parameter.createdAt || '',
      category:  e.parameter.category  || '',
      typeName:  e.parameter.typeName  || '',
      areaMeta:  { m2: e.parameter.area || '' },
      addr:      e.parameter.addr      || '',
      budget:    e.parameter.budget    || '',
      client: {
        name:  e.parameter.clientName  || '',
        phone: e.parameter.clientPhone || ''
      }
    };
    handleClientRequest(ss, data);
    return jsonResponse({ status: 'success' });
  }

  // ── 협력업체 배정
  if (type === 'assign') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ws = ss.getSheetByName('견적신청');
    if (ws) {
      var rows = ws.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === String(e.parameter.reqId).trim()) {
          ws.getRange(i+1, 10).setValue('진행중');
          ws.getRange(i+1, 11).setValue(e.parameter.assigned   || '');
          ws.getRange(i+1, 12).setValue(e.parameter.assignedAt || '');
          ws.getRange(i+1, 13).setValue(e.parameter.memo       || '');
          createQuoteSheet({
            id:          rows[i][0],
            category:    rows[i][2],
            clientName:  rows[i][7],
            clientPhone: rows[i][8],
            addr:        rows[i][5],
            area:        rows[i][4],
            budget:      rows[i][6],
            createdAt:   rows[i][1],
            assigned:    e.parameter.assigned || ''
          });
          break;
        }
      }
    }
    return jsonResponse({ status: 'success' });
  }

  // ── 공사비 계산기 상담신청
  if (type === 'calc_consult') {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var data = {};
    for (var key in e.parameter) { data[key] = e.parameter[key]; }
    handleCalcConsult(ss, data);
    return jsonResponse({ status: 'success' });
  }

  // ── 사례 갤러리
  if (type === 'gallery') {
    var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('사례갤러리');
    if (!ws) return jsonResponse({ cases: [] });
    var rows  = ws.getDataRange().getValues();
    var cases = [];
    for (var i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      cases.push({ title: rows[i][0], tag: rows[i][1], desc: rows[i][2], link: rows[i][3] });
    }
    return jsonResponse({ cases: cases });
  }

  // ── 관리자용 — 협력업체 전체 목록 (상태 무관)
  if (type === 'allpartners') {
    var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('업체가입');
    if (!ws) return jsonResponse({ partners: [] });
    var rows     = ws.getDataRange().getValues();
    var partners = [];
    for (var i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      partners.push({
        id:           rows[i][0],
        appliedAt:    rows[i][1],
        company:      rows[i][2],
        ceo:          rows[i][3],
        companyPhone: rows[i][4],
        phone:        rows[i][5],
        type:         rows[i][6],
        regions:      rows[i][7],
        loginId:      rows[i][8],
        status:       rows[i][9],
        loginPw:      rows[i][10] || '',
        address:      rows[i][11] || ''
      });
    }
    return jsonResponse({ partners: partners });
  }

  // ── 홈페이지용 — 승인된 협력업체만
  if (type === 'partners') {
    var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('업체가입');
    if (!ws) return jsonResponse({ partners: [] });
    var rows     = ws.getDataRange().getValues();
    var partners = [];
    for (var i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      var status = rows[i][9] ? rows[i][9].toString().trim() : '';
      if (status !== '승인') continue;
      partners.push({
        id:           rows[i][0],
        company:      rows[i][2],
        ceo:          rows[i][3],
        companyPhone: rows[i][4],
        phone:        rows[i][5],
        type:         rows[i][6],
        regions:      rows[i][7],
        address:      rows[i][11] || ''
      });
    }
    return jsonResponse({ partners: partners });
  }

  // ── 관리자용 — 상담 신청 목록
  if (type === 'consults') {
    var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('상담신청');
    if (!ws) return jsonResponse({ consults: [] });
    var rows     = ws.getDataRange().getValues();
    var consults = [];
    for (var i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      consults.push({
        id:        rows[i][0],
        createdAt: rows[i][1],
        name:      rows[i][2],
        phone:     rows[i][3],
        total:     rows[i][4],
        summary:   rows[i][5],
        note:      rows[i][6]
      });
    }
    return jsonResponse({ consults: consults });
  }

  // ── 게시판 글 읽기
  if (type === 'board_read') {
    return getBoardPosts(e.parameter.board || 'free');
  }

  // ── 게시판 글 쓰기
  if (type === 'board_write') {
    return handleBoardWrite(e.parameter);
  }

  // ── 공사비 산출서 저장 (협력업체)
  if (type === 'est_save') {
    return handleEstSave(e.parameter);
  }

  // ── 사업수지표 리드 저장 (feasibility.html 진입 정보)
  if (type === 'lead_save') {
    return handleLeadSave(e.parameter);
  }

  // ── feasibility.html 잠금 (feasibility_lock → lead_save 위임)
  if (type === 'feasibility_lock') {
    return handleLeadSave({
      name:     e.parameter.name  || '',
      phone:    e.parameter.phone || '',
      interest: e.parameter.interest || '',
      agree:    'Y',
      dt:       new Date().toLocaleString('ko-KR')
    });
  }

  // ── 적산 단가DB 조회 (platform 공종별 물량 적산)
  if (type === 'unit_prices') {
    return getUnitPricesResponse(e.parameter);
  }

  // ── 적산 설정만 조회 (BASE_M2 등)
  if (type === 'est_config') {
    return jsonResponse({ config: readEstConfig(SpreadsheetApp.getActiveSpreadsheet()) });
  }

  // ════════════════════════════════════════════════════════════════
  // ── 아이디 찾기 (회사명 + 전화번호 일치 시 아이디 반환)
  // ════════════════════════════════════════════════════════════════
  if (type === 'find_id') {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var ws  = ss.getSheetByName('업체가입');
    if (!ws) return jsonResponse({ status: 'not_found' });
    var rows = ws.getDataRange().getValues();
    var inputPhone = (e.parameter.phone || '').replace(/[^0-9]/g, '');
    var inputCompany = (e.parameter.company || '').trim();
    for (var i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      var rowPhone   = String(rows[i][5] || '').replace(/[^0-9]/g, '');
      var rowCompany = String(rows[i][2] || '').trim();
      if (rowCompany === inputCompany && rowPhone === inputPhone) {
        return jsonResponse({ status: 'ok', loginId: rows[i][8] });
      }
    }
    return jsonResponse({ status: 'not_found', msg: '일치하는 업체 정보가 없습니다.' });
  }

  // ════════════════════════════════════════════════════════════════
  // ── 비밀번호 찾기 (아이디 + 전화번호 확인 → 임시 비밀번호 발급)
  // ════════════════════════════════════════════════════════════════
  if (type === 'reset_pw') {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var ws  = ss.getSheetByName('업체가입');
    if (!ws) return jsonResponse({ status: 'not_found' });
    var rows = ws.getDataRange().getValues();
    var inputPhone = (e.parameter.phone || '').replace(/[^0-9]/g, '');
    var inputId    = (e.parameter.loginId || '').trim();
    for (var i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      var rowPhone = String(rows[i][5] || '').replace(/[^0-9]/g, '');
      var rowId    = String(rows[i][8] || '').trim();
      if (rowId === inputId && rowPhone === inputPhone) {
        // 임시 비밀번호 생성 (영문+숫자 8자리)
        var chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var tempPw = '';
        for (var k = 0; k < 8; k++) {
          tempPw += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        // 시트 K열(비밀번호, 11번째) 업데이트
        ws.getRange(i + 1, 11).setValue(tempPw);
        // 관리자에게 임시 비밀번호 알림
        try {
          MailApp.sendEmail(ADMIN_EMAIL,
            '[가치잇다] 임시 비밀번호 발급 — ' + rows[i][2],
            '업체명: ' + rows[i][2] + '\n' +
            '아이디: ' + rowId + '\n' +
            '임시 비밀번호: ' + tempPw + '\n' +
            '연락처: ' + rows[i][5]
          );
        } catch(mailErr) {}
        return jsonResponse({ status: 'ok', tempPw: tempPw, company: rows[i][2] });
      }
    }
    return jsonResponse({ status: 'not_found', msg: '아이디 또는 전화번호가 일치하지 않습니다.' });
  }

  // ════════════════════════════════════════════════════════════════
  // ── 비밀번호 변경 (현재 PW 확인 후 새 PW로 업데이트)
  // ════════════════════════════════════════════════════════════════
  if (type === 'change_pw') {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var ws  = ss.getSheetByName('업체가입');
    if (!ws) return jsonResponse({ status: 'error', msg: '시트를 찾을 수 없습니다.' });
    var rows    = ws.getDataRange().getValues();
    var inputId = (e.parameter.loginId || '').trim();
    var oldPw   = (e.parameter.oldPw || '').trim();
    var newPw   = (e.parameter.newPw || '').trim();
    if (!newPw || newPw.length < 4) {
      return jsonResponse({ status: 'error', msg: '새 비밀번호는 4자 이상이어야 합니다.' });
    }
    for (var i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      var rowId = String(rows[i][8] || '').trim();
      var rowPw = String(rows[i][10] || '').trim();
      if (rowId === inputId && rowPw === oldPw) {
        ws.getRange(i + 1, 11).setValue(newPw);
        return jsonResponse({ status: 'ok' });
      }
    }
    return jsonResponse({ status: 'fail', msg: '현재 비밀번호가 올바르지 않습니다.' });
  }


  return jsonResponse({ status: 'ok' });
}


// ════════════════════════════════════════════════════════════════
// doPost
// ════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var raw  = e.postData.contents;
    var data;
    try { data = JSON.parse(raw); }
    catch(e1) { data = JSON.parse(e.parameter.data || raw); }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (data.type === 'client_request')  handleClientRequest(ss, data);
    if (data.type === 'contractor_join') handleContractorJoin(ss, data);
    if (data.type === 'calc_consult')    handleCalcConsult(ss, data);

    return jsonResponse({ status: 'success' });
  } catch(err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}


// ════════════════════════════════════════════════════════════════
// 고객 견적신청 저장
// 시트탭: 견적신청
// ════════════════════════════════════════════════════════════════
function handleClientRequest(ss, data) {
  var ws = getOrCreate(ss, '견적신청',
    ['접수번호','접수일시','분류','공간','면적','주소','예산','고객명','연락처','상태','배정업체','배정일시','배정메모','이메일']);

  function fmtPhone(p) {
    p = (p||'').toString().replace(/[^0-9]/g,'');
    if (p.length===11) return p.slice(0,3)+'-'+p.slice(3,7)+'-'+p.slice(7);
    if (p.length===10) return p.slice(0,3)+'-'+p.slice(3,6)+'-'+p.slice(6);
    return p;
  }
  var phone = fmtPhone(data.client ? data.client.phone : (data.clientPhone||''));

  ws.appendRow([
    data.id        || '',
    data.createdAt || '',
    data.category  || '',
    data.typeName  || '',
    data.areaMeta  ? data.areaMeta.m2 : (data.area||''),
    data.addr      || '',
    data.budget    || '',
    data.client    ? data.client.name  : (data.clientName||''),
    phone,
    '신규접수',
    '', '', '',
    data.client    ? (data.client.email||'') : (data.clientEmail||'')
  ]);

  var clientEmail = data.client ? (data.client.email||'') : (data.clientEmail||'');
  var clientName  = data.client ? (data.client.name||'')  : (data.clientName||'');
  var catNames    = { design:'설계', construction:'시공', interior:'인테리어', repair:'집수리', realestate:'부동산개발', landpermit:'토지분석·인허가' };
  var catName     = catNames[data.category] || data.category || '';

  if (clientEmail) {
    try {
      MailApp.sendEmail(clientEmail,
        '[가치잇다컨설팅] 견적 신청 접수 완료 — ' + (data.id||''),
        clientName + '님, 안녕하세요.\n'
        + '가치잇다컨설팅 견적 신청이 정상 접수되었습니다.\n\n'
        + '■ 접수번호: ' + (data.id||'') + '\n'
        + '■ 서비스: '   + catName + '\n'
        + '■ 접수일시: ' + (data.createdAt||'') + '\n\n'
        + '접수번호를 보관해두시면 견적 결과 조회 시 사용하실 수 있습니다.\n\n'
        + '1~2 영업일 내 담당자가 연락드리겠습니다.\n\n'
        + '문의: 041-668-3124\n가치잇다컨설팅 드림'
      );
    } catch(e) {}
  }

  try {
    MailApp.sendEmail(ADMIN_EMAIL,
      '[가치잇다] 견적신청 — ' + (data.id||'') + ' / ' + catName,
      (data.client ? data.client.name : data.clientName) + ' / '
      + (data.client ? data.client.phone : data.clientPhone)
    );
  } catch(e) {}
}


// ════════════════════════════════════════════════════════════════
// 협력업체 가입신청 저장
// 시트탭: 업체가입
// 컬럼: A=접수번호 B=신청일 C=회사명 D=대표자 E=연락처
//        F=업종코드 G=활동지역 H=아이디 I=상태 J=비밀번호 K=주소
// ════════════════════════════════════════════════════════════════
function handleContractorJoin(ss, data) {
  var ws = getOrCreate(ss, '업체가입',
    ['접수번호','신청일','회사명','대표자','업체연락처','연락처','업종코드','활동지역','아이디','상태','비밀번호','주소']);

  var phone = (data.phone||'').toString().replace(/[^0-9]/g,'');
  if (phone.length===11) phone = phone.slice(0,3)+'-'+phone.slice(3,7)+'-'+phone.slice(7);
  else if (phone.length===10) phone = phone.slice(0,3)+'-'+phone.slice(3,6)+'-'+phone.slice(6);

  ws.appendRow([
    data.id           || '',
    data.appliedAt    || '',
    data.company      || '',
    data.ceo          || '',
    data.companyPhone || '',
    phone,
    data.joinType  || data.type || '',
    Array.isArray(data.regions) ? data.regions.join(', ') : (data.regions||''),
    data.loginId   || '',
    '검토중',
    data.loginPw   || '',
    data.addr      || ''
  ]);

  try {
    MailApp.sendEmail(ADMIN_EMAIL,
      '[가치잇다] 업체가입 — ' + data.company,
      data.company + '\n업체연락처: ' + (data.companyPhone||'') + '\n담당자연락처: ' + phone + '\n아이디: ' + (data.loginId||'') + '\n업종: ' + (data.joinType||data.type||'')
    );
  } catch(e) {}
}


// ════════════════════════════════════════════════════════════════
// 공사비 계산기 상담신청 저장
// 시트탭: 상담신청
// ════════════════════════════════════════════════════════════════
function handleCalcConsult(ss, data) {
  var ws = getOrCreate(ss, '상담신청',
    ['접수번호','신청일시','성함','연락처','산출금액','입력조건','문의내용']);
  ws.appendRow([
    data.id        || '',
    data.createdAt || '',
    data.name      || '',
    data.phone     || '',
    data.total     || '',
    data.summary   || '',
    data.note      || ''
  ]);
  try {
    MailApp.sendEmail(ADMIN_EMAIL,
      '[가치잇다] 상담신청 — ' + data.name,
      data.name + ' / ' + data.phone + ' / ' + data.total
    );
  } catch(e) {}
}


// ════════════════════════════════════════════════════════════════
// 게시판 글 읽기
// 시트탭: 게시판_자유 / 게시판_자료
// 컬럼: A=ID B=분류 C=제목 D=작성자 E=내용 F=날짜 G=조회수
// ════════════════════════════════════════════════════════════════
function getBoardPosts(boardType) {
  try {
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var tabName = boardType === 'info' ? '게시판_자료' : '게시판_자유';
    var sh      = ss.getSheetByName(tabName);
    if (!sh) return jsonResponse({ posts: [] });

    var data  = sh.getDataRange().getValues();
    var posts = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!String(row[0]||'').trim()) continue;
      posts.push({
        id:     Number(row[0]) || i,
        cat:    String(row[1]  || '일반'),
        title:  String(row[2]  || ''),
        author: String(row[3]  || '익명'),
        body:   String(row[4]  || ''),
        date:   String(row[5]  || ''),
        views:  Number(row[6]) || 0
      });
    }
    return jsonResponse({ posts: posts });
  } catch(e) {
    return jsonResponse({ posts: [], error: e.message });
  }
}


// ════════════════════════════════════════════════════════════════
// 게시판 글 쓰기
// ════════════════════════════════════════════════════════════════
function handleBoardWrite(p) {
  try {
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var tabName = p.board === 'info' ? '게시판_자료' : '게시판_자유';
    var sh      = getOrCreate(ss, tabName, ['ID','분류','제목','작성자','내용','날짜','조회수']);
    var newId   = sh.getLastRow();
    sh.appendRow([newId, p.cat||'일반', p.title||'', p.author||'익명', p.body||'', p.date||'', 0]);
    return jsonResponse({ ok: true, id: newId });
  } catch(e) {
    return jsonResponse({ ok: false, error: e.message });
  }
}


// ════════════════════════════════════════════════════════════════
// 공사비 산출서 저장
// 시트탭: 공사비산출서
// 컬럼: A=산출ID B=저장일시 C=업체명 D=프로젝트명 E=고객명
//        F=건물용도 G=연면적 H=위치 I=견적일 J=공사비합계
//        K=부가세 L=총액 M=재료비합계 N=노무비합계 O=항목JSON
// ════════════════════════════════════════════════════════════════
function handleEstSave(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = getOrCreate(ss, '공사비산출서', [
      '산출ID','저장일시','업체명','프로젝트명','고객명',
      '건물용도','연면적(㎡)','위치','견적일',
      '공사비합계','부가세','총액(VAT포함)','재료비합계','노무비합계',
      '항목내역JSON'
    ]);
    sh.appendRow([
      p.estId    || '',
      p.savedAt  || '',
      p.company  || '',
      p.projName || '',
      p.client   || '',
      p.use      || '',
      p.area     || '',
      p.loc      || '',
      p.date     || '',
      Number(p.sub)      || 0,
      Number(p.vat)      || 0,
      Number(p.total)    || 0,
      Number(p.matTotal) || 0,
      Number(p.labTotal) || 0,
      p.items    || ''
    ]);
    return jsonResponse({ ok: true });
  } catch(e) {
    return jsonResponse({ ok: false, error: e.message });
  }
}


// ════════════════════════════════════════════════════════════════
// 사업수지표 리드 저장
// 시트탭: 사업수지표_리드
// 컬럼: A=수집일시 B=성명 C=연락처 D=관심유형 E=개인정보동의
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// 적산 단가DB — Sheets 탭: 단가DB / 재료비율 / 적산설정
// Apps Script 편집기에서 setupUnitPriceSheets() 1회 실행 후
// templates/ 단가DB.csv 를 시트에 붙여넣기
// ════════════════════════════════════════════════════════════════

var UNIT_DB_HEADERS = ['id','version','cat','spec','unit','price','region_factor','active','note'];
var UNIT_RATIO_HEADERS = ['cat','mat','lab','exp','note'];
var EST_CONFIG_HEADERS = ['key','value','note'];

function setupUnitPriceSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreate(ss, '단가DB', UNIT_DB_HEADERS);
  getOrCreate(ss, '재료비율', UNIT_RATIO_HEADERS);
  var cfg = getOrCreate(ss, '적산설정', EST_CONFIG_HEADERS);
  if (cfg.getLastRow() <= 1) {
    cfg.appendRow(['VERSION', '2026-H1', '현재 적용 버전']);
    cfg.appendRow(['BASE_M2', '230', '공사비계산기 기준 ㎡당 만원']);
    cfg.appendRow(['REGION_DEFAULT', '1.0', '기본 지역계수']);
    cfg.appendRow(['REGION_SEOSAN', '1.03', '서산시 지역 보정']);
    cfg.appendRow(['SOURCE_NOTE', '국토교통부 표준시장단가', '출처']);
  }
  SpreadsheetApp.getUi().alert('단가DB 시트 준비 완료.\ntemplates/단가DB.csv 붙여넣기 또는 seedUnitPriceDb() 실행');
}

/**
 * platform 내장 DB(147품목)를 단가DB 시트에 입력.
 * 최초 1회: setUnitPricesJsonProperty() 실행 → 브라우저 콘솔 JSON 붙여넣기
 * 이후: seedUnitPriceDb() 실행
 */
function setUnitPricesJsonProperty() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(
    '단가 JSON 입력',
    'platform_v11.html 콘솔에서 copy(JSON.stringify(EST_BUILTIN_DB_FALLBACK)) 한 결과를 붙여넣으세요.',
    ui.ButtonSet.OK_CANCEL
  );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var text = (r.getResponseText() || '').trim();
  if (!text) { ui.alert('JSON이 비어 있습니다.'); return; }
  try { JSON.parse(text); } catch (e) { ui.alert('JSON 형식 오류: ' + e.message); return; }
  PropertiesService.getScriptProperties().setProperty('UNIT_PRICES_JSON', text);
  ui.alert('저장 완료. 이제 seedUnitPriceDb() 를 실행하세요.');
}

function seedUnitPriceDb() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = getOrCreate(ss, '단가DB', UNIT_DB_HEADERS);
  var ui = SpreadsheetApp.getUi();
  var json = PropertiesService.getScriptProperties().getProperty('UNIT_PRICES_JSON');
  if (!json) {
    ui.alert(
      'UNIT_PRICES_JSON 없음.\n\n'
      + '1) platform_v11.html 브라우저 콘솔:\n'
      + '   copy(JSON.stringify(EST_BUILTIN_DB_FALLBACK))\n'
      + '2) setUnitPricesJsonProperty() 실행 후 붙여넣기\n'
      + '3) seedUnitPriceDb() 재실행\n\n'
      + '또는 templates/단가DB.csv 를 단가DB 탭에 직접 붙여넣기'
    );
    return;
  }
  var raw = JSON.parse(json);
  if (ws.getLastRow() > 1) {
    var ans = ui.alert('단가DB 덮어쓰기', raw.length + '품목으로 교체할까요?', ui.ButtonSet.YES_NO);
    if (ans !== ui.Button.YES) return;
    ws.deleteRows(2, ws.getLastRow() - 1);
  }
  var version = (readEstConfig(ss).VERSION || '2026-H1').toString();
  var rows = [];
  for (var i = 0; i < raw.length; i++) {
    rows.push([
      i + 1, version, raw[i].cat, raw[i].spec, raw[i].unit,
      raw[i].price, 1.0, 'Y', '국토부 표준시장단가'
    ]);
  }
  ws.getRange(2, 1, 1 + rows.length, UNIT_DB_HEADERS.length).setValues(rows);
  ui.alert('단가DB ' + rows.length + '품목 입력 완료 (version: ' + version + ')');
}

function testUnitPrices() {
  var out = getUnitPricesResponse({ region: 'SEOSAN' });
  Logger.log(out.getContent());
}

function getActiveUnitVersion(ss) {
  var cfg = readEstConfig(ss);
  if (cfg.VERSION) return String(cfg.VERSION).trim();
  var ws = ss.getSheetByName('단가DB');
  if (!ws || ws.getLastRow() < 2) return '';
  var rows = ws.getDataRange().getValues();
  var best = '';
  for (var i = 1; i < rows.length; i++) {
    var v = String(rows[i][1] || '').trim();
    if (v && (!best || v > best)) best = v;
  }
  return best;
}

function readEstConfig(ss) {
  var ws = ss.getSheetByName('적산설정');
  var out = {};
  if (!ws) return out;
  var rows = ws.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    if (!k) continue;
    out[k] = rows[i][1];
  }
  return out;
}

function readUnitRatios(ss) {
  var ws = ss.getSheetByName('재료비율');
  if (!ws) return [];
  var rows = ws.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < rows.length; i++) {
    var cat = String(rows[i][0] || '').trim();
    if (!cat) continue;
    list.push({
      cat: cat,
      mat: parseFloat(rows[i][1]) || 0.45,
      lab: parseFloat(rows[i][2]) || 0.48,
      exp: parseFloat(rows[i][3]) || 0.07
    });
  }
  return list;
}

function readUnitPrices(ss, version, regionKey) {
  var ws = ss.getSheetByName('단가DB');
  if (!ws) return [];
  var cfg = readEstConfig(ss);
  var regionFactor = 1.0;
  if (regionKey && cfg['REGION_' + regionKey.toUpperCase()]) {
    regionFactor = parseFloat(cfg['REGION_' + regionKey.toUpperCase()]) || 1.0;
  } else if (cfg.REGION_DEFAULT) {
    regionFactor = parseFloat(cfg.REGION_DEFAULT) || 1.0;
  }

  var rows = ws.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var active = String(row[7] || 'Y').trim().toUpperCase();
    if (active === 'N' || active === 'NO' || active === '0') continue;
    var ver = String(row[1] || '').trim();
    if (version && ver !== version) continue;
    var cat = String(row[2] || '').trim();
    var spec = String(row[3] || '').trim();
    if (!cat || !spec) continue;
    var basePrice = parseFloat(row[5]) || 0;
    if (basePrice <= 0) continue;
    var rowFactor = parseFloat(row[6]);
    if (isNaN(rowFactor) || rowFactor <= 0) rowFactor = 1.0;
    var price = Math.round(basePrice * regionFactor * rowFactor);
    items.push({
      id: row[0] || i,
      cat: cat,
      spec: spec,
      unit: String(row[4] || '㎡').trim(),
      price: price,
      priceBase: basePrice,
      note: String(row[8] || '').trim()
    });
  }
  return items;
}

function getUnitPricesResponse(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var version = (p && p.version) ? String(p.version).trim() : getActiveUnitVersion(ss);
    var region = (p && p.region) ? String(p.region).trim() : '';
    var items = readUnitPrices(ss, version, region);
    var ratios = readUnitRatios(ss);
    var config = readEstConfig(ss);
    return jsonResponse({
      status:  'ok',
      source:  items.length ? 'sheets' : 'empty',
      version: version || 'none',
      region:  region || 'default',
      count:   items.length,
      items:   items,
      ratios:  ratios,
      config:  config
    });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message, items: [], count: 0 });
  }
}

function handleLeadSave(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = getOrCreate(ss, '사업수지표_리드',
      ['수집일시','성명','연락처','관심개발유형','개인정보동의']);
    sh.appendRow([
      p.dt       || new Date().toLocaleString('ko-KR'),
      p.name     || '',
      p.phone    || '',
      p.interest || '',
      p.agree    || 'Y'
    ]);
    // 관리자 알림 (신규 리드)
    try {
      MailApp.sendEmail(ADMIN_EMAIL,
        '[가치잇다] 사업수지표 신규 이용 — ' + (p.name||'') + ' ' + (p.phone||''),
        '성명: ' + (p.name||'') + '\n'
        + '연락처: ' + (p.phone||'') + '\n'
        + '관심유형: ' + (p.interest||'미선택') + '\n'
        + '수집일시: ' + (p.dt||'')
      );
    } catch(e2) {}
    return jsonResponse({ ok: true });
  } catch(e) {
    return jsonResponse({ ok: false, error: e.message });
  }
}


// ════════════════════════════════════════════════════════════════
// 공통 유틸
// ════════════════════════════════════════════════════════════════

// 시트 없으면 생성 + 헤더 설정
function getOrCreate(ss, name, headers) {
  var ws = ss.getSheetByName(name);
  if (!ws) {
    ws = ss.insertSheet(name);
    var r = ws.getRange(1, 1, 1, headers.length);
    r.setValues([headers]);
    r.setBackground('#1a3a5c');
    r.setFontColor('#ffffff');
    r.setFontWeight('bold');
    ws.setFrozenRows(1);
  }
  return ws;
}

// JSON 응답
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ════════════════════════════════════════════════════════════════
// 견적서 비교표 시트 자동 생성
// ════════════════════════════════════════════════════════════════
function createQuoteSheet(data) {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = data.id + '_' + (data.clientName||'고객');

  var existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  var ws = ss.insertSheet(sheetName);

  function setHeader(range, text, bg, color) {
    bg = bg||'#1a3a5c'; color = color||'#ffffff';
    try { range.merge(); } catch(e) {}
    range.setValue(text)
      .setBackground(bg).setFontColor(color)
      .setFontWeight('bold').setFontSize(11)
      .setVerticalAlignment('middle').setHorizontalAlignment('center');
  }
  function setLabel(range, text) {
    range.setValue(text)
      .setBackground('#e8edf2').setFontWeight('bold')
      .setFontSize(10).setVerticalAlignment('middle');
  }
  function setInput(range, text) {
    range.setValue(text||'').setBackground('#ffffff')
      .setFontSize(10).setVerticalAlignment('middle')
      .setBorder(true,true,true,true,false,false);
  }

  ws.setColumnWidth(1,180); ws.setColumnWidth(2,220);
  ws.setColumnWidth(3,220); ws.setColumnWidth(4,220);

  var row = 1;

  // 제목
  setHeader(ws.getRange(row,1,1,4), '가치잇다컨설팅 — 비교 견적서');
  ws.setRowHeight(row,40); row++;

  // 기본 정보
  var catNames = { design:'설계', construction:'시공', interior:'인테리어', repair:'집수리', realestate:'부동산개발', landpermit:'토지분석·인허가' };
  var infoData = [
    ['접수번호',    data.id],
    ['서비스 분류', catNames[data.category]||data.category],
    ['고객명',      data.clientName||''],
    ['연락처',      data.clientPhone||''],
    ['위치',        data.addr||''],
    ['규모·면적',   data.area||''],
    ['예산 범위',   data.budget||''],
    ['신청일시',    data.createdAt||''],
    ['배정 업체',   data.assigned||''],
    ['견적 유효기간','30일']
  ];

  setHeader(ws.getRange(row,1,1,4),'■ 기본 정보','#2c5282','#ffffff');
  ws.setRowHeight(row,28); row++;
  infoData.forEach(function(item) {
    setLabel(ws.getRange(row,1), item[0]);
    ws.getRange(row,2,1,3).merge().setValue(item[1])
      .setBackground('#fff').setFontSize(10).setVerticalAlignment('middle');
    ws.setRowHeight(row,24); row++;
  });

  row++;

  // 업체별 비교표
  var companies = (data.assigned||'업체A,업체B,업체C').split(',').map(function(s){return s.trim();});
  while (companies.length < 3) companies.push('업체'+(companies.length+1));

  setHeader(ws.getRange(row,1,1,4),'■ 업체별 견적 비교표','#2c5282','#ffffff');
  ws.setRowHeight(row,28); row++;

  setLabel(ws.getRange(row,1),'견적 항목');
  setHeader(ws.getRange(row,2),companies[0],'#52b788','#ffffff');
  setHeader(ws.getRange(row,3),companies[1],'#52b788','#ffffff');
  setHeader(ws.getRange(row,4),companies[2],'#52b788','#ffffff');
  ws.setRowHeight(row,32); row++;

  var items = getQuoteItems(data.category);
  items.forEach(function(item) {
    if (item.type==='section') {
      ws.getRange(row,1,1,4).merge().setValue('▶ '+item.label)
        .setBackground('#e8f4f0').setFontWeight('bold').setFontSize(10)
        .setVerticalAlignment('middle');
      ws.setRowHeight(row,26); row++;
    } else {
      setLabel(ws.getRange(row,1), item.label+(item.required?' *':''));
      setInput(ws.getRange(row,2),'');
      setInput(ws.getRange(row,3),'');
      setInput(ws.getRange(row,4),'');
      ws.setRowHeight(row,24); row++;
    }
  });

  row++;

  // 공통 필수 기재
  setHeader(ws.getRange(row,1,1,4),'■ 공통 필수 기재사항','#2c5282','#ffffff');
  ws.setRowHeight(row,28); row++;
  setLabel(ws.getRange(row,1),'항목');
  setHeader(ws.getRange(row,2),companies[0],'#52b788','#ffffff');
  setHeader(ws.getRange(row,3),companies[1],'#52b788','#ffffff');
  setHeader(ws.getRange(row,4),companies[2],'#52b788','#ffffff');
  ws.setRowHeight(row,28); row++;

  ['견적 유효기간','계약금 비율','중도금 비율','잔금 비율',
   '계약 해지 조건','하자보수 보증기간','분쟁 해결 방법','담당자 서명']
  .forEach(function(label) {
    setLabel(ws.getRange(row,1),label);
    setInput(ws.getRange(row,2),''); setInput(ws.getRange(row,3),''); setInput(ws.getRange(row,4),'');
    ws.setRowHeight(row,24); row++;
  });

  row++;

  // 관리자 메모
  setHeader(ws.getRange(row,1,1,4),'■ 관리자 메모','#718096','#ffffff');
  ws.setRowHeight(row,28); row++;
  ws.getRange(row,1,3,4).merge().setValue('')
    .setBackground('#fffbeb').setVerticalAlignment('top')
    .setBorder(true,true,true,true,false,false);
  ws.setRowHeight(row,80); row+=3;

  ws.getRange(1,1,row,4).setWrap(true);

  try {
    MailApp.sendEmail(ADMIN_EMAIL,
      '[가치잇다] 견적서 시트 생성 — '+sheetName,
      '접수번호: '+data.id+'\n고객: '+data.clientName+'\n배정업체: '+data.assigned
    );
  } catch(e) {}

  return sheetName;
}


// ════════════════════════════════════════════════════════════════
// 공종별 견적 항목 정의
// ════════════════════════════════════════════════════════════════
function getQuoteItems(category) {
  var items = {
    design: [
      {type:'section',label:'설계 범위'},
      {label:'건축설계 포함 여부',required:true},
      {label:'구조설계 포함 여부',required:true},
      {label:'설비설계 포함 여부',required:true},
      {label:'전기설계 포함 여부',required:true},
      {label:'소방설계 포함 여부',required:false},
      {label:'인허가 대행 포함 여부',required:true},
      {label:'구조계산서 포함 여부',required:true},
      {type:'section',label:'설계비'},
      {label:'설계비 총액 (VAT별도)',required:true},
      {label:'계약시 지급액',required:true},
      {label:'중간 지급액',required:true},
      {label:'납품시 지급액',required:true},
      {type:'section',label:'납품물'},
      {label:'납품 도면 종류·매수',required:true},
      {label:'구조계산서',required:false},
      {label:'설계설명서',required:false},
      {type:'section',label:'기간 및 조건'},
      {label:'설계 기간',required:true},
      {label:'설계변경 조건',required:true},
      {label:'저작권 귀속',required:true}
    ],
    construction: [
      {type:'section',label:'공종별 금액'},
      {label:'토공사비',required:false},
      {label:'기초·골조 공사비',required:true},
      {label:'지붕 공사비',required:false},
      {label:'창호 공사비',required:true},
      {label:'외부 마감 공사비',required:true},
      {label:'내부 마감 공사비',required:true},
      {label:'설비 공사비',required:true},
      {label:'전기 공사비',required:true},
      {label:'기타 공사비',required:false},
      {type:'section',label:'공사비 합계'},
      {label:'직접공사비 합계',required:true},
      {label:'간접공사비 (현장경비)',required:true},
      {label:'VAT (10%)',required:true},
      {label:'총 공사비 합계',required:true},
      {type:'section',label:'자재 및 시공 조건'},
      {label:'주요 자재 사양·브랜드',required:true},
      {label:'하도급 업체 목록',required:true},
      {label:'공사보험 가입 여부',required:true},
      {label:'현장정리·폐기물 처리',required:true},
      {type:'section',label:'기간 및 보증'},
      {label:'공사 기간',required:true},
      {label:'기성금 지급 조건',required:true},
      {label:'하자보수 보증기간',required:true}
    ],
    interior: [
      {type:'section',label:'공사 범위'},
      {label:'철거 공사 포함 여부',required:true},
      {label:'바닥 (자재 사양 포함)',required:true},
      {label:'벽 (도배·도장·타일)',required:true},
      {label:'천장 (마감 방식)',required:true},
      {label:'욕실 공사 범위',required:true},
      {label:'주방 공사 범위',required:true},
      {label:'창호·문 교체 여부',required:false},
      {label:'가구 포함 여부',required:true},
      {label:'조명 포함 여부',required:true},
      {type:'section',label:'금액'},
      {label:'공사비 총액 (VAT별도)',required:true},
      {label:'VAT (10%)',required:true},
      {label:'총액 합계',required:true},
      {label:'추가비용 발생 조건',required:true},
      {type:'section',label:'기간 및 조건'},
      {label:'시공 기간',required:true},
      {label:'도면 제공 여부',required:true},
      {label:'샘플 확인 절차',required:true},
      {label:'A/S 기간',required:true},
      {label:'잔금 지급 조건',required:true}
    ],
    repair: [
      {type:'section',label:'수리 항목별 내역'},
      {label:'철거 포함 여부',required:true},
      {label:'지붕·방수 공사',required:false},
      {label:'도배·장판 공사',required:false},
      {label:'욕실 수리',required:false},
      {label:'창호 교체',required:false},
      {label:'전기·조명',required:false},
      {label:'배관·누수',required:false},
      {label:'기타 수리 항목',required:false},
      {type:'section',label:'금액'},
      {label:'자재비',required:true},
      {label:'인건비',required:true},
      {label:'폐기물 처리비',required:true},
      {label:'총액 합계',required:true},
      {label:'추가 발생 공사 처리 방법',required:true},
      {type:'section',label:'기간 및 보증'},
      {label:'작업 기간',required:true},
      {label:'하자 보증기간',required:true}
    ],
    realestate: [
      {type:'section',label:'PM 용역 범위'},
      {label:'사업성 검토 포함 여부',required:true},
      {label:'인허가 대행 포함 여부',required:true},
      {label:'설계사 선정 지원',required:true},
      {label:'시공사 선정 지원',required:true},
      {label:'분양·임대 지원 범위',required:true},
      {type:'section',label:'수수료'},
      {label:'기본 용역비',required:true},
      {label:'단계별 지급 조건',required:true},
      {label:'성공보수 조건',required:true},
      {label:'정산 기준',required:true},
      {type:'section',label:'사업 일정'},
      {label:'착수~인허가 기간',required:true},
      {label:'설계~시공 기간',required:true},
      {label:'준공~분양 기간',required:false}
    ],
    landpermit: [
      {type:'section',label:'분석·검토 범위'},
      {label:'용도지역·지구 분석',required:true},
      {label:'건폐율·용적률 검토',required:true},
      {label:'인허가 가능 여부 검토',required:true},
      {label:'농지·산지 전용 포함 여부',required:true},
      {label:'개발행위허가 포함 여부',required:true},
      {label:'관계기관 협의 포함 여부',required:true},
      {label:'관련 법령 검토 범위',required:true},
      {type:'section',label:'납품물'},
      {label:'토지분석 보고서',required:true},
      {label:'인허가 신청 도서',required:true},
      {label:'관계기관 협의 결과',required:false},
      {type:'section',label:'용역비 및 기간'},
      {label:'용역비 총액',required:true},
      {label:'처리 기간',required:true},
      {label:'실패 시 환불 조건',required:true}
    ]
  };
  return items[category] || items['construction'];
}


// ════════════════════════════════════════════════════════════════
// 테스트 함수 (Apps Script 편집기에서 직접 실행)
// ════════════════════════════════════════════════════════════════
function testJoin() {
  handleContractorJoin(SpreadsheetApp.getActiveSpreadsheet(), {
    id:'JOIN-TEST', appliedAt:'2026-05-02', company:'테스트업체', ceo:'홍길동',
    phone:'010-1234-5678', joinType:'architect', regions:['서산시'], loginId:'test01', loginPw:'test123'
  });
}

function testConsult() {
  handleCalcConsult(SpreadsheetApp.getActiveSpreadsheet(), {
    id:'CONSULT-TEST', createdAt:'2026-05-02', name:'김철수',
    phone:'010-9876-5432', total:'28,000만원',
    summary:'단독주택 RC조 신축 100㎡', note:'설계 상담 원합니다'
  });
}

function testCreateQuote() {
  createQuoteSheet({
    id:'DES-123456', category:'design',
    clientName:'홍길동', clientPhone:'010-1234-5678',
    addr:'서산시 예천동', area:'100㎡', budget:'1억~2억',
    createdAt:'2026-05-02',
    assigned:'우리건축사사무소, 아인건축사사무소, 건축사사무소 터'
  });
}

function testBoard() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var sh  = getOrCreate(ss, '게시판_자유', ['ID','분류','제목','작성자','내용','날짜','조회수']);
  sh.appendRow([1,'일반','테스트 글','관리자','테스트 내용입니다.','2026-05-02',0]);
}
