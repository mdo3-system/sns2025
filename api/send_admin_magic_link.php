<?php
/**
 * api/send_admin_magic_link.php - 管理者用マジックリンク送信API
 * 送信元: support@eie.tokyo
 * 有効期限: 管理者自身のアカウントのため期限なし（無期限トークン）
 */

header('Content-Type: application/json; charset=UTF-8');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$inputJSON = file_get_contents('php://input');
$data = json_decode($inputJSON, true);

$email = trim($data['email'] ?? '');
$password = trim($data['password'] ?? '');

// 許可された管理者メールアドレスまたは管理者パスワード
$allowedEmails = ['support@eie.tokyo', 'sns@eie.tokyo', 'info@eie.jp'];
$adminPassword = 'smile2350';

$tokenDir = __DIR__ . '/../data';
if (!is_dir($tokenDir)) {
    mkdir($tokenDir, 0755, true);
    file_put_contents($tokenDir . '/.htaccess', "Deny from all\n");
}

$tokenFile = $tokenDir . '/admin_tokens.json';
$tokens = [];
if (file_exists($tokenFile)) {
    $tokens = json_decode(file_get_contents($tokenFile), true) ?: [];
}

// パスワードによる即時認証の場合
if (!empty($password) && $password === $adminPassword) {
    $token = bin2hex(random_bytes(32));
    $tokens[$token] = [
        'email' => !empty($email) ? $email : 'admin@eie.jp',
        'created_at' => date('Y-m-d H:i:s'),
        'no_expiry' => true
    ];
    file_put_contents($tokenFile, json_encode($tokens, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode([
        'success' => true,
        'instant_login' => true,
        'token' => $token,
        'message' => '管理者認証に成功しました。（認証期限なし）'
    ]);
    exit;
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => '有効なメールアドレスを入力してください。']);
    exit;
}

// メールアドレスのドメインまたは登録チェック
$domain = substr(strrchr($email, "@"), 1);
$isAdminDomain = in_array(strtolower($email), $allowedEmails) || $domain === 'eie.tokyo' || $domain === 'eie.jp' || $domain === 'mdo3.com';

if (!$isAdminDomain) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '管理者専用アドレスのみ認証可能です。']);
    exit;
}

// 無期限トークン生成 (64文字)
$token = bin2hex(random_bytes(32));
$tokens[$token] = [
    'email' => $email,
    'created_at' => date('Y-m-d H:i:s'),
    'no_expiry' => true
];
file_put_contents($tokenFile, json_encode($tokens, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// マジックリンクURL (期限なし)
$loginUrl = "https://eie.jp/?admin_auth=" . urlencode($token);

// メール送信
$subjectText = "【eie.jp】管理者ログイン用マジックリンク（認証期限なし）";
$messageText = "上善如水 壁量計算WEB 管理者ポータル\r\n\r\n";
$messageText .= "以下のマジックリンクをクリックすると、管理者としてSNS投稿管理画面へログインできます。\r\n";
$messageText .= "一度認証されると、ブラウザに保存され期限なしでご利用いただけます。\r\n\r\n";
$messageText .= $loginUrl . "\r\n\r\n";
$messageText .= "※管理者以外の方には転送しないでください。\r\n";

mb_language("Japanese");
mb_internal_encoding("UTF-8");

$fromEmail = "support@eie.tokyo";
$fromName = "eie.jp 管理システム";
$encodedFromName = mb_encode_mimeheader($fromName, "ISO-2022-JP");

$headers = [];
$headers[] = "MIME-Version: 1.0";
$headers[] = "From: " . $encodedFromName . " <" . $fromEmail . ">";
$headers[] = "Reply-To: " . $fromEmail;
$headers[] = "Content-Type: text/plain; charset=ISO-2022-JP";
$headers[] = "Content-Transfer-Encoding: 7bit";
$headers[] = "X-Mailer: PHP/" . phpversion();

$headerStr = implode("\r\n", $headers);
$encodedSubject = mb_encode_mimeheader($subjectText, "ISO-2022-JP");
$bodyJIS = mb_convert_encoding($messageText, "ISO-2022-JP", "UTF-8");

$mailSent = @mail($email, $encodedSubject, $bodyJIS, $headerStr);

echo json_encode([
    'success' => true,
    'mail_sent' => $mailSent,
    'message' => '管理者宛てにマジックリンクを送信しました。メール内のリンクをクリックしてください。'
]);
