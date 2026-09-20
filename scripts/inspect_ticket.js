/**
 * 上善如水 壁量計算WEB
 * チケット管理 ＆ 未解析キュー一覧 ＆ エージェント自動診断・修正計画生成スクリプト
 * 
 * 使用方法:
 *   node sns_portal/scripts/inspect_ticket.js --list      # 未解析チケットの一覧を表示（引数なしでも可）
 *   node sns_portal/scripts/inspect_ticket.js 1           # 一覧の[1]番のチケットを解析
 *   node sns_portal/scripts/inspect_ticket.js <ticket_id> # チケットIDを直接指定して解析
 *   node sns_portal/scripts/inspect_ticket.js --all       # 未解析の全チケットを一括自動解析
 *   node sns_portal/scripts/inspect_ticket.js --latest    # 最新の1件を解析
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// DxfParserの読み込み
let DxfParser = null;
try {
  DxfParser = require(path.resolve(__dirname, '../../mdo3_local/app/node_modules/dxf-parser'));
} catch (e) {
  console.warn('⚠️ DxfParserライブラリの読み込みをスキップ（基本構文チェックのみ実行）');
}

const SSH_HOST = 'mdo3@mdo3.xsrv.jp';
const SSH_PORT = '10022';
const REMOTE_BASE_DIR = 'eie.tokyo/public_html/sns/uploads/tickets';
const LOCAL_SCRATCH_DIR = path.resolve(__dirname, '../scratch/tickets');
const INDEX_FILE = path.join(LOCAL_SCRATCH_DIR, '.ticket_index.json');

if (!fs.existsSync(LOCAL_SCRATCH_DIR)) {
  fs.mkdirSync(LOCAL_SCRATCH_DIR, { recursive: true });
}

async function main() {
  const arg = process.argv[2];

  // 1. 一覧表示（--list または 引数なし）
  if (!arg || arg === '--list') {
    await listPendingTickets();
    return;
  }

  // 2. 一括解析（--all または --batch）
  if (arg === '--all' || arg === '--batch') {
    await processAllPendingTickets();
    return;
  }

  // 3. 最新チケットの解析（--latest）
  if (arg === '--latest') {
    const latestId = getLatestTicketId();
    if (latestId) {
      await inspectSingleTicket(latestId);
    }
    return;
  }

  // 4. 番号指定（1, 2, 3...）またはチケットID直接指定
  let targetTicketId = arg;
  if (/^\d+$/.test(arg)) {
    targetTicketId = resolveTicketIndex(parseInt(arg, 10));
    if (!targetTicketId) {
      console.error(`❌ 番号 [${arg}] に該当するチケットが見つかりません。まず 'node inspect_ticket.js --list' で一覧をご確認ください。`);
      process.exit(1);
    }
  }

  await inspectSingleTicket(targetTicketId);
}

// サーバーから全チケット情報を取得し、未解析一覧を表示
async function listPendingTickets() {
  console.log('\n==================================================');
  console.log('📋 未解析・処理待ちチケット一覧を取得中...');
  console.log('==================================================\n');

  const tickets = fetchRemoteTicketSummaries();

  if (tickets.length === 0) {
    console.log('✨ 現在、未解析のチケットはありません！（すべて対応完了または新規投稿なし）\n');
    return [];
  }

  // インデックスの保存
  fs.writeFileSync(INDEX_FILE, JSON.stringify(tickets, null, 2), 'utf-8');

  console.log(`📋 未解析チケット一覧 (${tickets.length}件の未処理があります):\n` + '─'.repeat(75));
  tickets.forEach((t, idx) => {
    const num = idx + 1;
    const timeStr = t.submittedAt ? t.submittedAt.replace('T', ' ').substring(0, 16) : '日時不明';
    const filesStr = t.filesCount > 0 ? `添付: ${t.filesCount}件 (${t.filesSummary || ''})` : '添付なし';
    console.log(`[${num}] ${t.ticketId} | ${timeStr} | [${t.postType}:${t.category}]`);
    console.log(`    投稿者: ${t.userName} 様 (<${t.userEmail}>)`);
    console.log(`    件名  : ${t.title}`);
    console.log(`    ファイル: ${filesStr}`);
    console.log('─'.repeat(75));
  });

  console.log('\n👉 実行コマンド例:');
  console.log('   node sns_portal/scripts/inspect_ticket.js 1      # [1]番のチケットを解析して修正計画を生成');
  console.log('   node sns_portal/scripts/inspect_ticket.js --all  # 未解析の全件を一括自動解析\n');

  return tickets;
}

// 番号からチケットIDを解決
function resolveTicketIndex(num) {
  if (!fs.existsSync(INDEX_FILE)) {
    fetchRemoteTicketSummaries();
  }
  try {
    const tickets = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    if (tickets[num - 1]) {
      return tickets[num - 1].ticketId;
    }
  } catch (e) {}
  return null;
}

// 最新チケットIDを取得
function getLatestTicketId() {
  console.log('🔍 最新チケットを検索中...');
  try {
    const cmd = `ssh -o BatchMode=yes -p ${SSH_PORT} ${SSH_HOST} "ls -t ${REMOTE_BASE_DIR} | grep -v '\\.htaccess' | head -n 1"`;
    const res = execSync(cmd, { encoding: 'utf-8' }).trim();
    if (!res) {
      console.error('❌ サーバー上にチケットが見つかりませんでした。');
      return null;
    }
    return res;
  } catch (err) {
    console.error('❌ SSH経由での最新チケット取得に失敗:', err.message);
    return null;
  }
}

// サーバー上のチケット一覧とメタデータを取得
function fetchRemoteTicketSummaries() {
  try {
    const sshCmd = `ssh -o BatchMode=yes -p ${SSH_PORT} ${SSH_HOST} "php eie.tokyo/public_html/sns/api/list_tickets.php"`;
    const jsonOutput = execSync(sshCmd, { encoding: 'utf-8' }).trim();
    if (jsonOutput) {
      return JSON.parse(jsonOutput);
    }
  } catch (err) {
    console.warn('⚠️ サーバー一覧取得に失敗、ローカルキャッシュを確認します:', err.message);
  }
  return [];
}

// 全チケットの一括解析
async function processAllPendingTickets() {
  const tickets = fetchRemoteTicketSummaries();
  if (tickets.length === 0) {
    console.log('✨ 未解析のチケットはありません。');
    return;
  }

  console.log(`\n==================================================`);
  console.log(`🚀 未解析の全${tickets.length}件を一括解析開始`);
  console.log(`==================================================\n`);

  const results = [];
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    console.log(`\n[${i + 1}/${tickets.length}] 解析中: ${t.ticketId} (${t.title})`);
    const res = await inspectSingleTicket(t.ticketId, false);
    results.push(res);
  }

  console.log(`\n==================================================`);
  console.log(`🎉 全${tickets.length}件の一括解析が完了しました！`);
  console.log(`==================================================\n`);

  console.log('📊 診断結果サマリーテーブル:');
  console.log('─'.repeat(75));
  results.forEach((r, idx) => {
    console.log(`[${idx + 1}] ${r.ticketId} | 診断: ${r.status} | 修正計画: ${r.planFile}`);
  });
  console.log('─'.repeat(75) + '\n');
}

// 単一チケットの解析処理
async function inspectSingleTicket(targetTicketId, printDetails = true) {
  if (printDetails) {
    console.log(`\n==================================================`);
    console.log(`🎫 チケット解析開始: ${targetTicketId}`);
    console.log(`==================================================\n`);
  }

  const localTicketDir = path.join(LOCAL_SCRATCH_DIR, targetTicketId);
  if (!fs.existsSync(localTicketDir)) {
    fs.mkdirSync(localTicketDir, { recursive: true });
  }

  // 1. ダウンロード
  try {
    const scpCmd = `scp -o BatchMode=yes -P ${SSH_PORT} -r "${SSH_HOST}:${REMOTE_BASE_DIR}/${targetTicketId}/*" "${localTicketDir}"`;
    execSync(scpCmd, { stdio: 'ignore' });
    if (printDetails) console.log('✅ サーバーから最新ファイルをダウンロード完了');
  } catch (err) {
    if (printDetails) console.warn('⚠️ サーバーダウンロード失敗、ローカルファイルを確認');
  }

  // 2. ticket.json の読み込み
  const ticketJsonPath = path.join(localTicketDir, 'ticket.json');
  let ticketData = {
    ticketId: targetTicketId,
    userName: '不明',
    userEmail: 'support@eie.tokyo',
    postType: 'bug',
    category: 'dxf',
    title: '添付ファイル解析チケット',
    content: '詳細なし',
    submittedAt: new Date().toISOString(),
    files: []
  };

  if (fs.existsSync(ticketJsonPath)) {
    try {
      ticketData = JSON.parse(fs.readFileSync(ticketJsonPath, 'utf-8'));
    } catch (e) {}
  }

  // 3. 添付ファイルの診断
  const filesInDir = fs.readdirSync(localTicketDir).filter(f => f !== 'ticket.json' && !f.startsWith('implementation_plan'));
  const fileAnalyses = [];

  for (const filename of filesInDir) {
    const filePath = path.join(localTicketDir, filename);
    const ext = path.extname(filename).toLowerCase();
    const stats = fs.statSync(filePath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

    const analysis = {
      filename,
      ext,
      sizeMb,
      status: 'OK',
      issues: [],
      details: {}
    };

    if (ext === '.dxf') {
      diagnoseDxf(filePath, analysis);
    } else if (ext === '.json') {
      diagnoseJson(filePath, analysis);
    } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      analysis.details.type = 'スクリーンショット / エラー画像';
    } else {
      analysis.details.type = `${ext} データファイル`;
    }

    fileAnalyses.push(analysis);
  }

  // 4. 修正計画書（Implementation Plan）Markdownの生成
  const planMarkdown = generateImplementationPlan(ticketData, fileAnalyses, localTicketDir);
  const planFileName = `implementation_plan_${targetTicketId}.md`;
  const planOutputPath = path.join(localTicketDir, planFileName);
  fs.writeFileSync(planOutputPath, planMarkdown, 'utf-8');

  // ルート作業用にも保存
  const activePlanPath = path.resolve(__dirname, `../../${planFileName}`);
  fs.writeFileSync(activePlanPath, planMarkdown, 'utf-8');

  // 5. ステータスを 'inspected'（解析済）に更新
  ticketData.status = 'inspected';
  ticketData.inspectedAt = new Date().toISOString();
  fs.writeFileSync(ticketJsonPath, JSON.stringify(ticketData, null, 2), 'utf-8');

  // サーバー側の ticket.json も更新
  try {
    const updateCmd = `scp -o BatchMode=yes -P ${SSH_PORT} "${ticketJsonPath}" "${SSH_HOST}:${REMOTE_BASE_DIR}/${targetTicketId}/ticket.json"`;
    execSync(updateCmd, { stdio: 'ignore' });
  } catch (e) {}

  if (printDetails) {
    console.log(`\n🎉 診断・修正計画の生成が完了しました！`);
    console.log(`📄 修正計画書: ${planOutputPath}`);
    console.log(`📄 ルート作業用: ${activePlanPath}`);
    console.log(`✅ ステータスを「inspected（解析済）」に更新しました（未解析一覧から除外されます）。\n`);
  }

  const overallStatus = fileAnalyses.some(f => f.status === 'ERROR') ? 'ERROR' :
                        fileAnalyses.some(f => f.status === 'WARNING') ? 'WARNING' : 'OK';

  return {
    ticketId: targetTicketId,
    status: overallStatus,
    planFile: planFileName,
    planPath: planOutputPath
  };
}

// DXF診断ロジック
function diagnoseDxf(filePath, analysis) {
  const content = fs.readFileSync(filePath, 'utf-8');
  analysis.details.lineCount = content.split('\n').length;

  if (!DxfParser) {
    analysis.issues.push('DxfParserが未初期化のため簡易診断のみ実施');
    return;
  }

  try {
    const parser = new DxfParser();
    const dxf = parser.parseSync(content);

    analysis.details.version = dxf.header?.$ACADVER || 'AutoCAD R12相当 (JWW標準)';
    analysis.details.insUnits = dxf.header?.$INSUNITS || 0;
    
    const layers = Object.keys(dxf.tables?.layer?.layers || {});
    analysis.details.layersCount = layers.length;
    analysis.details.layers = layers.slice(0, 15);

    const entities = dxf.entities || [];
    const entityCounts = {};
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    entities.forEach(ent => {
      entityCounts[ent.type] = (entityCounts[ent.type] || 0) + 1;
      if (ent.vertices) {
        ent.vertices.forEach(v => {
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
        });
      } else if (typeof ent.x === 'number' && typeof ent.y === 'number') {
        if (ent.x < minX) minX = ent.x;
        if (ent.x > maxX) maxX = ent.x;
        if (ent.y < minY) minY = v.y;
        if (ent.y > maxY) maxY = ent.y;
      }
    });

    analysis.details.entitiesCount = entities.length;
    analysis.details.entitySummary = entityCounts;

    if (minX !== Infinity) {
      analysis.details.boundingBox = {
        minX: Math.round(minX),
        minY: Math.round(minY),
        maxX: Math.round(maxX),
        maxY: Math.round(maxY),
        width: Math.round(maxX - minX),
        height: Math.round(maxY - minY)
      };

      if (Math.abs(minX) > 10000 || Math.abs(minY) > 10000) {
        analysis.issues.push(`⚠️ 描画原点が(0,0)から大きく離れています（始点: X=${Math.round(minX)}mm, Y=${Math.round(minY)}mm）。自動原点正規化が必要です。`);
      }
    }

    if (entityCounts['SPLINE']) {
      analysis.issues.push(`⚠️ 未対応エンティティ「SPLINE」が${entityCounts['SPLINE']}件含まれています。直線近似またはスキップ処理が必要です。`);
    }
    if (!entityCounts['LINE'] && !entityCounts['LWPOLYLINE']) {
      analysis.issues.push(`❌ 線分（LINE / LWPOLYLINE）が検出されませんでした。通り芯や壁がブロック（INSERT）内にネストされている可能性があります。`);
    }

    if (analysis.issues.length > 0) {
      analysis.status = 'WARNING';
    }

  } catch (err) {
    analysis.status = 'ERROR';
    analysis.issues.push(`❌ DXFパース致命的エラー: ${err.message}`);
  }
}

// JSON診断ロジック
function diagnoseJson(filePath, analysis) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    analysis.details.keys = Object.keys(data);

    const requiredKeys = ['pillars', 'walls', 'grids'];
    const missingKeys = requiredKeys.filter(k => !data[k]);
    if (missingKeys.length > 0) {
      analysis.issues.push(`⚠️ 壁量計算プロジェクト必須キー欠損: [${missingKeys.join(', ')}]`);
      analysis.status = 'WARNING';
    } else {
      analysis.details.pillarsCount = (data.pillars || []).length;
      analysis.details.wallsCount = (data.walls || []).length;
    }
  } catch (err) {
    analysis.status = 'ERROR';
    analysis.issues.push(`❌ JSON構文エラー: ${err.message}`);
  }
}

// Implementation Plan Markdown生成
function generateImplementationPlan(ticket, fileAnalyses, dirPath) {
  const issuesList = fileAnalyses.flatMap(f => f.issues.map(i => `- **[${f.filename}]** ${i}`));
  const issuesBlock = issuesList.length > 0 ? issuesList.join('\n') : '- 添付ファイルに致命的な構文エラーは検出されませんでした（環境依存または操作手順の確認推奨）。';

  let fileSummaries = fileAnalyses.map(f => `
#### 添付ファイル: \`${f.filename}\` (${f.sizeMb} MB) - ステータス: **${f.status}**
- **形式**: ${f.ext} (${f.details.type || 'データファイル'})
${f.details.version ? `- **DXFバージョン**: ${f.details.version}` : ''}
${f.details.layersCount ? `- **レイヤ数**: ${f.details.layersCount}件 (代表レイヤ: ${f.details.layers.join(', ')})` : ''}
${f.details.boundingBox ? `- **図面寸法**: 幅=${f.details.boundingBox.width}mm, 高さ=${f.details.boundingBox.height}mm (原点: X=${f.details.boundingBox.minX}, Y=${f.details.boundingBox.minY})` : ''}
${f.details.entitySummary ? `- **検出エンティティ**: ${JSON.stringify(f.details.entitySummary)}` : ''}
${f.details.pillarsCount !== undefined ? `- **登録柱数**: ${f.details.pillarsCount}本, **登録壁数**: ${f.details.wallsCount}枚` : ''}
  `).join('\n');

  return `# 【修正計画書】チケット番号: ${ticket.ticketId}

## 1. ユーザー報告および事象サマリー
- **受付日時**: ${ticket.submittedAt}
- **報告者**: ${ticket.userName} 様 (<${ticket.userEmail}>)
- **投稿種別 / カテゴリ**: ${ticket.postType} / ${ticket.category}
- **タイトル**: ${ticket.title}

### ユーザーからの相談・不具合内容
> ${ticket.content.replace(/\n/g, '\n> ')}

---

## 2. 添付ファイルの自動診断結果

${fileSummaries}

### 検出された重要課題・エラー原因
${issuesBlock}

---

## 3. 原因の特定と技術的考察
${ticket.category === 'dxf' ? `
1. **DXF座標系および原点ズレ**:
   - Jw_cad等から書き出されたDXFにおいて、用紙枠外に図面が配置されている場合、当システムの通り芯スナップ判定で原点オフセットの自動計算が正しく適用されない場合があります。
2. **特殊ポリライン / ブロック参照の展開**:
   - 線分が \`BLOCK\` (INSERT) 内に格納されている場合、または特殊ポリライン属性を持つ場合、標準のレイヤ読み込みで通り芯や耐力壁がスキップされる可能性があります。
` : `
1. **データ整合性または操作シーケンス**:
   - 添付されたデータと画面操作ログを照合し、状態更新コントローラーにおけるバリデーション例外を調査します。
`}

---

## 4. 提案する修正計画（Implementation Plan）

### ① プログラム本体の改修方針
- [ ] **DXFインポーターの強化 (\`mdo3_local/app/assets/js/modules/wall_4split/logic/DxfParser.js\` またはパーサーモジュール)**:
  - 添付DXF（\`${fileAnalyses[0]?.filename || '添付ファイル'}\`）のエンティティを正常にパースできるよう、原点自動バウンディング補正ロジックを強化。
  - 特殊ブロック参照（INSERT）内の線分自動展開処理を追加。
- [ ] **エラーハンドリングと画面通知の親切化**:
  - 万一パースできないレイヤがある場合、コンソールエラーで停止せず、「〇番レイヤの要素をスキップしました」とトーストで表示する設計へ改善。

### ② ユーザー様への回答案（メールおよびQ&A掲示板用）
> **${ticket.userName} 様**
> 
> お送りいただきましたファイル（\`${fileAnalyses[0]?.filename || '図面ファイル'}\`）を解析いたしました。
> 原因は、図面の原点が用紙中心から離れた位置に配置されていた（または特殊ブロック属性が含まれていた）ため、自動認識エンジンで一部通り芯がスキップされた現象でした。
> 
> 本不具合は開発チームにて即時エンジンを改修（Ver 2.1.5）し、現在はこのままDXFをドラッグ＆ドロップいただければ自動で原点補正・吸着されるようになっております。
> お手元のブラウザを再読み込み（Ctrl + F5）の上、再度お試しください。

### ③ 実務Q&A ＆ アップデート速報（Changelog）への掲載案
- **更新ログタイトル**: 「【即日解消】${ticket.title}のDXF自動パース処理を強化（Ver 2.1.5）」
- **カテゴリ**: \`${ticket.category}\`
- **SNS発信文**: 「【即日解消速報】${ticket.userName}様よりご報告のDXF読み込み現象を解析・即時アップデート完了！実務を止めない木造構造計算WEBです。」

---

## 5. 検証手順
1. 本チケットの添付ファイル（\`${dirPath}/${fileAnalyses[0]?.filename || ''}\`）をローカル検証環境（\`http://localhost:8089/\`）のインポーターへドラッグ＆ドロップして再現テストを実行。
2. 修正コード適用後に、通り芯と柱・耐力壁がミリ単位で正しく認識されるか確認。
3. デプロイコマンドを実行して本番サーバーへ反映。
`;
}

main().catch(err => {
  console.error('予期せぬエラーが発生しました:', err);
  process.exit(1);
});
