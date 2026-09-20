<?php
/**
 * 上善如水 壁量計算WEB
 * 実務質疑・不具合報告 添付ファイル受付 ＆ チケット発行API
 * 
 * 管理者通知先: support@eie.tokyo
 */

header('Content-Type: application/json; charset=utf-8');

// エラー出力制御
ini_set('display_errors', 0);
error_reporting(E_ALL);

// POSTリクエストのみ許可
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

// 入力値のサニタイズ
$userName   = trim($_POST['userName'] ?? '');
$userEmail  = trim($_POST['userEmail'] ?? '');
$postType   = trim($_POST['postType'] ?? 'question');
$category   = trim($_POST['category'] ?? 'other');
$title      = trim($_POST['title'] ?? '');
$content    = trim($_POST['content'] ?? '');
$agreed     = trim($_POST['agreed'] ?? '0');

// 必須チェック
if (empty($userName) || empty($userEmail) || empty($title) || empty($content) || $agreed !== '1') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => '必須項目が入力されていないか、同意事項に同意されていません。']);
    exit;
}

// チケットIDの生成（例: ticket_20260920_161520_a8f9）
$timestamp = date('Ymd_His');
$randomSuffix = substr(bin2hex(random_bytes(4)), 0, 4);
$ticketId = "ticket_{$timestamp}_{$randomSuffix}";

// 保存先ディレクトリの作成
$baseUploadDir = __DIR__ . '/../uploads/tickets/' . $ticketId;
if (!is_dir($baseUploadDir)) {
    mkdir($baseUploadDir, 0755, true);
}

// 許可拡張子
$allowedExts = ['dxf', 'json', 'png', 'jpg', 'jpeg', 'txt', 'log', 'zip'];
$maxFileSize = 20 * 1024 * 1024; // 20MB
$uploadedFiles = [];
$totalSize = 0;

// ファイル処理
if (!empty($_FILES['files']) && is_array($_FILES['files']['name'])) {
    $fileCount = count($_FILES['files']['name']);
    
    for ($i = 0; $i < $fileCount; $i++) {
        if ($_FILES['files']['error'][$i] !== UPLOAD_ERR_OK) {
            continue;
        }

        $origName = $_FILES['files']['name'][$i];
        $tmpName  = $_FILES['files']['tmp_name'][$i];
        $size     = $_FILES['files']['size'][$i];
        $ext      = strtolower(pathinfo($origName, PATHINFO_EXTENSION));

        // 拡張子チェック
        if (!in_array($ext, $allowedExts, true)) {
            continue;
        }

        // サイズチェック
        $totalSize += $size;
        if ($totalSize > $maxFileSize) {
            break;
        }

        // 安全なファイル名に変換（英数字＋元の拡張子）
        $safeName = sprintf("file_%02d_%s.%s", $i + 1, preg_replace('/[^a-zA-Z0-9_\-]/', '_', pathinfo($origName, PATHINFO_FILENAME)), $ext);
        $destPath = $baseUploadDir . '/' . $safeName;

        if (move_uploaded_file($tmpName, $destPath)) {
            $uploadedFiles[] = [
                'originalName' => $origName,
                'savedName'    => $safeName,
                'extension'    => $ext,
                'sizeBytes'    => $size,
                'sizeMb'       => round($size / (1024 * 1024), 2),
                'savedPath'    => "uploads/tickets/{$ticketId}/{$safeName}"
            ];
        }
    }
}

// チケット情報の構造化
$ticketData = [
    'ticketId'    => $ticketId,
    'submittedAt' => date('c'),
    'userName'    => $userName,
    'userEmail'   => $userEmail,
    'postType'    => $postType,
    'category'    => $category,
    'title'       => $title,
    'content'     => $content,
    'agreed'      => true,
    'filesCount'  => count($uploadedFiles),
    'files'       => $uploadedFiles,
    'status'      => 'open',
    'userAgent'   => $_SERVER['HTTP_USER_AGENT'] ?? '',
    'ipAddress'   => $_SERVER['REMOTE_ADDR'] ?? ''
];

// ticket.json として保存
file_put_contents($baseUploadDir . '/ticket.json', json_encode($ticketData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// 管理者宛てメール通知（support@eie.tokyo）
$adminEmail = 'support@eie.tokyo';
$mailSubject = "【質疑・不具合報告】[{$postType}:{$category}] {$title} ({$ticketId})";

$fileListText = "";
if (count($uploadedFiles) > 0) {
    foreach ($uploadedFiles as $f) {
        $fileListText .= "・{$f['originalName']} ({$f['sizeMb']} MB) [保存名: {$f['savedName']}]\n";
    }
} else {
    $fileListText = "（添付ファイルなし）\n";
}

$postTypeLabel = [
    'question' => '💬 実務質問・操作相談',
    'bug'      => '⚡ 不具合・エラー報告（最優先）',
    'request'  => '💡 機能改善・ご要望'
][$postType] ?? $postType;

$mailBody = <<<MAIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【上善如水 壁量計算WEB】実務質疑・不具合報告を受信しました
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 受付チケット番号 : {$ticketId}
■ 受付日時         : {$ticketData['submittedAt']}
■ 投稿種別         : {$postTypeLabel}
■ 該当カテゴリ     : {$category}
■ 投稿者名 / 事務所 : {$userName}
■ 返信用メール     : {$userEmail}

■ タイトル:
{$title}

■ 質問・報告内容:
{$content}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 添付ファイル ({$ticketData['filesCount']} 件):
{$fileListText}
■ サーバー内保存パス:
eie.tokyo/public_html/sns/uploads/tickets/{$ticketId}/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
※AIエージェント（Antigravity）が自動でDXF構文・データを読込・診断し、
　修正計画書（Implementation Plan）を提示します。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MAIL;

// メール送信ヘッダー
$headers  = "From: 上善如水WEBサポート <support@eie.tokyo>\r\n";
$headers .= "Reply-To: {$userEmail}\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

mb_language("Japanese");
mb_internal_encoding("UTF-8");
@mb_send_mail($adminEmail, $mailSubject, $mailBody, $headers);

// 正常レスポンス返却
echo json_encode([
    'success'    => true,
    'ticketId'   => $ticketId,
    'filesCount' => count($uploadedFiles),
    'message'    => 'ご投稿を受け付けました。管理者およびAIエージェントに通知されました。'
], JSON_UNESCAPED_UNICODE);
