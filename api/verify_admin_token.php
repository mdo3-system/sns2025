<?php
/**
 * api/verify_admin_token.php - 管理者トークン検証API
 */

header('Content-Type: application/json; charset=UTF-8');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$token = trim($_GET['token'] ?? '');
if (empty($token)) {
    $inputJSON = file_get_contents('php://input');
    $data = json_decode($inputJSON, true);
    $token = trim($data['token'] ?? '');
}

if (empty($token)) {
    echo json_encode(['authenticated' => false, 'message' => 'トークンが指定されていません。']);
    exit;
}

$tokenFile = __DIR__ . '/../data/admin_tokens.json';
if (!file_exists($tokenFile)) {
    echo json_encode(['authenticated' => false, 'message' => 'トークンファイルが存在しません。']);
    exit;
}

$tokens = json_decode(file_get_contents($tokenFile), true) ?: [];

if (isset($tokens[$token])) {
    echo json_encode([
        'authenticated' => true,
        'email' => $tokens[$token]['email'] ?? 'admin',
        'no_expiry' => true
    ]);
} else {
    echo json_encode(['authenticated' => false, 'message' => '無効なトークンです。']);
}
