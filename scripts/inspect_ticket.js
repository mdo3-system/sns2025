/**
 * 上善如水 壁量計算WEB
 * チケット添付ファイル自動取得 ＆ 診断 ＆ 修正計画（Implementation Plan）生成スクリプト
 * 
 * 使用方法:
 *   node sns_portal/scripts/inspect_ticket.js <ticket_id>
 *   node sns_portal/scripts/inspect_ticket.js --latest
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

async function main() {
  let targetTicketId = process.argv[2];

  if (!targetTicketId) {
    console.log('使用法: node inspect_ticket.js <ticket_id> または node inspect_ticket.js --latest');
    process.exit(1);
  }

  // 最新チケットの自動取得
  if (targetTicketId === '--latest') {
    console.log('🔍 XServerから最新のチケットIDを検索中...');
    try {
      const remoteListCmd = `ssh -o BatchMode=yes -p ${SSH_PORT} ${SSH_HOST} "ls -t ${REMOTE_BASE_DIR} | head -n 1"`;
      targetTicketId = execSync(remoteListCmd, { encoding: 'utf-8' }).trim();
      if (!targetTicketId) {
        console.error('❌ サーバー上にチケットが見つかりませんでした。');
        process.exit(1);
      }
      console.log(`✅ 最新チケットを検出: ${targetTicketId}`);
    } catch (err) {
      console.error('❌ SSH経由でのチケット一覧取得に失敗しました:', err.message);
      process.exit(1);
    }
  }

  console.log(`\n==================================================`);
  console.log(`🎫 チケット解析開始: ${targetTicketId}`);
  console.log(`==================================================\n`);

  const localTicketDir = path.join(LOCAL_SCRATCH_DIR, targetTicketId);
  if (!fs.existsSync(localTicketDir)) {
    fs.mkdirSync(localTicketDir, { recursive: true });
  }

  // 1. サーバーからチケットディレクトリをダウンロード
  console.log('📥 サーバーからチケットファイル一式をダウンロード中 (scp)...');
  try {
    const scpCmd = `scp -o BatchMode=yes -P ${SSH_PORT} -r "${SSH_HOST}:${REMOTE_BASE_DIR}/${targetTicketId}/*" "${localTicketDir}"`;
    execSync(scpCmd, { stdio: 'inherit' });
    console.log('✅ ダウンロード完了\n');
  } catch (err) {
    console.warn('⚠️ scpダウンロードに失敗したため、ローカル既存ファイルを確認します:', err.message);
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
    } catch (e) {
      console.warn('⚠️ ticket.jsonのパースに失敗しました。');
    }
  }

  // 3. 添付ファイルの診断
  console.log('🔍 添付ファイルの自動解析を実行中...');
  const filesInDir = fs.readdirSync(localTicketDir).filter(f => f !== 'ticket.json' && !f.startsWith('implementation_plan'));
  const fileAnalyses = [];

  for (const filename of filesInDir) {
    const filePath = path.join(localTicketDir, filename);
    const ext = path.extname(filename).toLowerCase();
    const stats = fs.statSync(filePath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`\n--- [ファイル診断] ${filename} (${sizeMb} MB) ---`);

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
      analysis.details.note = '画像ファイルを受信。目視またはOCRによる確認対象。';
      console.log('📸 画像ファイルを認識');
    } else {
      analysis.details.type = `${ext} データファイル`;
      console.log(`📁 汎用ファイル (${ext})`);
    }

    fileAnalyses.push(analysis);
  }

  // 4. 修正計画書（Implementation Plan）Markdownの自動生成
  console.log('\n📝 修正計画書（Implementation Plan）を生成中...');
  const planMarkdown = generateImplementationPlan(ticketData, fileAnalyses, localTicketDir);

  const planOutputPath = path.join(localTicketDir, `implementation_plan_${targetTicketId}.md`);
  fs.writeFileSync(planOutputPath, planMarkdown, 'utf-8');

  // ルートの作業用アーティファクトディレクトリにも保存（存在する場合）
  const activePlanPath = path.resolve(__dirname, `../../implementation_plan_${targetTicketId}.md`);
  fs.writeFileSync(activePlanPath, planMarkdown, 'utf-8');

  console.log(`\n🎉 診断・修正計画の生成が完了しました！`);
  console.log(`📄 保存先: ${planOutputPath}`);
  console.log(`📄 作業用: ${activePlanPath}`);
  console.log(`\n==================================================`);
  console.log(`管理者（運営者様）へ提示する準備が整いました。`);
  console.log(`==================================================\n`);
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
    analysis.details.insUnits = dxf.header?.$INSUNITS || 0; // 0=Unspecified, 4=mm
    
    // レイヤ一覧
    const layers = Object.keys(dxf.tables?.layer?.layers || {});
    analysis.details.layersCount = layers.length;
    analysis.details.layers = layers.slice(0, 15); // 最大15件
    console.log(`✅ DXFパース成功: バージョン=${analysis.details.version}, レイヤ数=${layers.length}`);

    // エンティティ集計
    const entities = dxf.entities || [];
    const entityCounts = {};
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    entities.forEach(ent => {
      entityCounts[ent.type] = (entityCounts[ent.type] || 0) + 1;

      // 座標範囲サンプリング
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
        if (ent.y < minY) minY = ent.y;
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

      // 原点ズレ判定（原点から10m以上離れている場合など）
      if (Math.abs(minX) > 10000 || Math.abs(minY) > 10000) {
        analysis.issues.push(`⚠️ 描画原点が(0,0)から大きく離れています（始点: X=${Math.round(minX)}mm, Y=${Math.round(minY)}mm）。自動原点正規化が必要です。`);
      }
    }

    // 特殊エンティティの警告
    if (entityCounts['SPLINE']) {
      analysis.issues.push(`⚠️ 未対応エンティティ「SPLINE」が${entityCounts['SPLINE']}件含まれています。直線近似またはスキップ処理が必要です。`);
    }
    if (entityCounts['ELLIPSE']) {
      analysis.issues.push(`⚠️ 「ELLIPSE」（楕円）が含まれています。`);
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
    console.error('❌ DXFパースエラー:', err.message);
  }
}

// JSON診断ロジック
function diagnoseJson(filePath, analysis) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    analysis.details.keys = Object.keys(data);

    // プロジェクトデータ特有のキーチェック
    const requiredKeys = ['pillars', 'walls', 'grids'];
    const missingKeys = requiredKeys.filter(k => !data[k]);
    if (missingKeys.length > 0) {
      analysis.issues.push(`⚠️ 壁量計算プロジェクト必須キー欠損: [${missingKeys.join(', ')}]`);
      analysis.status = 'WARNING';
    } else {
      analysis.details.pillarsCount = (data.pillars || []).length;
      analysis.details.wallsCount = (data.walls || []).length;
      console.log(`✅ プロジェクトJSON正常: 柱数=${analysis.details.pillarsCount}, 壁数=${analysis.details.wallsCount}`);
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
