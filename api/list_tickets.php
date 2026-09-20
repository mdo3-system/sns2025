<?php
/**
 * 上善如水 壁量計算WEB
 * チケット一覧取得CLI / API（管理者専用）
 */

$base = __DIR__ . '/../uploads/tickets';
$dirs = glob($base . '/*', GLOB_ONLYDIR);
$list = [];

foreach ($dirs as $d) {
    $jsonPath = $d . '/ticket.json';
    if (file_exists($jsonPath)) {
        $data = json_decode(file_get_contents($jsonPath), true);
        if ($data && ($data['status'] ?? 'open') === 'open') {
            $filesSummary = [];
            foreach ($data['files'] ?? [] as $f) {
                $filesSummary[] = $f['originalName'] ?? '';
            }
            $list[] = [
                'ticketId'     => $data['ticketId'] ?? basename($d),
                'submittedAt'  => $data['submittedAt'] ?? '',
                'userName'     => $data['userName'] ?? '',
                'userEmail'    => $data['userEmail'] ?? '',
                'postType'     => $data['postType'] ?? '',
                'category'     => $data['category'] ?? '',
                'title'        => $data['title'] ?? '',
                'filesCount'   => $data['filesCount'] ?? 0,
                'filesSummary' => implode(', ', $filesSummary),
                'status'       => $data['status'] ?? 'open'
            ];
        }
    }
}

usort($list, function ($a, $b) {
    return strcmp($b['submittedAt'], $a['submittedAt']);
});

echo json_encode($list, JSON_UNESCAPED_UNICODE);
